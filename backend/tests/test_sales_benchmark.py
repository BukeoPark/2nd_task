"""동네 같은 업종 매출 비교 — 실제 파이프라인 산출물 기준."""
from __future__ import annotations

import pandas as pd
import pytest

from app.services import data_store


@pytest.fixture(scope="module")
def stores_cw() -> pd.DataFrame:
    stores = data_store.load_parquet("stores.parquet")
    cw = data_store.load_parquet("sales_industry_crosswalk.parquet")
    return stores.merge(cw[["indsSclsCd", "svc_cd", "status"]], on="indsSclsCd")


def test_crosswalk_covers_all_small_categories():
    cw = data_store.load_parquet("sales_industry_crosswalk.parquet")
    assert len(cw) == 247 and cw["indsSclsCd"].is_unique
    assert set(cw["status"]) <= {"sales", "no_sales", "no_match"}


def test_benchmark_matches_source_numbers(client, stores_cw):
    sales = data_store.load_parquet("dong_industry_sales.parquet")
    latest = sales["quarter"].max()
    have = sales.loc[(sales["quarter"] == latest) & (sales["svc_cd"] == "CS100001") & sales["per_store_q"].notna()]
    store = stores_cw.loc[(stores_cw["indsSclsCd"] == "I20101") & stores_cw["adongCd"].isin(have["adongCd"])].sort_values("bizesId").iloc[0]
    body = client.get(f"/api/stores/{store['bizesId']}/sales-benchmark").json()
    assert body["status"] == "ok" and body["svc_nm"] == "한식음식점"
    src = have.loc[have["adongCd"] == store["adongCd"]].iloc[0]
    assert body["per_store_month"] == pytest.approx(src["sales_q"] / src["stores"] / 3, rel=1e-6)
    assert 1 <= body["rank"] <= body["peer_count"] == len(have)
    times = next(g for g in body["composition"] if g["group"] == "시간대별")["items"]
    assert sum(i["dong"] for i in times) == pytest.approx(1.0, abs=1e-3)
    assert len(body["trend"]) <= 8 and body["caveats"]


def test_no_match_and_no_sales_are_distinct(client, stores_cw):
    no_match = stores_cw.loc[stores_cw["status"] == "no_match"].sort_values("bizesId").iloc[0]
    r = client.get(f"/api/stores/{no_match['bizesId']}/sales-benchmark").json()
    assert r["status"] == "no_match" and "대응" in r["message"]
    no_sales = stores_cw.loc[stores_cw["status"] == "no_sales"]
    if len(no_sales):
        r = client.get(f"/api/stores/{no_sales.sort_values('bizesId').iloc[0]['bizesId']}/sales-benchmark").json()
        assert r["status"] == "no_sales" and "제공하지 않습니다" in r["message"]


def test_unknown_store_404(client):
    assert client.get("/api/stores/NOPE0000/sales-benchmark").status_code == 404


def test_dong_metrics_have_real_sales_growth(client):
    recs = client.get("/api/dong-metrics").json()["records"]
    assert all("sales_yoy_pct" in r for r in recs)
    assert sum(r["sales_yoy_pct"] is not None for r in recs) >= 30


def test_floating_population_comparison(client, stores_cw):
    sales = data_store.load_parquet("dong_industry_sales.parquet")
    latest = sales["quarter"].max()
    have = sales.loc[(sales["quarter"] == latest) & (sales["svc_cd"] == "CS100001") & sales["sales_per_10k_flpop"].notna()]
    store = stores_cw.loc[(stores_cw["indsSclsCd"] == "I20101") & stores_cw["adongCd"].isin(have["adongCd"])].sort_values("bizesId").iloc[0]
    fl = client.get(f"/api/stores/{store['bizesId']}/sales-benchmark").json()["floating"]
    src = have.loc[have["adongCd"] == store["adongCd"]].iloc[0]
    assert fl["sales_per_10k"] == pytest.approx(src["sales_q"] / src["flpop"] * 1e4, rel=1e-6)
    assert 1 <= fl["rank"] <= fl["peer_count"] == len(have)
    times = next(g for g in fl["mix"] if g["group"] == "시간대별")["items"]
    assert sum(i["flpop"] for i in times) == pytest.approx(1.0, abs=1e-3)
    assert any("상대 지수" in c for c in fl["caveats"])
    assert all(g["label"] != "0~6시" for g in fl["gaps"])  # 새벽 시간대는 주민 체류 인구라 기회로 안내하지 않는다
