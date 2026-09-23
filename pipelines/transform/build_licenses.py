"""서울 구별 인허가(LOCALDATA) + 모범음식점 원본을 정규화한다.

실행: .venv/bin/python -m pipelines.transform.build_licenses
입력: data/raw/seoul_localdata/*.json (서비스별 최신 파일)
출력: data/processed/licenses.parquet          인허가 1행(MGTNO 기준)
      data/processed/model_restaurants.parquet  모범음식점 지정 1행
      data/processed/license_sources.parquet    서비스(업종코드×구)별 건수·기준일·폐업일 제공 여부
      outputs/tables/license_exclusions.csv     제외·보정 기준과 건수

원천 필드 차이(실제 응답 확인):
  - 업태명: 대부분 UPTAENM, 숙박업(031103)은 SNTUPTAENM
  - 지번주소: 대부분 SITEWHLADDR, 숙박업은 LOTNO_ADDR
  - 폐업일자 DCBYMD: 숙박업(031103)에는 필드 자체가 없음 → has_close_date=False (폐업일을 추정해 채우지 않는다)
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import numpy as np
import pandas as pd
from pyproj import Transformer

from pipelines.common import config
from pipelines.common.matching import jibun_key, norm_name, road_key
from pipelines.common.sources import LICENSE_SERVICES, LOCALDATA_CRS, license_name

RAW = config.RAW_DIR / "seoul_localdata"
STATE_NORM = {"01": "active", "02": "suspended", "03": "closed", "04": "cancelled", "05": "removed"}


def _latest_files(pattern: str) -> list[Path]:
    latest: dict[str, Path] = {}
    for p in sorted(RAW.glob(pattern)):
        service = re.sub(r"_\d{8}\.json$", "", p.name)
        latest[service] = p  # 정렬상 마지막(가장 최근 날짜)이 남는다
    return list(latest.values())


def _date(s: pd.Series) -> pd.Series:
    return pd.to_datetime(s.fillna("").astype(str).str.strip().str[:10], format="%Y-%m-%d", errors="coerce")


def _num(s: pd.Series) -> pd.Series:
    return pd.to_numeric(s.fillna("").astype(str).str.strip(), errors="coerce")


NEIS_STATE = {"개원": "01", "휴원": "02", "폐원": "03"}
NEIS_STATE_NAME = {"01": "영업/정상", "02": "휴업", "03": "폐업"}


def _neis_frames(sources: list[dict]) -> list[pd.DataFrame]:
    """NEIS 학원교습소정보(인증키로 수집된 경우에만 존재). 좌표가 없어 주소·상호로만 매장 연결된다."""
    frames = []
    for path in sorted((config.RAW_DIR / "neis").glob("acaInsTiInfo_*.json")):
        env = json.loads(path.read_text(encoding="utf-8"))
        rows = pd.DataFrame(env["rows"])
        sources.append({"service": f"acaInsTiInfo_{env['gu_nm']}", "license_code": "NEIS",
                        "license_name": license_name("NEIS"), "sigungu_cd": env["sigungu_cd"], "records": len(rows),
                        "has_close_date": False, "has_uptae": True, "collected_at": env["collected_at"][:10],
                        "source_updated_max": None})
        if rows.empty:
            continue
        state = rows["REG_STTUS_NM"].str.strip().map(NEIS_STATE).fillna("99")
        frames.append(pd.DataFrame({
            "license_id": rows["ACA_ASNUM"].str.strip(), "license_code": "NEIS", "license_name": license_name("NEIS"),
            "sigungu_cd": env["sigungu_cd"], "name": rows["ACA_NM"].str.strip(),
            "uptae": rows["ACA_INSTI_SC_NM"].str.strip(), "state_code": state,
            "state_name": state.map(NEIS_STATE_NAME).fillna(rows["REG_STTUS_NM"]), "detail_state": rows["REG_STTUS_NM"],
            "permit_date": _date(rows["REG_YMD"].str.replace(r"^(\d{4})(\d{2})(\d{2})$", r"\1-\2-\3", regex=True)),
            "close_date": pd.NaT, "has_close_date": False,
            "road_addr": rows["FA_RDNMA"].str.strip(), "jibun_addr": None, "lon": np.nan, "lat": np.nan,
            "source_service": f"acaInsTiInfo_{env['gu_nm']}", "collected_at": env["collected_at"][:10],
        }))
    return frames


def build_licenses() -> None:
    frames, sources, excl = [], [], []
    to_wgs = Transformer.from_crs(LOCALDATA_CRS, config.CRS_WGS84, always_xy=True)

    for path in _latest_files("LOCALDATA_*.json"):
        env = json.loads(path.read_text(encoding="utf-8"))
        rows = pd.DataFrame(env["rows"])
        code = env["code"]
        has_close = "DCBYMD" in rows.columns
        uptae_col = "UPTAENM" if "UPTAENM" in rows.columns else ("SNTUPTAENM" if "SNTUPTAENM" in rows.columns else None)
        jibun_col = "SITEWHLADDR" if "SITEWHLADDR" in rows.columns else ("LOTNO_ADDR" if "LOTNO_ADDR" in rows.columns else None)
        updated = _date(rows["UPDATEDT"]).max() if "UPDATEDT" in rows else pd.NaT
        sources.append({"service": env["service"], "license_code": code, "license_name": LICENSE_SERVICES[code].name,
                        "sigungu_cd": env["sigungu_cd"], "records": len(rows), "has_close_date": has_close,
                        "has_uptae": uptae_col is not None, "collected_at": env["collected_at"][:10],
                        "source_updated_max": None if pd.isna(updated) else updated.date().isoformat()})
        if rows.empty:
            continue

        x, y = _num(rows["X"]), _num(rows["Y"])
        lon, lat = to_wgs.transform(x.to_numpy(), y.to_numpy())
        df = pd.DataFrame({
            "license_id": rows["MGTNO"].str.strip(),
            "license_code": code,
            "license_name": LICENSE_SERVICES[code].name,
            "sigungu_cd": env["sigungu_cd"],
            "name": rows["BPLCNM"].str.strip(),
            "uptae": rows[uptae_col].fillna("").str.strip().replace("", None) if uptae_col else None,
            "state_code": rows["TRDSTATEGBN"],
            "state_name": rows["TRDSTATENM"],
            "detail_state": rows.get("DTLSTATENM"),
            "permit_date": _date(rows["APVPERMYMD"]),
            "close_date": _date(rows["DCBYMD"]) if has_close else pd.NaT,
            "has_close_date": has_close,
            "road_addr": rows["RDNWHLADDR"].fillna("").str.strip().replace("", None),
            "jibun_addr": rows[jibun_col].fillna("").str.strip().replace("", None) if jibun_col else None,
            "lon": lon, "lat": lat,
            "source_service": env["service"],
            "collected_at": env["collected_at"][:10],
        })
        frames.append(df)

    frames.extend(_neis_frames(sources))
    lic = pd.concat(frames, ignore_index=True)
    lic["status_norm"] = lic["state_code"].map(STATE_NORM).fillna("other")
    n0 = len(lic)

    # 1) 같은 관리번호가 두 번 나오면 하나만 남긴다(원천 식별자 기준 중복)
    dup_id = lic.duplicated(["license_id", "license_code"], keep="last")
    excl.append(("관리번호 중복 행 제거", int(dup_id.sum())))
    lic = lic.loc[~dup_id].copy()

    # 2) 좌표 이상치: 변환 실패 또는 파일럿 구역 밖(대략적 경계상자) → 좌표만 비운다(행은 유지)
    bad = ~lic["lon"].between(126.7, 127.1) | ~lic["lat"].between(37.4, 37.65) | lic["lon"].isna()
    excl.append(("좌표 없음·변환 실패·구역 밖 → 좌표만 비움(행 유지)", int(bad.sum())))
    lic.loc[bad, ["lon", "lat"]] = np.nan

    # 3) 인허가일 없음 → 코호트 계산에서만 제외(행 유지)
    excl.append(("인허가일 없음(코호트·연도별 개업 집계에서 제외)", int(lic["permit_date"].isna().sum())))
    closed_no_date = (lic["status_norm"] == "closed") & lic["close_date"].isna()
    excl.append(("폐업 상태이나 폐업일자 없음(폐업일 미제공 원천 포함) — 폐업 추이 집계에서 제외", int(closed_no_date.sum())))

    lic["name_norm"] = lic["name"].map(norm_name)
    lic["road_key"] = lic["road_addr"].map(road_key)
    lic["jibun_key"] = lic["jibun_addr"].map(jibun_key)

    # 4) 같은 업소가 관리번호만 달리해 여러 번 등록된 경우(상호·주소·인허가일 동일) 묶음 표시.
    #    행을 지우진 않고 집계 시 dup_group 단위로 한 번만 센다.
    addr_key = lic["road_key"].fillna(lic["jibun_key"])
    grp_cols = pd.DataFrame({"c": lic["license_code"], "n": lic["name_norm"], "a": addr_key,
                             "d": lic["permit_date"].dt.strftime("%Y%m%d")})
    has_key = grp_cols[["n", "a", "d"]].notna().all(axis=1) & (grp_cols["n"] != "")
    lic["dup_group"] = lic["license_id"]
    keyed = grp_cols.loc[has_key].astype(str).agg("|".join, axis=1)
    first_id = lic.loc[has_key].groupby(keyed)["license_id"].transform("first")
    lic.loc[has_key, "dup_group"] = first_id
    n_dup = int((lic["dup_group"] != lic["license_id"]).sum())
    excl.append(("상호·주소·인허가일이 같은 중복 인허가(집계 시 1건으로 셈)", n_dup))

    lic = lic.sort_values(["license_code", "license_id"], kind="stable").reset_index(drop=True)
    lic.to_parquet(config.PROCESSED_DIR / "licenses.parquet", index=False)
    pd.DataFrame(sources).sort_values(["license_code", "sigungu_cd"]).to_parquet(
        config.PROCESSED_DIR / "license_sources.parquet", index=False)
    pd.DataFrame(excl, columns=["기준", "건수"]).to_csv(config.TABLES_DIR / "license_exclusions.csv", index=False)
    print(f"저장: licenses.parquet {len(lic):,}건 (원본 {n0:,}) / 서비스 {len(sources)}개")
    for k, v in excl:
        print(f"  - {k}: {v:,}")


def build_model_restaurants() -> None:
    rows = []
    for path in _latest_files("*ModelRestaurantDesignate_*.json"):
        env = json.loads(path.read_text(encoding="utf-8"))
        for r in env["rows"]:
            rows.append({"license_id": r["PERM_NT_NO"].strip(), "name": r["UPSO_NM"].strip(),
                         "designated_date": pd.to_datetime(r["ASGN_YMD"], format="%Y%m%d", errors="coerce"),
                         "road_addr": r.get("SITE_ADDR_RD"), "uptae": r.get("SNT_UPTAE_NM"),
                         "sigungu_cd": env["sigungu_cd"], "source_service": env["service"],
                         "collected_at": env["collected_at"][:10]})
    df = pd.DataFrame(rows)
    df.to_parquet(config.PROCESSED_DIR / "model_restaurants.parquet", index=False)
    print(f"저장: model_restaurants.parquet {len(df)}건 (인허가번호 중복 {int(df.license_id.duplicated().sum())}건)")


if __name__ == "__main__":
    build_licenses()
    build_model_restaurants()
