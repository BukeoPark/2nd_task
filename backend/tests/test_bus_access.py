"""버스 접근성 — 반경별 정류장 수·최근접·이용량 연결(관측된 부분)·0곳과 자료 누락·범위 불완전의 구분, 구 경계 매장의 이웃 정류장 포함."""
from __future__ import annotations

import json

import numpy as np
import pandas as pd
import pytest

from app.services import bus_access, data_store

LAT0, LON0 = 37.5200, 126.9000
META = {"buffer_m": 1100, "usage_year": 2025, "loc_collected_at": "2025-10-31", "extent": "테스트 범위"}


def _at(north_m: float, east_m: float = 0.0) -> tuple[float, float]:
    """기준점에서 북쪽·동쪽으로 떨어진 점의 (경도, 위도)."""
    return LON0 + east_m / (111_320 * np.cos(np.radians(LAT0))), LAT0 + north_m / 110_574


def _stops(*rows) -> pd.DataFrame:
    """rows: (북쪽 m, 상태, 승차, 하차[, 이름])."""
    out = []
    for i, r in enumerate(rows):
        north, status, board, alight = r[:4]
        lon, lat = _at(north)
        out.append({"lon": lon, "lat": lat, "name": r[4] if len(r) > 4 else f"정류장{i}", "usage_status": status,
                    "avg_daily_boardings": board, "avg_daily_alightings": alight})
    return pd.DataFrame(out)


def _run(stops: pd.DataFrame, radius=500, pilot_m=0.0) -> dict:
    return bus_access.compute(LON0, LAT0, stops, META, radius, pilot_m)


# ── 반경별 수치 ─────────────────────────────────────────────────────────────────────────────────

def test_counts_by_radius_match_brute_force_and_are_nested():
    offsets = [40, 120, 240, 260, 480, 520, 900, 990, 1010, 1500]
    stops = _stops(*[(m, "linked", 10.0, 5.0) for m in offsets])
    res = _run(stops)
    by = {int(r): v["count"] for r, v in res["by_radius"].items()}
    assert by == {250: 3, 500: 5, 1000: 8}                                   # 240m 는 250m 안, 260m 는 밖 / 990m 는 1km 안, 1010m 는 밖
    dist = bus_access._haversine_m(LON0, LAT0, stops["lon"].to_numpy(), stops["lat"].to_numpy())
    assert by == {r: int((dist <= r).sum()) for r in bus_access.RADII_M}
    assert by[250] <= by[500] <= by[1000]
    assert res["nearest"]["distance_m"] == 40 and res["selected"]["radius_m"] == res["radius_m"] == 500


def test_selected_slice_follows_the_requested_radius_for_every_option():
    stops = _stops((100, "linked", 1.0, 1.0), (400, "linked", 1.0, 1.0), (800, "linked", 1.0, 1.0))
    for radius, expected in ((250, 1), (500, 2), (1000, 3)):
        res = _run(stops, radius)
        assert res["radius_m"] == radius and res["selected"]["radius_m"] == radius and res["selected"]["count"] == expected
    with pytest.raises(ValueError):
        _run(stops, 300)


# ── 이용량: 승차·하차 분리, 관측된 부분, 환승 제외 ────────────────────────────────────────────

def test_boardings_and_alightings_are_separate_observed_sums_over_linked_stops_only():
    stops = _stops((50, "linked", 100.0, 40.0), (60, "linked", 30.0, 10.0), (70, "multi_usage_rows", None, None), (80, "outside_seoul", None, None),
                   (90, "no_mobile_no", None, None), (100, "name_conflict", None, None))
    s = _run(stops)["selected"]
    assert (s["count"], s["linked"], s["unlinked"]) == (6, 2, 4) and s["linked_ratio"] == pytest.approx(2 / 6, abs=1e-4)
    assert s["usage_state"] == "partial"                                      # 일부만 연결 → 관측된 부분 합계
    assert (s["boardings_observed"], s["alightings_observed"]) == (130, 50)  # 각각 따로, 연결된 정류장만
    assert {b["reason"]: b["count"] for b in s["unlinked_breakdown"]} == {"ambiguous": 1, "usage_not_collected": 1, "no_mobile_no": 1, "name_conflict": 1}
    flat = json.dumps(_run(stops), ensure_ascii=False)
    assert "transfer" not in flat and "환승 이용" not in flat                 # 환승은 응답에 넣지 않는다(합산 금지)
    assert not any(k in s for k in ("total_observed", "boardings_plus_alightings", "riders"))   # 승차+하차 합계 칸이 없다


def test_all_linked_complete_and_none_linked_missing_are_different_states():
    full = _run(_stops((50, "linked", 10.0, 5.0), (60, "linked", 20.0, 6.0)))["selected"]
    assert full["usage_state"] == "all_linked" and full["linked_ratio"] == 1.0 and full["unlinked_breakdown"] == []
    none = _run(_stops((50, "no_usage_candidate", None, None), (60, "no_mobile_no", None, None)))["selected"]
    assert none["usage_state"] == "none_linked" and none["linked"] == 0 and none["linked_ratio"] == 0.0
    assert none["boardings_observed"] is None and none["alightings_observed"] is None   # 0 명이 아니라 자료 없음


def test_zero_valued_usage_is_a_real_zero_not_missing():
    s = _run(_stops((50, "linked", 0.0, 0.0)))["selected"]
    assert s["boardings_observed"] == 0 and s["alightings_observed"] == 0 and s["usage_state"] == "all_linked"


# ── 0곳과 누락·범위 불완전 ──────────────────────────────────────────────────────────────────────

def test_zero_stops_in_a_covered_radius_is_a_real_zero():
    res = _run(_stops((900, "linked", 1.0, 1.0)), 250)
    s = res["selected"]
    assert s["count"] == 0 and s["count_state"] == "zero" and s["scope_complete"] and s["usage_state"] == "no_stops"
    assert s["linked_ratio"] is None and s["boardings_observed"] is None       # 정류장이 없으면 비율·합계는 0 이 아니라 해당 없음
    assert res["scope"]["complete"] and res["scope"]["reason"] is None


def test_incomplete_scope_never_reports_a_confident_zero_or_exact_count():
    far = _stops((900, "linked", 1.0, 1.0), (80, "linked", 5.0, 5.0))
    # 파일럿 구역에서 300m 떨어진 매장: 1km 반경은 수집 범위(1100m)를 넘는다(300+1000 > 1100), 500m 는 덮인다(300+500 ≤ 1100? 800 ≤ 1100)
    res = _run(far, 1000, pilot_m=300.0)
    s = res["selected"]
    assert not s["scope_complete"] and s["count_state"] == "lower_bound" and s["count"] == 2
    assert "수집 범위 밖" in res["scope"]["reason"]
    assert res["by_radius"]["500"]["scope_complete"] and res["by_radius"]["500"]["count_state"] == "ok"
    empty = _run(_stops((900, "linked", 1.0, 1.0)), 250, pilot_m=950.0)       # 950+250 > 1100: 정류장이 0곳이어도 '없음'이 아니다
    assert empty["selected"]["count"] == 0 and empty["selected"]["count_state"] == "incomplete_zero"
    assert _run(far, 500, pilot_m=None)["scope"]["complete"] is False


def test_no_stops_at_all_in_the_table_is_handled():
    res = _run(_stops().reindex(columns=["lon", "lat", "name", "usage_status", "avg_daily_boardings", "avg_daily_alightings"]))
    assert res["nearest"] is None and all(v["count"] == 0 for v in res["by_radius"].values())


def test_unavailable_when_the_bus_files_are_missing_but_the_rest_of_the_response_is_untouched(client, monkeypatch):
    real_parquet = data_store.load_parquet

    def fake(name: str):
        if name == "bus_stops.parquet":
            raise data_store.DataNotReady("bus_stops.parquet 없음 — 파이프라인 먼저 실행")
        return real_parquet(name)
    monkeypatch.setattr(data_store, "load_parquet", fake)
    stores = data_store.load_parquet("stores.parquet")
    sid = stores.sort_values("bizesId").iloc[7]["bizesId"]
    body = client.get(f"/api/stores/{sid}/location-influence", params={"radius_m": 500}).json()
    bus = body["radius_metrics"]["bus"]
    assert bus["status"] == "unavailable" and "확인 불가" in bus["message"] and "count" not in bus
    assert body["radius_metrics"]["anchors"]["status"] == "ok" and "same_category" in body["radius_metrics"]["competitors"]   # 기존 블록은 그대로


# ── 실제 산출물: 구 경계 매장, API 반경 일치, 기존 값 불변 ────────────────────────────────────────

@pytest.fixture(scope="module")
def real():
    try:
        stops = data_store.load_parquet("bus_stops.parquet")
        meta = data_store.load_json("bus_meta.json")
    except data_store.DataNotReady:
        pytest.skip("bus_stops.parquet 없음 — pipelines 의 collect_bus_transit → build_bus_stops 를 먼저 실행")
    return stops.loc[stops["is_primary"]].reset_index(drop=True), meta


def _border_store_ids(n: int = 6) -> list[str]:
    """파일럿 구 경계에 가까운(바깥 이웃 정류장이 반경에 걸리는) 매장."""
    poly, k = bus_access._pilot_local()
    stores = data_store.load_parquet("stores.parquet")
    pts = stores.sort_values("bizesId").iloc[::97]            # 결정적 표본
    out = []
    for r in pts.itertuples():
        edge = poly.boundary.distance(__import__("shapely.geometry", fromlist=["Point"]).Point(r.lon * 111_320 * k, r.lat * 110_574))
        if edge <= 120:
            out.append(r.bizesId)
        if len(out) >= n:
            break
    return out


def test_border_stores_count_neighbouring_district_and_city_stops(real):
    stops, meta = real
    ids = _border_store_ids()
    assert len(ids) >= 3
    found_outside = False
    for sid in ids:
        st = data_store.load_parquet("stores.parquet").set_index("bizesId").loc[sid]
        res = bus_access.compute(float(st["lon"]), float(st["lat"]), stops, meta, 1000, bus_access.distance_to_pilot_m(float(st["lon"]), float(st["lat"])))
        dist = bus_access._haversine_m(float(st["lon"]), float(st["lat"]), stops["lon"].to_numpy(), stops["lat"].to_numpy())
        inside = stops.loc[dist <= 1000]
        assert res["selected"]["count"] == len(inside) and res["selected"]["scope_complete"]
        found_outside |= bool((~inside["in_pilot"]).any())             # 구 경계 너머(다른 자치구·부천) 정류장이 반경 안에 실제로 포함된다
    assert found_outside


def test_every_pilot_store_radius_is_covered_by_the_collected_extent(real):
    """파일럿 안 모든 매장의 1km 반경이 수집 범위(구역+1.1km) 안에 있다 — 가장 먼 매장도 구역 밖 10m 안팎."""
    _, meta = real
    stores = data_store.load_parquet("stores.parquet")
    sample = stores.iloc[::37]
    worst = max(bus_access.distance_to_pilot_m(float(r.lon), float(r.lat)) for r in sample.itertuples())
    assert worst + 1000 <= meta["buffer_m"]


def test_api_returns_the_selected_radius_and_keeps_existing_blocks(client, real):
    stops, _ = real
    stores = data_store.load_parquet("stores.parquet")
    sid = stores.sort_values("bizesId").iloc[321]["bizesId"]
    st = stores.set_index("bizesId").loc[sid]
    base = client.get(f"/api/stores/{sid}/location-influence", params={"radius_m": 500}).json()
    for radius in (250, 500, 1000):
        body = client.get(f"/api/stores/{sid}/location-influence", params={"radius_m": radius}).json()
        bus = body["radius_metrics"]["bus"]
        assert body["radius_m"] == bus["radius_m"] == bus["selected"]["radius_m"] == radius          # API·UI 가 같은 반경을 쓴다
        dist = bus_access._haversine_m(float(st["lon"]), float(st["lat"]), stops["lon"].to_numpy(), stops["lat"].to_numpy())
        assert bus["selected"]["count"] == int((dist <= radius).sum())
        assert bus["by_radius"][str(radius)] == bus["selected"]
    # 기존 지표는 그대로다(앵커·경쟁은 같은 반경에서 같은 값)
    again = client.get(f"/api/stores/{sid}/location-influence", params={"radius_m": 500}).json()
    for key in ("anchors", "competitors"):
        assert again["radius_metrics"][key] == base["radius_metrics"][key]
    assert client.get(f"/api/stores/{sid}/location-influence", params={"radius_m": 300}).status_code == 422
