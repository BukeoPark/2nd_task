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
    assert t["pilot"]["label"] == "파일럿 구 상권" and t["pilot"]["units"] > 50
    vals = [s["pct"] for s in t["pilot"]["slots"]]
    assert all(v is not None for v in vals) and abs(sum(vals) - 100) < 0.6
    assert [s["label"] for s in t["pilot"]["slots"]] == [s["label"] for s in t["slots"]]
    code = _first_dong(client)
    d = client.get(f"/api/food/units/dong/{code}/overview").json()["hours"]
    assert d["pilot"]["label"] == "파일럿 구 행정동" and d["pilot"]["units"] <= 36


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
