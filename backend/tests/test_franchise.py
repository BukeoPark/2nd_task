"""프랜차이즈 참고 정보 API."""
from __future__ import annotations

from app.services import data_store


def test_linked_store_has_brand_card(client):
    links = data_store.load_parquet("store_brand.parquet")
    bid = links.loc[links["brandNm"] == "이디야커피"].sort_values("bizesId").iloc[0]["bizesId"]
    body = client.get(f"/api/stores/{bid}/franchise").json()
    b = body["brand"]
    assert b["brand"] == "이디야커피" and b["frcs_cnt"] > 0
    assert b["avg_sales_month"] == b["avg_sales_year"] / 12
    assert body["seoul_avg"]["mlsfc"] == "커피" and len(body["caveats"]) == 3


def test_unlinked_store_has_message(client):
    stores = data_store.load_parquet("stores.parquet")
    links = data_store.load_parquet("store_brand.parquet")
    bid = stores.loc[~stores["bizesId"].isin(links["bizesId"])].sort_values("bizesId").iloc[0]["bizesId"]
    body = client.get(f"/api/stores/{bid}/franchise").json()
    assert body["brand"] is None and "연결되지 않은" in body["message"]
    assert client.get("/api/stores/NOPE0000/franchise").status_code == 404


def test_benchmark_has_franchise_share(client):
    links = data_store.load_parquet("store_brand.parquet")
    bid = links.loc[links["brandNm"] == "이디야커피"].sort_values("bizesId").iloc[0]["bizesId"]
    fs = client.get(f"/api/stores/{bid}/sales-benchmark").json()["franchise_share"]
    assert 0 <= fs["share"] <= 1 and fs["frc_stores"] <= fs["stores"]
