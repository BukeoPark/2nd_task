"""상가업소(소상공인) ↔ 인허가(LOCALDATA) 매장 연결.

실행: .venv/bin/python -m pipelines.transform.link_store_licenses
입력: data/processed/{stores,industry_taxonomy,licenses,license_sources}.parquet
출력: data/processed/store_license_links.parquet  (인허가 원천이 연결된 업종의 매장만, 매장 1행)
      outputs/tables/store_license_link_summary.csv

판정 기준 (상호만 같다고 연결하지 않는다)
  후보      : 대응표상 같은 인허가 원천 + (반경 CANDIDATE_RADIUS_M 이내 또는 도로명/지번 주소 키 일치)
  강한 일치 : 상호 일치(정규화 후 동일 또는 3자 이상 포함) + 지점 충돌 없음 + 주소 키 일치
  약한 일치 : 상호 동일 + 지점 충돌 없음 + 주소 불일치/미상 + 거리 WEAK_RADIUS_M 이내

link_status
  matched            영업·휴업 중인 인허가와 강한 일치 1건(같은 원천 안에서 유일)
  ambiguous          같은 원천에서 서로 다른 인허가가 강하게 일치하거나, 한 인허가를 상호가 다른 매장이 공유
  needs_check        약한 일치만 있음 → '매장 연결 확인 필요'
  closed_only        폐업·말소 인허가와만 일치 → 과거 이력일 수 있어 현재 매장에 붙이지 않음
  no_match           후보 없음
  source_missing_gu  대응 원천이 매장 소재 구에서 제공되지 않음
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.neighbors import BallTree

from pipelines.common import config
from pipelines.common.matching import branch_conflict, jibun_key, name_relation, norm_name, road_key

CANDIDATE_RADIUS_M = 150.0
WEAK_RADIUS_M = 30.0
EARTH_R = 6_371_008.8
ACTIVE = {"active", "suspended"}


def main() -> None:
    stores = pd.read_parquet(config.PROCESSED_DIR / "stores.parquet")
    tax = pd.read_parquet(config.PROCESSED_DIR / "industry_taxonomy.parquet").set_index("indsSclsCd")
    lic = pd.read_parquet(config.PROCESSED_DIR / "licenses.parquet")
    src = pd.read_parquet(config.PROCESSED_DIR / "license_sources.parquet")
    available = set(zip(src["license_code"], src["sigungu_cd"]))

    target = stores.loc[stores["indsSclsCd"].map(tax["status"]).eq("connected")].copy()
    print(f"대상 매장(인허가 원천 연결 업종): {len(target):,} / 전체 {len(stores):,}")

    geo = lic.dropna(subset=["lon", "lat"])
    tree = BallTree(np.radians(geo[["lat", "lon"]].to_numpy()), metric="haversine")
    near_idx = tree.query_radius(np.radians(target[["lat", "lon"]].to_numpy()), r=CANDIDATE_RADIUS_M / EARTH_R)
    geo_pos = geo.index.to_numpy()
    by_road = lic.dropna(subset=["road_key"]).groupby("road_key").groups
    by_jibun = lic.dropna(subset=["jibun_key"]).groupby("jibun_key").groups

    dup_counts = lic["dup_group"].value_counts()
    lic_lat, lic_lon = np.radians(lic["lat"].to_numpy()), np.radians(lic["lon"].to_numpy())
    out = []
    for i, s in enumerate(target.itertuples()):
        codes = [c for c in tax.at[s.indsSclsCd, "license_codes"] if (c, s.signguCd) in available]
        if not codes:
            out.append({"bizesId": s.bizesId, "link_status": "source_missing_gu"})
            continue
        core = norm_name(s.bizesNm)
        full = core + norm_name(s.brchNm)
        s_road, s_jibun = road_key(s.rdnmAdr), jibun_key(s.lnoAdr)

        cand = set(geo_pos[near_idx[i]])
        if s_road in by_road:
            cand |= set(by_road[s_road])
        if s_jibun in by_jibun:
            cand |= set(by_jibun[s_jibun])
        cand = [c for c in cand if lic.at[c, "license_code"] in codes]

        strong, weak = [], []
        for c in cand:
            ln = lic.at[c, "name_norm"]
            rel = name_relation(full, core, ln)
            if rel == "none" or branch_conflict(s.brchNm, ln, core):
                continue
            addr = (s_road is not None and s_road == lic.at[c, "road_key"]) or \
                   (s_jibun is not None and s_jibun == lic.at[c, "jibun_key"])
            if np.isnan(lic_lat[c]):
                dist = np.nan
            else:
                p1, l1 = np.radians(s.lat), np.radians(s.lon)
                a = np.sin((lic_lat[c] - p1) / 2) ** 2 + np.cos(p1) * np.cos(lic_lat[c]) * np.sin((lic_lon[c] - l1) / 2) ** 2
                dist = 2 * EARTH_R * np.arcsin(np.sqrt(a))
            rec = (c, rel, addr, dist)
            if addr:
                strong.append(rec)
            elif rel == "exact" and not np.isnan(dist) and dist <= WEAK_RADIUS_M:
                weak.append(rec)

        strong_active = [r for r in strong if lic.at[r[0], "status_norm"] in ACTIVE]
        row = {"bizesId": s.bizesId, "n_candidates": len(cand), "store_core": core, "store_road_key": s_road}
        if strong_active:
            # 같은 원천에서 중복 인허가(dup_group 동일)는 1건으로 본다
            groups = {}
            for r in strong_active:
                groups.setdefault((lic.at[r[0], "license_code"], lic.at[r[0], "dup_group"]), r)
            per_code = pd.Series([k[0] for k in groups]).value_counts()
            primary = sorted(groups.values(), key=lambda r: (codes.index(lic.at[r[0], "license_code"]),
                                                            -lic.at[r[0], "permit_date"].value))[0]
            status = "ambiguous" if (per_code > 1).any() else "matched"
            row.update(link_status=status, license_id=lic.at[primary[0], "license_id"],
                       license_code=lic.at[primary[0], "license_code"], name_relation=primary[1],
                       addr_match=True, distance_m=None if np.isnan(primary[3]) else round(float(primary[3]), 1),
                       other_license_ids=[lic.at[r[0], "license_id"] for r in groups.values() if r is not primary],
                       n_dup_licenses=int(dup_counts[lic.at[primary[0], "dup_group"]] - 1))
        elif strong:
            row.update(link_status="closed_only",
                       other_license_ids=sorted(lic.at[r[0], "license_id"] for r in strong))
        elif any(lic.at[r[0], "status_norm"] in ACTIVE for r in weak):
            best = min((r for r in weak if lic.at[r[0], "status_norm"] in ACTIVE), key=lambda r: r[3])
            row.update(link_status="needs_check", license_id=lic.at[best[0], "license_id"],
                       license_code=lic.at[best[0], "license_code"], name_relation=best[1], addr_match=False,
                       distance_m=round(float(best[3]), 1))
        else:
            row.update(link_status="no_match")
        out.append(row)

    links = pd.DataFrame(out)
    # 한 인허가를 상호·주소가 다른 매장 여러 곳이 가져가면 모두 확인 필요로 내린다.
    # (상가업소 쪽 중복 등록 — 같은 상호·주소 — 은 같은 매장이므로 허용)
    claimed = links.loc[links["link_status"] == "matched"]
    distinct = claimed.groupby("license_id").apply(lambda g: g[["store_core", "store_road_key"]].drop_duplicates().shape[0],
                                                  include_groups=False)
    shared = set(distinct[distinct > 1].index)
    mask = links["license_id"].isin(shared) & links["link_status"].eq("matched")
    links.loc[mask, "link_status"] = "ambiguous"
    print(f"  - 상호·주소가 다른 매장이 같은 인허가를 가리켜 ambiguous 로 내림: {int(mask.sum())}건")

    links = links.drop(columns=["store_core", "store_road_key"])
    links.to_parquet(config.PROCESSED_DIR / "store_license_links.parquet", index=False)
    summary = links.merge(stores[["bizesId", "indsLclsNm"]], on="bizesId").pivot_table(
        index="indsLclsNm", columns="link_status", values="bizesId", aggfunc="count", fill_value=0)
    summary.to_csv(config.TABLES_DIR / "store_license_link_summary.csv")
    print(links["link_status"].value_counts().to_string())
    print(summary.to_string())


if __name__ == "__main__":
    main()
