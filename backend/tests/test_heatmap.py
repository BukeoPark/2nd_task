"""지도 히트맵 — 유동인구·상주인구 밀도·직장인구 밀도의 상권 단위 점. 실제 파이프라인 산출물 기준."""
from __future__ import annotations

import pytest

from app.services import heatmap


@pytest.mark.parametrize("metric", ["flpop", "resident", "worker"])
def test_heat_points_are_valid_and_scaled(client, metric):
    body = client.get("/api/food/heat", params={"metric": metric}).json()
    assert body["metric"] == metric and body["level"] == "trdar"
    pts = body["points"]
    assert body["count"] == len(pts) > 50
    assert body["count"] + body["missing"] == body["total_trdars"]  # 값이 없는 상권은 0 으로 채우지 않고 빼며 건수를 남긴다
    assert [p["code"] for p in pts] == sorted(p["code"] for p in pts)  # 결정적 순서
    for p in pts:
        assert 126.7 < p["lon"] < 127.2 and 37.4 < p["lat"] < 37.7  # 양천·영등포 일대
        assert p["value"] > 0 and 0 < p["weight"] <= 1
    assert max(p["weight"] for p in pts) == 1.0  # 상위 5% 이상은 1 로 눌린다
    sc = body["scale"]
    assert 0 < sc["p50"] < sc["p95"] <= sc["max"]
    assert body["source"] and body["basis"] and len(body["caveats"]) >= 2


def test_heat_weight_follows_value(client):
    pts = client.get("/api/food/heat", params={"metric": "flpop"}).json()["points"]
    by_value = sorted(pts, key=lambda p: p["value"])
    weights = [p["weight"] for p in by_value]
    assert weights == sorted(weights)


def test_heat_density_uses_area(client):
    body = client.get("/api/food/heat", params={"metric": "resident"}).json()
    assert body["unit"] == "명/㎢"  # 사람 수가 아니라 면적으로 나눈 밀도


def test_heat_rejects_unknown_metric(client):
    r = client.get("/api/food/heat", params={"metric": "income"})
    assert r.status_code == 400
    assert "flpop" in r.json()["detail"]


def test_heat_metric_names_are_stable():
    assert list(heatmap.METRICS) == ["flpop", "resident", "worker"]
