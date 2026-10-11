"""인허가상 폐업 기록 확인 — 영업 상태 충돌 없음, 경쟁업체 보정 수 정합성."""
from __future__ import annotations

import pandas as pd
import pytest

from app.services import data_store, nearby_analysis


@pytest.fixture(scope="module")
def evidence():
    try:
        return data_store.load_parquet("store_closure_evidence.parquet")
    except data_store.DataNotReady:
        pytest.skip("store_closure_evidence.parquet 없음 — build_closure_evidence 를 먼저 실행")


@pytest.fixture(scope="module")
def links():
    return data_store.load_parquet("store_license_links.parquet")


def test_evidence_covers_exactly_the_closed_only_stores(evidence, links):
    assert set(evidence["bizesId"]) == set(links.loc[links["link_status"] == "closed_only", "bizesId"])
    assert evidence["bizesId"].is_unique
    assert set(evidence["closure_status"]) <= {"confirmed", "uncertain"}


def test_confirmed_closures_never_conflict_with_an_active_license_match(evidence, links):
    confirmed = set(evidence.loc[evidence["closure_status"] == "confirmed", "bizesId"])
    matched = set(links.loc[links["link_status"] == "matched", "bizesId"])
    assert confirmed and not confirmed & matched         # 영업 인허가가 연결된 매장은 폐업 기록 확인이 될 수 없다


def test_confirmed_rows_carry_license_id_close_date_and_one_of_two_evidence_types(evidence):
    lic = data_store.load_parquet("licenses.parquet").set_index("license_id")
    c = evidence.loc[evidence["closure_status"] == "confirmed"]
    assert set(c["evidence"]) <= {"closed_after_snapshot", "replaced_by_new_license"}
    assert c["close_date"].notna().all() and c["closed_license_id"].isin(lic.index).all()
    assert (lic.loc[c["closed_license_id"], "status_norm"] == "closed").all()           # 취소·말소는 폐업 근거가 아니다
    replaced = c.loc[c["evidence"] == "replaced_by_new_license"]
    assert replaced["replaced_by_license_id"].notna().all() and (c.loc[c["evidence"] == "closed_after_snapshot", "close_date"] > c["snapshot_end"].iloc[0]).all()
    assert evidence.loc[evidence["closure_status"] == "uncertain", "evidence"].isna().all()   # 불확실한 매장에 근거 유형을 붙이지 않는다


def test_store_detail_shows_closure_only_for_confirmed(client, evidence):
    conf = evidence.loc[evidence["closure_status"] == "confirmed"].sort_values("bizesId").iloc[0]
    b = client.get(f"/api/stores/{conf['bizesId']}").json()["operation_history"]["business_status"]
    assert b["status"] == "licensed_closed" and b["label"] == "인허가상 폐업 기록 확인"
    assert b["closure"]["license_id"] == conf["closed_license_id"] and b["closure"]["close_date"] == conf["close_date"].date().isoformat()
    assert "확정된 것은 아닙니다" in b["caveat"]          # 현장 폐업 확정 표현을 쓰지 않는다
    unc = evidence.loc[evidence["closure_status"] == "uncertain"].sort_values("bizesId").iloc[0]
    u = client.get(f"/api/stores/{unc['bizesId']}").json()["operation_history"]["business_status"]
    assert u["status"] == "unconfirmed" and "폐업으로 판정하지 않음" in u["basis"] and "closure" not in u


def test_competitor_adjustment_is_a_subset_count_and_never_negative(client, evidence, links):
    stores = data_store.load_parquet("stores.parquet").set_index("bizesId")
    confirmed_ids = list(evidence.loc[evidence["closure_status"] == "confirmed", "bizesId"].sort_values().iloc[:40])
    seen_excluded = 0
    for bid in confirmed_ids + list(links.loc[links["link_status"] == "matched", "bizesId"].sort_values().iloc[:20]):
        body = client.get(f"/api/stores/{bid}/nearby-analysis").json()
        c = body["competitors"]
        assert c["adjusted_count"] == c["raw_count"] - c["excluded_closed_count"] >= 0
        assert c["open_confirmed_count"] + c["excluded_closed_count"] + c["unconfirmed_count"] == c["raw_count"]
        seen_excluded += c["excluded_closed_count"]
    assert seen_excluded > 0                            # 폐업 기록 확인 점포가 실제로 제외되는 사례가 있다


def test_raw_competitor_count_matches_the_existing_store_based_count(client, links):
    """원본 수는 기존 상가정보 기준(find_competitors)에서 선택 매장만 뺀 값 — 산식은 바뀌지 않았다."""
    from app.services import competitors
    st = data_store.load_parquet("stores.parquet")
    bid = links.loc[links["link_status"] == "matched", "bizesId"].sort_values().iloc[0]
    row = st.loc[st["bizesId"] == bid].iloc[0]
    old = competitors.find_competitors(row["lon"], row["lat"], 500.0, "scls", row["indsSclsCd"], limit=100_000)
    body = client.get(f"/api/stores/{bid}/nearby-analysis").json()["competitors"]
    assert body["raw_count"] == old["total_matched"] - 1          # 선택 매장 자신 1곳만 다르다
