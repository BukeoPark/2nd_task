"""비교 단위 매장(peer-stores) — 동네 매출 비교와 같은 기준으로 지도에서 강조할 매장·경계를 준다. 실제 파이프라인 산출물 기준."""
from __future__ import annotations

import pandas as pd
import pytest
from shapely.geometry import Point, shape

from app.services import data_store


@pytest.fixture(scope="module")
def stores_cw() -> pd.DataFrame:
    stores = data_store.load_parquet("stores.parquet")
    cw = data_store.load_parquet("sales_industry_crosswalk.parquet")
    st = data_store.load_parquet("store_trdar.parquet")[["bizesId", "trdar_cd"]]
    return stores.merge(cw[["indsSclsCd", "svc_cd", "status"]], on="indsSclsCd").merge(st, on="bizesId", how="left")


def _members(stores_cw: pd.DataFrame, svc: str, level: str, code: str) -> set[str]:
    s = stores_cw.loc[stores_cw["svc_cd"] == svc]
    col = "trdar_cd" if level == "trdar" else "adongCd"
    return set(s.loc[s[col] == code, "bizesId"])


def test_trdar_unit_members_and_boundary(client, stores_cw):
    cand = stores_cw.loc[(stores_cw["indsSclsCd"] == "I20101") & stores_cw["trdar_cd"].notna()].sort_values("bizesId").head(60)
    for store in cand.itertuples():
        body = client.get(f"/api/stores/{store.bizesId}/peer-stores").json()
        if body["status"] == "ok" and body["unit"]["level"] == "trdar":
            break
    else:
        pytest.skip("상권 단위로 비교되는 한식 매장이 없음")
    assert body["svc_cd"] == "CS100001" and body["unit"]["fallback_reason"] is None
    assert store.bizesId in body["store_ids"]
    assert set(body["store_ids"]) == _members(stores_cw, "CS100001", "trdar", body["unit"]["code"])
    assert body["count"] == len(body["store_ids"]) and body["store_ids"] == sorted(body["store_ids"])
    # 경계: 같은 상권에 배정된 매장은 그 상권 폴리곤 안에 있다
    assert body["boundary"]["type"] in ("Polygon", "MultiPolygon")
    assert shape(body["boundary"]).contains(Point(store.lon, store.lat))


def test_dong_fallback_members_share_dong_and_service(client, stores_cw):
    store = stores_cw.loc[(stores_cw["indsSclsCd"] == "I20101") & stores_cw["trdar_cd"].isna()].sort_values("bizesId").iloc[0]
    body = client.get(f"/api/stores/{store['bizesId']}/peer-stores").json()
    assert body["status"] == "ok" and body["unit"]["level"] == "dong"
    assert "상권" in body["unit"]["fallback_reason"] and body["unit"]["code"] == store["adongCd"]
    assert store["bizesId"] in body["store_ids"]
    assert set(body["store_ids"]) == _members(stores_cw, "CS100001", "dong", store["adongCd"])
    assert body["boundary"]["type"] in ("Polygon", "MultiPolygon")


def test_unit_is_the_same_one_the_sales_benchmark_uses(client, stores_cw):
    """강조되는 매장과 화면의 비교 숫자가 같은 단위·업종을 가리킨다."""
    for cond in (stores_cw["trdar_cd"].notna(), stores_cw["trdar_cd"].isna()):
        store = stores_cw.loc[(stores_cw["indsSclsCd"] == "I21007") & cond].sort_values("bizesId").iloc[0]
        bench = client.get(f"/api/stores/{store['bizesId']}/sales-benchmark").json()
        peers = client.get(f"/api/stores/{store['bizesId']}/peer-stores").json()
        if bench["status"] != "ok":
            continue
        assert peers["svc_cd"] == bench["svc_cd"]
        assert (peers["unit"]["level"], peers["unit"]["code"]) == (bench["unit"]["level"], bench["unit"]["code"])
        assert peers["unit"]["fallback_reason"] == bench["unit"]["fallback_reason"]


def test_no_match_gives_reason_not_empty_list(client, stores_cw):
    no_match = stores_cw.loc[stores_cw["status"] == "no_match"].sort_values("bizesId").iloc[0]
    body = client.get(f"/api/stores/{no_match['bizesId']}/peer-stores").json()
    assert body["status"] == "no_match" and "대응" in body["message"] and "store_ids" not in body


def test_unknown_store_404(client):
    assert client.get("/api/stores/NOPE0000/peer-stores").status_code == 404
