"""regions 라우터 스모크 테스트."""
from __future__ import annotations

from app.services import data_store


def test_health(client):
    assert client.get("/health").json() == {"ok": True}


def test_status_lists_processed_files(client):
    body = client.get("/api/status").json()
    assert "processed_files" in body
    assert isinstance(body["processed_files"], list)


def test_regions_503_when_not_ready(client, tmp_path, monkeypatch):
    # 파이프라인 산출물이 없는 상태를 흉내내 503 + 안내 메시지를 확인한다.
    monkeypatch.setattr(data_store, "PROCESSED", tmp_path)
    data_store.load_json.cache_clear()
    res = client.get("/api/regions")
    assert res.status_code == 503
    assert "파이프라인" in res.json()["detail"]
    data_store.load_json.cache_clear()


def test_regions_200_when_pipeline_has_run(client):
    # 실제 파이프라인 산출물(data/processed/regions.geojson)이 있으면 정상 응답.
    res = client.get("/api/regions")
    assert res.status_code == 200
    body = res.json()
    assert body["type"] == "FeatureCollection"
    assert len(body["features"]) >= 1


def test_reb_zones_200_and_null_safe(client):
    res = client.get("/api/reb-zones")
    assert res.status_code == 200
    body = res.json()
    assert body["count"] == 5
    # 여의도는 소규모 상가 통계가 없어 None(NaN 아님)이어야 JSON이 깨지지 않는다.
    yeouido = next(r for r in body["records"] if r["reb_zone_nm"] == "여의도")
    assert yeouido["vacancy_small_shop_pct"] is None
