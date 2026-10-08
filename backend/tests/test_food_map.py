"""외식 지도 API — 배율별 버블, 세부 업종 필터, 매장 점."""
from __future__ import annotations

import pytest

from app.services import data_store


def test_categories_are_food_only(client):
    body = client.get("/api/food/categories").json()
    assert [g["svc_cd"] for g in body["groups"]] == [f"CS1000{i:02d}" for i in range(1, 11)]
    cafe = next(g for g in body["groups"] if g["svc_nm"] == "커피-음료")
    assert {"I21201", "I21008"} <= {d["code"] for d in cafe["details"]}
    assert all(d["code"].startswith("I2") for g in body["groups"] for d in g["details"])


@pytest.mark.parametrize("level,count", [("gu", 2), ("dong", 36), ("trdar", 152)])
def test_bubbles_per_zoom_level(client, level, count):
    body = client.get("/api/food/bubbles", params={"level": level, "metric": "stores"}).json()
    assert len(body["bubbles"]) == count
    assert all({"lon", "lat", "size", "value"} <= b.keys() for b in body["bubbles"])


def test_dong_sizes_add_up_to_gu(client):
    dong = client.get("/api/food/bubbles", params={"level": "dong", "metric": "stores", "svc": "CS100001"}).json()
    gu = client.get("/api/food/bubbles", params={"level": "gu", "metric": "stores", "svc": "CS100001"}).json()
    assert sum(b["size"] for b in dong["bubbles"]) == sum(b["size"] for b in gu["bubbles"])


@pytest.mark.parametrize("level,svc,scls", [("trdar", "CS100010", "I21008"), ("trdar", None, None), ("dong", "CS100001", None)])
def test_unit_store_list_matches_bubble_size(client, level, svc, scls):
    """버블 점포 수 = 버블을 눌렀을 때 매장 목록 총수(같은 경계 기준)."""
    params = {k: v for k, v in {"svc": svc, "scls": scls}.items() if v}
    bubbles = client.get("/api/food/bubbles", params={"level": level, "metric": "stores", **params}).json()["bubbles"]
    for b in sorted(bubbles, key=lambda b: -b["size"])[:5]:
        body = client.get(f"/api/food/units/{level}/{b['code']}/stores", params={**params, "limit": 3}).json()
        assert body["total"] == b["size"]
        assert [r["distance_m"] for r in body["records"]] == sorted(r["distance_m"] for r in body["records"])


def test_trdar_list_includes_stores_outside_radius(client):
    """국회의사당역 상권 아이스크림/빙수 2곳 — 중심 250m 밖(약 430m) 매장도 목록에 포함."""
    body = client.get("/api/food/units/trdar/3120148/stores", params={"scls": "I21008"}).json()
    assert body["total"] == 2 and max(r["distance_m"] for r in body["records"]) > 250
    assert client.get("/api/food/units/trdar/0/stores").status_code == 404
    assert client.get("/api/food/units/x/1/stores").status_code == 400


def test_detail_filter_uses_sbiz_counts(client):
    body = client.get("/api/food/bubbles", params={"level": "dong", "metric": "stores", "svc": "CS100010", "scls": "I21201"}).json()
    stores = data_store.load_parquet("stores.parquet")
    assert sum(b["size"] for b in body["bubbles"]) == int((stores["indsSclsCd"] == "I21201").sum())
    assert "소상공인" in body["size_source"]


def test_missing_value_is_null_not_zero(client):
    body = client.get("/api/food/bubbles", params={"level": "trdar", "metric": "sales_yoy_pct"}).json()
    assert any(b["value"] is None for b in body["bubbles"])
    assert client.get("/api/food/bubbles", params={"level": "x"}).status_code == 400
    assert client.get("/api/food/bubbles", params={"metric": "x"}).status_code == 400


def test_stores_in_bbox(client):
    body = client.get("/api/food/stores", params={"min_lon": 126.92, "min_lat": 37.52, "max_lon": 126.93,
                                                 "max_lat": 37.53, "svc": "CS100010", "limit": 5}).json()
    assert body["total"] > 5 and body["truncated"] and len(body["stores"]) == 5
    assert all(126.92 <= s["lon"] <= 126.93 for s in body["stores"])
