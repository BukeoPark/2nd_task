"""행정동·상권 종합분석 보조 API — 시계열·시간대·겹치는 상권."""
from __future__ import annotations


def _first_dong(client) -> str:
    return client.get("/api/food/bubbles", params={"level": "dong", "metric": "stores"}).json()["bubbles"][0]["code"]


def test_dong_overview_has_trend_and_overlapping_trdars(client):
    code = _first_dong(client)
    body = client.get(f"/api/food/units/dong/{code}/overview").json()
    assert body["trend"] and body["trend"] == sorted(body["trend"], key=lambda r: r["quarter"])
    assert all(r["overlap_pct"] >= 10 for r in body["trdars"])
    assert {"slots", "used", "total"} <= body["hours"].keys()
    assert "trdars_basis" in body


def test_trdar_overview_uses_trdar_own_table(client):
    trdar = client.get("/api/food/bubbles", params={"level": "trdar", "metric": "stores"}).json()["bubbles"][0]["code"]
    body = client.get(f"/api/food/units/trdar/{trdar}/overview").json()
    assert body["level"] == "trdar" and "trdars" not in body and body["area_m2"] > 0


def test_overview_rejects_bad_level_and_unknown_code(client):
    assert client.get("/api/food/units/gu/양천구/overview").status_code == 400
    assert client.get("/api/food/units/dong/0000/overview").status_code == 404
