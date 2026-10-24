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


def test_overview_hours_include_pilot_average_for_comparison(client):
    """시간대 매출 비중 옆에 같은 단위 전체 평균(파일럿)을 함께 준다 — 합이 100%이고, 상권·행정동 단위를 섞지 않는다."""
    trdar = client.get("/api/food/bubbles", params={"level": "trdar", "metric": "stores"}).json()["bubbles"][0]["code"]
    t = client.get(f"/api/food/units/trdar/{trdar}/overview", params={"svc": "CS100001"}).json()["hours"]
    assert t["pilot"]["label"] == "양천·영등포 상권" and t["pilot"]["units"] > 50
    vals = [s["pct"] for s in t["pilot"]["slots"]]
    assert all(v is not None for v in vals) and abs(sum(vals) - 100) < 0.6
    assert [s["label"] for s in t["pilot"]["slots"]] == [s["label"] for s in t["slots"]]
    code = _first_dong(client)
    d = client.get(f"/api/food/units/dong/{code}/overview").json()["hours"]
    assert d["pilot"]["label"] == "양천·영등포 행정동" and d["pilot"]["units"] <= 36


def test_pilot_hours_match_independent_weighted_average():
    """파일럿 평균 = 같은 분기·같은 업종 모든 상권 행의 시간대 비중을 매출액으로 가중 평균(독립 계산과 같아야 한다)."""
    import numpy as np
    from app.services import area_overview as ao, data_store
    df = data_store.load_parquet("trdar_industry_sales.parquet")
    latest = df["quarter"].max()
    cols = [c for c, _ in ao.TIME_COLS]
    g = df.loc[(df["svc_cd"] == "CS100001") & (df["quarter"] == latest)]
    g = g.loc[g["sales_q"].notna() & (g["sales_q"] > 0) & g[cols].notna().all(axis=1)]
    expect = [float(np.average(g[c], weights=g["sales_q"]) * 100) for c in cols]
    pilot, _ = ao._pilot_hours("trdar", "CS100001", str(latest))
    assert pilot is not None
    assert [round(v, 6) for v in pilot] == [round(v, 6) for v in expect]


def test_report_detail_weighting_and_missing_are_not_zero():
    import pandas as pd
    from unittest.mock import patch
    from app.services import area_overview as ao
    frame = pd.DataFrame({"quarter": ["20262", "20262"], "sales_q": [100, 300],
                          "share_weekend": [0.1, 0.5], "share_female": [None, None]})
    with patch.object(ao.food_map, "_dong_shapes", return_value={}):
        detail = ao._report_detail(frame, "20262", "dong", "missing")
    assert detail["composition"]["요일"][0]["pct"] == 40.0
    assert detail["composition"]["성별"][0]["pct"] is None
    assert all(r["pct"] is None for r in detail["composition"]["연령"])
    assert detail["boundary"] is None


def test_report_detail_boundary_customer_mix_and_stations(client):
    from app.services import food_map
    units = food_map._units()["trdar"]
    code = units.loc[units["name"].str.contains("국회의사당")].iloc[0]["code"]
    response = client.get(f"/api/food/units/trdar/{code}/overview", params={"svc": "CS100001"})
    assert response.status_code == 200
    detail = response.json()["report_detail"]
    assert detail["boundary"]["type"] in ["Polygon", "MultiPolygon"]
    assert any("국회의사당" in s["name"] for s in detail["stations"])
    assert abs(sum(r["pct"] for r in detail["composition"]["연령"]) - 100) < 0.6
    assert 0 <= detail["composition"]["요일"][0]["pct"] <= 100
