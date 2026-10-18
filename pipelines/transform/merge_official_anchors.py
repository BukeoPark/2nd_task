"""앵커 브랜드(다이소) 매장을 공식 자료로 교차 검증해 anchor_stores.parquet 에 합친다 — merge_naver_anchors 를 대체한다.

배경
----
네이버 지역 검색(NAVER API HUB) 결과의 저장·재가공 이용 조건을 확인하지 못해(2차 보도상 저장·캐싱 금지) 그 출처의 앵커 좌표는 쓰지 않는다.
소상공인 상가정보의 상호 매칭만으로는 다이소가 대형마트·시장 안에 입점한 경우를 거의 못 잡으므로(22곳 중 2곳),
서울시 구별 인허가(LOCALDATA)에서 다이소가 의료기기판매(임대)업으로 등록한 사업장("(주)아성다이소 OO점")을 공식 보강 출처로 쓴다.

실행
----
프로젝트 루트에서: .venv/bin/python -m pipelines.transform.merge_official_anchors
(clean_stores → build_licenses 이후, compute_anchor_features 이전)

입력: data/processed/anchor_stores.parquet (clean_stores — 상가정보 상호 매칭), data/processed/licenses.parquet (build_licenses — LOCALDATA)
출력: data/processed/anchor_stores.parquet 갱신(네이버 출처 행·이전 인허가 보강 행을 지우고 다시 추가 → 여러 번 돌려도 같은 결과)
      outputs/tables/anchor_official_crosscheck.csv  검증표(채택·제외 사유 전부)

규칙(건수는 검증표·로그에 남긴다)
--------------------------------
1. 인허가 사업장명이 브랜드 패턴(config.ANCHOR_BRANDS)에 맞는 행만 본다.
2. 인허가상 '영업/정상'만 채택한다. 폐업·취소·휴업은 제외 — 인허가 상태이며 실제 영업과 다를 수 있다(현장 영업 여부는 확인되지 않음).
3. 좌표가 없는 행은 채택하지 않고 누락으로 기록한다(주소로 좌표를 만들어 넣지 않는다 — 이용 조건이 확인된 지오코딩이 없다).
4. 사업장 주소의 구가 인허가 수집 구와 다르거나 좌표가 파일럿 근처(수집 버퍼)를 벗어나면 제외한다.
5. 같은 브랜드의 다른 채택 행과 50m 이내면 같은 매장으로 보고 하나만 남긴다(인허가 우선).
6. 상가정보 매칭 매장과 50m 이내면 '상가정보+인허가'(교차 확인), 아니면 '인허가만'. 상가정보에만 있는 매장은 '상가정보만'으로 그대로 둔다.
"""
from __future__ import annotations

import re

import numpy as np
import pandas as pd

from pipelines.common import config
from pipelines.transform.anchor_metrics import haversine_m

ANCHOR_STORES_PATH = config.PROCESSED_DIR / "anchor_stores.parquet"
LICENSES_PATH = config.PROCESSED_DIR / "licenses.parquet"
OUT_TABLE = config.TABLES_DIR / "anchor_official_crosscheck.csv"
DEDUP_RADIUS_M = 50
OFFICIAL_BRANDS = ("daiso",)                           # 인허가로 보강하는 브랜드 — 스타벅스는 상가정보 매칭이 충분해 그대로 둔다
LICENSE_SOURCE = "localdata_license"
REMOVED_SOURCES = ("naver_local", LICENSE_SOURCE)      # 다시 만들기 전에 지우는 출처(멱등)
COLUMNS = ["bizesId", "brand", "bizesNm", "brchNm", "signguCd", "signguNm", "adongNm", "lon", "lat", "source"]
EXTRA = ["verification", "license_state", "license_ref_date", "license_permit_date"]


def _match_brand(name: str, brand: str) -> bool:
    return any(re.search(re.escape(p), name, flags=re.IGNORECASE) for p in config.ANCHOR_BRANDS[brand])


def _is_open(state: str) -> bool:
    return str(state or "").startswith("영업")


def build_rows(lic: pd.DataFrame, existing: pd.DataFrame, brand: str, buffer_ok) -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    """인허가 → (새로 더할 행, 검증표, 교차 확인된 기존 행 보강). existing = 같은 브랜드의 상가정보 매칭 매장(인덱스 유지). buffer_ok(lon, lat) → 수집 범위 안인지.
    상가정보 매장과 같은 매장으로 확인되면 새 행을 더하지 않고(이중 집계 방지) 그 행에 인허가 근거만 붙인다."""
    hits = lic[lic["name"].astype(str).map(lambda n: _match_brand(n, brand))].copy()
    rows, audit, upgrades = [], [], {}
    ref_lon, ref_lat = existing["lon"].to_numpy(dtype=float), existing["lat"].to_numpy(dtype=float)
    kept_xy: list[tuple[float, float]] = []
    for r in hits.sort_values(["state_name", "name", "license_id"]).itertuples():
        lon, lat = (float(r.lon) if pd.notna(r.lon) else np.nan), (float(r.lat) if pd.notna(r.lat) else np.nan)
        gu = config.PILOT_SIGUNGU.get(str(r.sigungu_cd))
        addr = str(r.road_addr or r.jibun_addr or "")
        rec = {"license_id": r.license_id, "name": r.name, "state": r.state_name, "address": addr, "lon": lon, "lat": lat, "permit_date": r.permit_date, "ref_date": str(r.collected_at)[:10],
               "decision": "", "reason": "", "verification": ""}
        if not _is_open(r.state_name):
            rec.update(decision="제외", reason=f"인허가 상태 '{r.state_name}'(영업 아님)")
        elif np.isnan(lon) or np.isnan(lat):
            rec.update(decision="제외", reason="좌표 없음 — 주소로 좌표를 만들지 않아 누락으로 기록")
        elif gu and addr and gu not in addr:
            rec.update(decision="제외", reason=f"사업장 주소가 수집 구({gu})와 다름")
        elif not buffer_ok(lon, lat):
            rec.update(decision="제외", reason="좌표가 파일럿 수집 범위 밖")
        else:
            near_new = [haversine_m(lon, lat, x, y) for x, y in kept_xy]
            if near_new and min(near_new) <= DEDUP_RADIUS_M:
                rec.update(decision="제외", reason=f"같은 브랜드의 채택 매장과 {DEDUP_RADIUS_M}m 이내(중복)")
            else:
                d = haversine_m(np.array([lon]), np.array([lat]), ref_lon, ref_lat) if len(existing) else np.array([np.inf])
                ver = "상가정보+인허가" if float(np.min(d)) <= DEDUP_RADIUS_M else "인허가만"
                kept_xy.append((lon, lat))
                rec.update(decision="채택", reason="인허가상 영업·좌표 있음", verification=ver)
                if ver == "상가정보+인허가":
                    upgrades[existing.index[int(np.argmin(d))]] = {"verification": ver, "license_state": str(r.state_name), "license_ref_date": rec["ref_date"],
                                                                   "license_permit_date": None if pd.isna(r.permit_date) else str(r.permit_date)[:10]}
                    rec["reason"] = "인허가상 영업·좌표 있음(상가정보 매장과 같은 매장 — 새 행을 더하지 않고 근거만 붙임)"
                    audit.append(rec)
                    continue
                rows.append({"bizesId": f"LD:{r.license_id}", "brand": brand, "bizesNm": str(r.name), "brchNm": np.nan, "signguCd": str(r.sigungu_cd), "signguNm": gu, "adongNm": np.nan,
                             "lon": lon, "lat": lat, "source": LICENSE_SOURCE, "verification": ver, "license_state": str(r.state_name), "license_ref_date": rec["ref_date"],
                             "license_permit_date": None if pd.isna(r.permit_date) else str(r.permit_date)[:10]})
        audit.append(rec)
    return pd.DataFrame(rows, columns=COLUMNS + EXTRA), pd.DataFrame(audit), upgrades


def main() -> None:
    from pipelines.transform import build_bus_stops as bus      # 파일럿 + 버퍼 범위 판정(집객시설과 같은 기준)

    for p in (ANCHOR_STORES_PATH, LICENSES_PATH):
        if not p.exists():
            raise SystemExit(f"{p.relative_to(config.ROOT)} 가 없습니다. clean_stores·build_licenses 를 먼저 실행하세요.")
    base = pd.read_parquet(ANCHOR_STORES_PATH)
    if "source" not in base.columns:
        base["source"] = "sbiz_name_match"
    removed = base[base["source"].isin(REMOVED_SOURCES)]
    base = base[~base["source"].isin(REMOVED_SOURCES)].reset_index(drop=True)
    lic = pd.read_parquet(LICENSES_PATH)

    def buffer_ok(lon: float, lat: float) -> bool:
        g = bus.add_geography(pd.DataFrame({"lon": [lon], "lat": [lat], "coord_ok": [True]}))
        return bool(g["dist_to_pilot_m"].iloc[0] <= bus.BUFFER_M)

    parts, audits = [base], []       # base 는 아래에서 교차 확인 근거가 붙은 채로 합쳐진다
    for brand in OFFICIAL_BRANDS:
        rows, audit, upgrades = build_rows(lic, base[base["brand"] == brand], brand, buffer_ok)
        for idx, fields in upgrades.items():
            for k, v in fields.items():
                if k not in base.columns:
                    base[k] = None
                base.loc[idx, k] = v
        parts.append(rows)
        audit.insert(0, "brand", brand)
        audits.append(audit)
    merged = pd.concat([p for p in parts if len(p)], ignore_index=True)
    for c in EXTRA:
        if c not in merged.columns:
            merged[c] = None
    only_sbiz = (merged["source"] == "sbiz_name_match") & merged["verification"].isna()
    merged.loc[only_sbiz, "verification"] = "상가정보만"
    merged.to_parquet(ANCHOR_STORES_PATH, index=False)
    audit = pd.concat(audits, ignore_index=True) if audits else pd.DataFrame()
    OUT_TABLE.parent.mkdir(parents=True, exist_ok=True)
    audit.to_csv(OUT_TABLE, index=False, encoding="utf-8-sig")

    print(f"지운 행: {removed.groupby('source').size().to_dict() if len(removed) else {}} (네이버 출처 등 — 이용 조건 미확인)")
    if len(audit):
        print("인허가 검증 결과:", audit["decision"].value_counts().to_dict())
        print(audit.loc[audit["decision"] == "제외", "reason"].value_counts().to_string())
    print(f"저장: {ANCHOR_STORES_PATH.relative_to(config.ROOT)} — 총 {len(merged)}건")
    print(merged.groupby(["brand", "source"]).size().rename("count").reset_index().to_string(index=False))


if __name__ == "__main__":
    main()
