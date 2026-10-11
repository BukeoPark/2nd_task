"""`closed_only` 매장의 '인허가상 폐업 기록' 근거 판정 — 폐업 인허가 ID·폐업일·판정 근거 유형을 저장한다.

실행: .venv/bin/python -m pipelines.transform.build_closure_evidence
입력: data/processed/{stores,licenses,store_license_links}.parquet, data/raw/sbiz/sangga_*.json(기준월 stdrYm 만 읽음)
출력: data/processed/store_closure_evidence.parquet   closed_only 매장 1행 (판정 결과·근거·폐업 인허가 ID·폐업일)
      outputs/tables/store_closure_evidence_log.csv  판정 유형별 건수

배경: 연결 단계(link_store_licenses)는 같은 상호·주소의 폐업 인허가하고만 일치하는 매장을 `closed_only` 로 두고 `other_license_ids` 에
폐업 인허가 번호만 남긴다(재입점·상호 승계일 수 있어 폐업으로 연결하지 않는다). 여기서는 그 매장들 가운데 아래 보수적 근거가 있는 매장만
'인허가상 폐업 기록 확인'(confirmed)으로 올리고, 나머지는 사유와 함께 '영업 여부 미확인'(uncertain)으로 둔다.
실제 현장 폐업을 확정하는 판정이 아니다 — 인허가 자료에 폐업 기록이 있고 상충 신호가 없다는 뜻이다.

결격(하나라도 있으면 confirmed 가 될 수 없음)
  - 상호가 포함관계일 뿐 동일하지 않음(not_exact_name)        - 폐업 인허가가 서로 다른 건 2개 이상(multiple_closed_licenses)
  - 폐업일 결측 또는 취소·말소 상태(no_close_date / cancelled_or_removed)
  - 같은 건물(도로명 주소 키)에 같은 상호의 영업 인허가가 있음(same_name_active_license_in_building)
  - 반경 30m 안에 같은 상호의 영업 인허가가 있음(same_name_active_license_nearby)
  - 상가정보에 같은 상호·같은 주소가 중복 등록됨(duplicate_store_record)
근거 유형(결격이 없을 때만)
  - closed_after_snapshot : 마지막 폐업일이 상가정보 기준월 말일 이후 → 상가정보가 아직 반영하지 못한 시차로 설명된다
  - replaced_by_new_license : 폐업 이후 같은 건물·같은 인허가 원천에 다른 상호의 영업 인허가가 생겼고, 그 상호가 상가정보에도 등재됨
  이 외(폐업이 오래됐고 별도 증거 없음 등)는 uncertain — 같은 상호가 재입점한 경우와 구분할 수 없다.
한계: 상가정보에 층·호 정보가 없어 같은 건물의 다른 호실을 구분하지 못한다(건물 단위 비교).
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd
from sklearn.neighbors import BallTree

from pipelines.common import config
from pipelines.common.matching import branch_conflict, name_relation, norm_name, road_key

NEARBY_M = 30.0
EARTH_R = 6_371_008.8
ACTIVE = {"active", "suspended"}
CLOSED_OR_ENDED = {"closed", "cancelled", "removed"}
EVIDENCE_AFTER_SNAPSHOT = "closed_after_snapshot"
EVIDENCE_REPLACED = "replaced_by_new_license"


def snapshot_end(stdr_ym: str) -> pd.Timestamp:
    """상가정보 기준월('202606') 말일."""
    return (pd.Timestamp(f"{stdr_ym[:4]}-{stdr_ym[4:]}-01") + pd.offsets.MonthEnd(0)).normalize()


def _stdr_ym() -> str:
    return max(json.loads(p.read_text(encoding="utf-8"))["stdrYm"] for p in (config.RAW_DIR / "sbiz").glob("sangga_*.json"))


def judge(*, exact: bool, n_groups: int, has_close: bool, ended_not_closed: bool, same_name_active_building: bool,
          same_name_active_nearby: bool, duplicate_record: bool, last_close, snapshot: pd.Timestamp, replaced: bool) -> tuple[str, str | None, list[str]]:
    """결격·근거 규칙(순수 함수) → (status, evidence, reasons). status 는 confirmed|uncertain."""
    reasons = []
    if not exact:
        reasons.append("not_exact_name")
    if n_groups > 1:
        reasons.append("multiple_closed_licenses")
    if not has_close:
        reasons.append("no_close_date")
    if ended_not_closed:
        reasons.append("cancelled_or_removed")
    if same_name_active_building:
        reasons.append("same_name_active_license_in_building")
    if same_name_active_nearby:
        reasons.append("same_name_active_license_nearby")
    if duplicate_record:
        reasons.append("duplicate_store_record")
    if reasons:
        return "uncertain", None, reasons
    if pd.notna(last_close) and last_close > snapshot:
        return "confirmed", EVIDENCE_AFTER_SNAPSHOT, []
    if replaced:
        return "confirmed", EVIDENCE_REPLACED, []
    return "uncertain", None, ["no_supporting_evidence"]


def main() -> None:
    stores = pd.read_parquet(config.PROCESSED_DIR / "stores.parquet")
    lic = pd.read_parquet(config.PROCESSED_DIR / "licenses.parquet")
    links = pd.read_parquet(config.PROCESSED_DIR / "store_license_links.parquet")
    snapshot = snapshot_end(_stdr_ym())
    L = lic.set_index("license_id")

    stores = stores.assign(core=stores["bizesNm"].map(norm_name), road=stores["rdnmAdr"].map(road_key))
    stores["dup_n"] = stores.groupby(["core", "road"])["bizesId"].transform("count").where(stores["road"].notna(), 1)
    target = links.loc[links["link_status"] == "closed_only"].merge(stores, on="bizesId")
    by_road_license = lic.dropna(subset=["road_key"]).groupby("road_key")["license_id"].apply(list).to_dict()
    by_road_store = stores.dropna(subset=["road"]).groupby("road").apply(lambda g: g[["bizesId", "core"]].values.tolist(), include_groups=False).to_dict()

    geo = lic.dropna(subset=["lon", "lat"])
    tree = BallTree(np.radians(geo[["lat", "lon"]].to_numpy()), metric="haversine")
    near = tree.query_radius(np.radians(target[["lat", "lon"]].to_numpy()), r=NEARBY_M / EARTH_R)
    geo_ids = geo["license_id"].to_numpy()

    out = []
    for i, s in enumerate(target.itertuples()):
        closed = L.loc[list(s.other_license_ids)].sort_values("close_date", na_position="first")
        full = s.core + norm_name(s.brchNm)
        codes = set(closed["license_code"])
        primary = closed.iloc[-1]
        last_close = closed["close_date"].max()

        same_building = lic.loc[lic["license_id"].isin(by_road_license.get(s.road, []) if s.road else []) & lic["license_code"].isin(codes)]
        active_here = same_building.loc[same_building["status_norm"].isin(ACTIVE)]
        same_name_building = any(name_relation(full, s.core, n) != "none" for n in active_here["name_norm"])
        newer = active_here.loc[(active_here["permit_date"] > last_close)] if pd.notna(last_close) else active_here.iloc[0:0]
        replaced_by = None
        for a in newer.itertuples():
            if name_relation(full, s.core, a.name_norm) != "none":
                continue
            others = [b for b, core in by_road_store.get(s.road, []) if b != s.bizesId and core and name_relation(core, core, a.name_norm) != "none"]
            if others:
                replaced_by = a.license_id
                break

        nearby = lic.loc[lic["license_id"].isin(geo_ids[near[i]]) & lic["license_code"].isin(codes) & lic["status_norm"].isin(ACTIVE)]
        same_name_nearby = any(name_relation(full, s.core, a.name_norm) == "exact" and not branch_conflict(s.brchNm, a.name_norm, s.core)
                               for a in nearby.itertuples())

        status, evidence, reasons = judge(
            exact=any(name_relation(full, s.core, n) == "exact" for n in closed["name_norm"]),
            n_groups=int(closed["dup_group"].nunique()), has_close=bool(closed["close_date"].notna().all()),
            ended_not_closed=bool(closed["status_norm"].isin({"cancelled", "removed"}).any()),
            same_name_active_building=same_name_building, same_name_active_nearby=same_name_nearby,
            duplicate_record=bool(s.dup_n > 1), last_close=last_close, snapshot=snapshot, replaced=replaced_by is not None)
        out.append({
            "bizesId": s.bizesId, "closure_status": status, "evidence": evidence, "reasons": reasons,
            "closed_license_id": primary.name, "closed_license_ids": list(closed.index),
            "closed_license_name": primary["name"], "close_date": last_close,
            "replaced_by_license_id": replaced_by if evidence == EVIDENCE_REPLACED else None,
            "snapshot_end": snapshot,
        })

    ev = pd.DataFrame(out)
    ev.to_parquet(config.PROCESSED_DIR / "store_closure_evidence.parquet", index=False)
    log = pd.concat([ev["closure_status"].value_counts().rename_axis("항목").reset_index(name="건수"),
                     ev["evidence"].value_counts(dropna=True).rename_axis("항목").reset_index(name="건수"),
                     ev["reasons"].explode().dropna().value_counts().rename_axis("항목").reset_index(name="건수")], ignore_index=True)
    log.to_csv(config.TABLES_DIR / "store_closure_evidence_log.csv", index=False)
    print(f"저장: store_closure_evidence.parquet {len(ev):,}건 (상가정보 기준월 말일 {snapshot.date()})")
    print(log.to_string(index=False))


if __name__ == "__main__":
    main()
