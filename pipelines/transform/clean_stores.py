"""raw/sbiz 상가업소 원본을 정제해 분석용 stores / anchor_stores 로 만든다.

실행
----
프로젝트 루트에서: .venv/bin/python -m pipelines.transform.clean_stores

입력: data/raw/sbiz/sangga_<시군구코드>_<시군구명>_<YYYYMMDD>.json
      (시군구별로 날짜가 여러 개면 가장 최근 파일 사용)

출력 (data/processed/)
--------------------
stores.parquet         : 파일럿 시군구 전체 상가업소. bizesId 중복 제거, 좌표 이상치 제외.
anchor_stores.parquet  : 상호명이 config.ANCHOR_BRANDS 패턴에 매칭되는 앵커 브랜드 매장.

outputs/tables/clean_stores_summary.csv
    시군구별 원본 건수 / 중복 제거 건수 / 좌표 이상치 제외 건수 / 최종 건수,
    브랜드별 앵커 매장 수를 기록한다 (제외 기준·건수 추적용).
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import pandas as pd

from pipelines.common import config

RAW_SBIZ_DIR = config.RAW_DIR / "sbiz"

# 대한민국 대략 경위도 범위 (좌표 이상치 필터용, 엄격한 검증이 아니라 명백한 오류만 걸러냄)
KOREA_LON = (124.0, 132.0)
KOREA_LAT = (33.0, 43.0)

KEEP_COLS = [
    "bizesId", "bizesNm", "brchNm",
    "indsLclsCd", "indsLclsNm", "indsMclsCd", "indsMclsNm", "indsSclsCd", "indsSclsNm",
    "ksicCd", "ksicNm",
    "ctprvnCd", "ctprvnNm", "signguCd", "signguNm", "adongCd", "adongNm", "ldongCd", "ldongNm",
    "lnoAdr", "rdnmAdr", "bldNm",
    "lon", "lat",
]


def _latest_raw_file(sigungu_cd: str) -> Path:
    candidates = sorted(RAW_SBIZ_DIR.glob(f"sangga_{sigungu_cd}_*_*.json"))
    if not candidates:
        raise SystemExit(
            f"{sigungu_cd} 원본이 없습니다. 먼저 실행: "
            f"python -m pipelines.collect.collect_sbiz_stores --sigungu {sigungu_cd}"
        )
    return candidates[-1]  # 파일명 끝이 YYYYMMDD 라 정렬하면 최신이 마지막


def _load_raw(sigungu_cd: str) -> pd.DataFrame:
    path = _latest_raw_file(sigungu_cd)
    with path.open(encoding="utf-8") as f:
        raw = json.load(f)
    df = pd.DataFrame(raw["items"])
    df["_source_file"] = path.name
    return df


def _match_anchor_brand(name: str) -> str | None:
    if not isinstance(name, str):
        return None
    for brand, patterns in config.ANCHOR_BRANDS.items():
        for p in patterns:
            if re.search(re.escape(p), name, flags=re.IGNORECASE):
                return brand
    return None


def main() -> None:
    summary_rows = []
    all_clean = []

    for sigungu_cd, sigungu_nm in config.PILOT_SIGUNGU.items():
        raw = _load_raw(sigungu_cd)
        n_raw = len(raw)

        df = raw[[c for c in KEEP_COLS if c in raw.columns]].copy()

        n_before_dedup = len(df)
        df = df.drop_duplicates(subset="bizesId", keep="first")
        n_dup = n_before_dedup - len(df)

        coords = df[["lon", "lat"]].apply(pd.to_numeric, errors="coerce")
        valid = (
            coords["lon"].between(*KOREA_LON) & coords["lat"].between(*KOREA_LAT)
            & coords["lon"].notna() & coords["lat"].notna()
        )
        n_bad_coord = (~valid).sum()
        df = df.loc[valid].copy()
        df["lon"] = coords.loc[valid, "lon"]
        df["lat"] = coords.loc[valid, "lat"]

        all_clean.append(df)
        summary_rows.append(
            {
                "sigungu_cd": sigungu_cd, "sigungu_nm": sigungu_nm,
                "raw_count": n_raw, "dup_removed": n_dup,
                "invalid_coord_removed": int(n_bad_coord), "final_count": len(df),
            }
        )
        print(f"{sigungu_nm}({sigungu_cd}): raw={n_raw} 중복제거={n_dup} 좌표이상치제외={n_bad_coord} 최종={len(df)}")

    stores = pd.concat(all_clean, ignore_index=True)
    stores_path = config.PROCESSED_DIR / "stores.parquet"
    stores.to_parquet(stores_path, index=False)
    print(f"저장: {stores_path.relative_to(config.ROOT)} ({len(stores):,}건)")

    stores["brand"] = stores["bizesNm"].map(_match_anchor_brand)
    anchors = stores.loc[stores["brand"].notna(), [
        "bizesId", "brand", "bizesNm", "brchNm", "signguCd", "signguNm", "adongNm", "lon", "lat",
    ]].reset_index(drop=True)
    anchors_path = config.PROCESSED_DIR / "anchor_stores.parquet"
    anchors.to_parquet(anchors_path, index=False)
    print(f"저장: {anchors_path.relative_to(config.ROOT)} ({len(anchors):,}건)")

    brand_counts = (
        anchors.groupby(["signguNm", "brand"]).size().rename("count").reset_index()
        if len(anchors) else pd.DataFrame(columns=["signguNm", "brand", "count"])
    )
    print("앵커 브랜드 매장 수:")
    print(brand_counts.to_string(index=False) if len(brand_counts) else "  (매칭 없음)")

    summary = pd.DataFrame(summary_rows)
    summary_path = config.TABLES_DIR / "clean_stores_summary.csv"
    summary.to_csv(summary_path, index=False, encoding="utf-8-sig")
    print(f"저장: {summary_path.relative_to(config.ROOT)}")


if __name__ == "__main__":
    main()
