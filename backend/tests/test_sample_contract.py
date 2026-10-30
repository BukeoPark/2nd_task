"""가상 샘플 산출물로 확인하는 API 계약 — 실제 data/processed 가 없는 환경에서도 돈다."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def sample_client(sample_processed) -> TestClient:
    return TestClient(app)


@pytest.fixture
def empty_client(empty_processed) -> TestClient:
    return TestClient(app)


def test_health_does_not_need_data(empty_client):
    assert empty_client.get("/health").status_code == 200


def test_status_lists_the_sample_files(sample_client):
    files = sample_client.get("/api/status").json()["processed_files"]
    assert {"regions.geojson", "stores.parquet"} <= set(files)


def test_regions_returns_the_boundary_collection(sample_client):
    body = sample_client.get("/api/regions").json()
    assert body["type"] == "FeatureCollection" and len(body["features"]) == 2


def test_missing_data_answers_503_with_the_next_step(empty_client):
    for path in ("/api/regions", "/api/search?q=샘플국밥"):
        r = empty_client.get(path)
        assert r.status_code == 503, path
        assert "파이프라인" in r.json()["detail"], path


def test_search_too_short_query_returns_nothing(sample_client):
    body = sample_client.get("/api/search", params={"q": "역"}).json()
    assert body["too_short"] and body["results"] == []


def test_search_station_comes_first_and_has_coordinates(sample_client):
    results = sample_client.get("/api/search", params={"q": "가나다역"}).json()["results"]
    assert results[0]["kind"] == "station" and results[0]["name"] == "가나다역"
    assert 126.8 < results[0]["lon"] < 126.9 and 37.5 < results[0]["lat"] < 37.6


def test_search_same_name_stores_add_a_brand_result(sample_client):
    body = sample_client.get("/api/search", params={"q": "샘플국밥"}).json()
    kinds = [r["kind"] for r in body["results"]]
    assert kinds.count("store") == 2 and "brand" in kinds
    store = next(r for r in body["results"] if r["kind"] == "store")
    assert store["store_id"].startswith("SAMPLE") and store["svc"] == "CS100001"


def test_search_stores_lists_every_match_for_the_map(sample_client):
    body = sample_client.get("/api/search/stores", params={"q": "샘플국밥"}).json()
    assert body["total"] == 2 and not body["truncated"]
    assert {s["branch"] for s in body["stores"]} == {"본점", "2호점"}
