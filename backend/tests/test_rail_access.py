"""철도 접근성 — 고유 역사 수(환승 중복 없음)·출입구 우선 포함 기준·이용량 연결(자료 없음≠0)·반경별 수치·API 하위 호환."""
from __future__ import annotations

import json

import numpy as np
import pandas as pd
import pytest

from app.services import bus_access, data_store, rail_access

LAT0, LON0 = 37.5200, 126.9000
META = {"usage_year": 2025, "official_file": {"file": "x.xlsx"}, "official_base_dates": {"min": "2022-04-27", "max": "2026-06-25"}, "regions": [{"region": "서울", "complexes": 3}],
        "usage_sources": {"seoul_card": {"versions": [{"period_first": "2025-01-01", "period_last": "2026-09-30"}]}}}


def _at(north_m: float, east_m: float = 0.0) -> tuple[float, float]:
    return LON0 + east_m / (111_320 * np.cos(np.radians(LAT0))), LAT0 + north_m / 110_574


def _official(*rows) -> pd.DataFrame:
    """rows: (complex_id, name, line, north_m, region)  — 같은 complex_id 의 여러 행 = 환승 노선별 행"""
    out = []
    for i, (cid, name, line, north, region) in enumerate(rows):
        lon, lat = _at(north)
        out.append({"national_complex_id": cid, "official_station_id": f"O{i}", "name": name, "line_std": line, "operator_std": "서울교통공사", "region": region, "lon": lon, "lat": lat, "coord_ok": True})
    return pd.DataFrame(out)


def _usage(*rows) -> pd.DataFrame:
    """rows: (complex_id, state, on, off, lines_with, lines_total, months, complete)"""
    return pd.DataFrame([{"national_complex_id": c, "usage_state": s, "avg_daily_boardings_2025": on, "avg_daily_alightings_2025": off, "lines_with_usage": lw, "lines_total": lt,
                          "months_observed_min": mo, "complete_2025": comp, "sources": "seoul_card" if s != "none_linked" else ""} for c, s, on, off, lw, lt, mo, comp in rows],
                        columns=["national_complex_id", "usage_state", "avg_daily_boardings_2025", "avg_daily_alightings_2025", "lines_with_usage", "lines_total", "months_observed_min", "complete_2025", "sources"])


def _exits(*rows) -> pd.DataFrame:
    """rows: (complex_id, label, north_m)"""
    out = []
    for c, label, north in rows:
        lon, lat = _at(north)
        out.append({"national_complex_id": c, "exit_label": label, "lon": lon, "lat": lat})
    return pd.DataFrame(out, columns=["national_complex_id", "exit_label", "lon", "lat"])


def _run(official, usage, exits, radius=500, pilot_m=0.0) -> dict:
    cx = rail_access.build_complexes(official, usage, exits)
    return rail_access.compute(LON0, LAT0, cx, exits, META, radius, pilot_m)


# ── 고유 역사·환승 ─────────────────────────────────────────────────────────────────────────────

def test_interchange_lines_are_counted_once_per_complex():
    off = _official(("A", "영등포구청", "2호선", 100, "서울"), ("A", "영등포구청", "5호선", 130, "서울"), ("B", "당산", "2호선", 300, "서울"))
    res = _run(off, _usage(("A", "all_linked", 100.0, 90.0, 2, 2, 12, True), ("B", "all_linked", 50.0, 40.0, 1, 1, 12, True)), _exits())
    assert res["selected"]["count"] == 2 and [s["name"] for s in res["stations"]] == ["영등포구청", "당산"]
    assert res["stations"][0]["lines"] == "2호선·5호선"
    assert len({s["complex_id"] for s in res["stations"]}) == len(res["stations"])


def test_counts_by_radius_match_brute_force_are_nested_and_include_the_boundary():
    norths = [40, 240, 260, 480, 520, 900, 990, 1010, 1500]
    off = _official(*[(f"C{i}", f"역{i}", "2호선", m, "서울") for i, m in enumerate(norths)])
    res = _run(off, _usage(), _exits())
    by = {int(r): v["count"] for r, v in res["by_radius"].items()}
    assert by == {250: 2, 500: 4, 1000: 7}
    cx = rail_access.build_complexes(off, _usage(), _exits())
    d = bus_access._haversine_m(LON0, LAT0, cx["lon"].to_numpy(), cx["lat"].to_numpy())
    assert by == {r: int((d <= r).sum()) for r in rail_access.RADII_M} and by[250] <= by[500] <= by[1000]
    assert res["nearest_station"]["distance_m"] == 40 and res["selected"]["radius_m"] == res["radius_m"] == 500
    with pytest.raises(ValueError):
        _run(off, _usage(), _exits(), radius=300)


# ── 출입구 우선 포함 기준 ──────────────────────────────────────────────────────────────────────

def test_entrance_distance_is_used_when_available_and_center_otherwise_without_double_counting():
    off = _official(("E", "출입구있는역", "2호선", 100, "서울"), ("C", "중심점만있는역", "2호선", 300, "서울"), ("O", "중심은안이고출구는밖인역", "2호선", 480, "서울"))
    ex = _exits(("E", "1번출구", 130), ("E", "2번출구", 160), ("O", "1번출구", 560))        # E: 출구 2개(가장 가까운 130m), O: 중심 480m 지만 출구는 560m
    res = _run(off, _usage(), ex, radius=500)
    s = res["selected"]
    assert s["count"] == 2 and s["stations_by_basis"] == {"entrance": 1, "center": 1} and s["mixed_basis"] is True        # E·C 만 포함, O 는 출구 기준 밖
    assert s["entrances"] == 2 and s["center_inside_but_entrance_outside"] == 1                                              # 출입구 수는 출구 좌표만 센다(중심점과 합치지 않음)
    by_name = {st["name"]: st for st in res["stations"]}
    assert by_name["출입구있는역"]["basis"] == "entrance" and by_name["출입구있는역"]["distance_m"] == pytest.approx(130, abs=2) and by_name["출입구있는역"]["center_distance_m"] == pytest.approx(100, abs=2)
    assert by_name["중심점만있는역"]["basis"] == "center" and not by_name["중심점만있는역"]["has_entrances"] and by_name["중심점만있는역"]["entrances"] == []
    assert [e["exit_no"] for e in by_name["출입구있는역"]["entrances"]] == ["1", "2"]
    ne = res["nearest_entrance"]
    assert ne["exit_no"] == "1" and ne["station_name"] == "출입구있는역" and ne["distance_m"] == pytest.approx(130, abs=2) and "비공식" in ne["source"]
    s1000 = res["by_radius"]["1000"]
    assert s1000["count"] == 3 and s1000["entrances"] == 3 and s1000["stations_by_basis"] == {"entrance": 2, "center": 1}


def test_a_station_without_entrances_never_borrows_another_stations_entrances_and_no_entrances_anywhere_is_none():
    off = _official(("A", "역", "2호선", 100, "서울"))
    res = _run(off, _usage(), _exits())
    assert res["nearest_entrance"] is None and res["selected"]["entrances"] == 0 and res["selected"]["stations_by_basis"] == {"entrance": 0, "center": 1} and not res["selected"]["mixed_basis"]


def test_entrance_scope_completeness_follows_the_collected_buffer():
    off = _official(("A", "역", "2호선", 100, "서울"))
    assert _run(off, _usage(), _exits(), 500, pilot_m=0.0)["selected"]["entrance_scope_complete"] is True
    assert _run(off, _usage(), _exits(), 1000, pilot_m=300.0)["selected"]["entrance_scope_complete"] is False     # 300+1000 > 1100
    assert _run(off, _usage(), _exits(), 500, pilot_m=None)["selected"]["entrance_scope_complete"] is False
    assert _run(off, _usage(), _exits(), 500, pilot_m=600.0)["scope"]["entrance_scope_complete"] is True          # 600+500 ≤ 1100


# ── 이용량 ─────────────────────────────────────────────────────────────────────────────────

def test_usage_only_for_linked_stations_inside_the_radius_and_missing_is_not_zero():
    off = _official(("L", "연결역", "2호선", 100, "서울"), ("N", "자료없는역", "2호선", 200, "서울"), ("T", "지방역", "1호선", 300, "대전"), ("F", "먼연결역", "2호선", 900, "서울"),
                    ("P", "일부노선역", "2호선", 350, "서울"), ("P", "일부노선역", "5호선", 360, "서울"))
    us = _usage(("L", "all_linked", 1000.0, 900.0, 1, 1, 12, True), ("N", "none_linked", None, None, 0, 1, 0, False), ("T", "none_linked", None, None, 0, 1, 0, False),
                ("F", "all_linked", 99999.0, 88888.0, 1, 1, 12, True), ("P", "partial", 400.0, 300.0, 1, 2, 12, True))
    s = _run(off, us, _exits(), radius=500)["selected"]
    assert s["count"] == 4 and s["linked"] == 2 and s["unlinked"] == 2 and s["linked_ratio"] == pytest.approx(0.5)
    assert s["usage_state"] == "partial"
    assert (s["boardings_observed"], s["alightings_observed"]) == (1400.0, 1200.0)           # 반경 밖(900m) 먼연결역의 값은 더하지 않았고 승차·하차는 따로
    assert s["partial_line_stations"] == 1 and s["complete_2025_stations"] == 2 and s["no_source_region_stations"] == 1
    res = _run(off, us, _exits(), radius=500)
    by = {st["name"]: st["usage"] for st in res["stations"]}
    assert by["자료없는역"]["state"] == "none_linked" and by["자료없는역"]["boardings"] is None and by["자료없는역"]["reason"] == "no_usage_row"      # 서울 자료 지역인데 연결 못 한 역
    assert by["지방역"]["boardings"] is None and by["지방역"]["reason"] == "no_source_for_region"                                                    # 이용량 자료를 받지 않은 지역
    assert by["일부노선역"]["lines_with_usage"] == 1 and by["일부노선역"]["lines_total"] == 2
    assert not any(k in s for k in ("total_observed", "riders", "boardings_plus_alightings", "transfers"))
    assert res["scope"]["usage_regions"] == ["서울"]


def test_none_linked_and_no_stations_states_are_distinct_and_never_zero():
    off = _official(("N", "자료없는역", "2호선", 100, "서울"))
    none = _run(off, _usage(("N", "none_linked", None, None, 0, 1, 0, False)), _exits())["selected"]
    assert none["usage_state"] == "none_linked" and none["boardings_observed"] is None and none["alightings_observed"] is None and none["linked_ratio"] == 0.0
    empty = _run(_official(("X", "먼역", "2호선", 5000, "서울")), _usage(), _exits())["selected"]
    assert empty["count"] == 0 and empty["count_state"] == "zero" and empty["usage_state"] == "no_stations" and empty["linked_ratio"] is None and empty["boardings_observed"] is None


def test_real_zero_usage_value_is_kept_as_zero_not_missing():
    off = _official(("Z", "한산한역", "2호선", 100, "서울"))
    s = _run(off, _usage(("Z", "all_linked", 0.0, 0.0, 1, 1, 12, True)), _exits())["selected"]
    assert s["boardings_observed"] == 0.0 and s["usage_state"] == "all_linked"


def test_unavailable_when_rail_files_are_missing_and_the_rest_of_the_response_is_untouched(client, monkeypatch):
    real = data_store.load_parquet

    def fake(name: str):
        if name == "rail_official_stations.parquet":
            raise data_store.DataNotReady("rail_official_stations.parquet 없음")
        return real(name)
    monkeypatch.setattr(data_store, "load_parquet", fake)
    sid = data_store.load_parquet("stores.parquet").sort_values("bizesId").iloc[7]["bizesId"]
    body = client.get(f"/api/stores/{sid}/location-influence", params={"radius_m": 500}).json()
    rail = body["radius_metrics"]["rail"]
    assert rail["status"] == "unavailable" and "확인 불가" in rail["message"] and "count" not in rail
    assert body["radius_metrics"]["bus"]["status"] in ("ok", "unavailable") and "same_category" in body["radius_metrics"]["competitors"]


# ── 실제 산출물 ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def real():
    try:
        return (data_store.load_parquet("rail_official_stations.parquet"), data_store.load_parquet("rail_usage_complex_2025.parquet"),
                data_store.load_parquet("rail_entrance_links.parquet"), data_store.load_json("rail_national_meta.json"))
    except data_store.DataNotReady:
        pytest.skip("rail_*.parquet 없음 — pipelines 의 build_rail_national 을 먼저 실행")


def _store(idx):
    return data_store.load_parquet("stores.parquet").sort_values("bizesId").iloc[idx]


@pytest.mark.parametrize("idx", [321, 5000, 30000])
def test_real_store_counts_match_an_independent_calculation_for_every_radius(real, idx):
    official, usage, links, meta = real
    st = _store(idx)
    lon, lat = float(st["lon"]), float(st["lat"])
    # 독립 계산: 역사 중심점(소속 행 평균)·출입구 거리를 직접 구해 같은 규칙을 적용
    g = official[official["coord_ok"]].groupby("national_complex_id")[["lon", "lat"]].mean()
    cd = pd.Series(bus_access._haversine_m(lon, lat, g["lon"].to_numpy(), g["lat"].to_numpy()), index=g.index)
    ed = pd.Series(bus_access._haversine_m(lon, lat, links["lon"].to_numpy(), links["lat"].to_numpy()), index=links.index)
    emin = ed.groupby(links["national_complex_id"]).min()
    eff = cd.copy()
    eff.loc[emin.index.intersection(eff.index)] = emin.loc[emin.index.intersection(eff.index)]
    for radius in (250, 500, 1000):
        res = rail_access.metrics(st, radius)
        sel = res["selected"]
        assert sel["count"] == int((eff <= radius).sum()), radius
        assert sel["entrances"] == int((ed <= radius).sum())
        assert res["by_radius"][str(radius)] == sel and len(res["stations"]) == sel["count"]
        assert res["nearest_station"]["distance_m"] == int(round(float(eff.min())))
    a = [rail_access.metrics(st, r)["selected"]["count"] for r in (250, 500, 1000)]
    assert a[0] <= a[1] <= a[2]


def test_real_transfer_stations_are_not_double_counted_and_usage_equals_the_sum_of_listed_stations(real):
    official, usage, links, meta = real
    for idx in (321, 5000, 12345, 30000, 41000):
        res = rail_access.metrics(_store(idx), 1000)
        names = [s["complex_id"] for s in res["stations"]]
        assert len(names) == len(set(names))
        sel = res["selected"]
        linked = [s for s in res["stations"] if s["usage"]["boardings"] is not None]
        assert sel["linked"] == len(linked)
        if linked:
            assert sel["boardings_observed"] == pytest.approx(sum(s["usage"]["boardings"] for s in linked), abs=0.2)
            assert sel["alightings_observed"] == pytest.approx(sum(s["usage"]["alightings"] for s in linked), abs=0.2)
        else:
            assert sel["boardings_observed"] is None
    # 환승 역사는 노선 수만큼이 아니라 한 번만 센다
    multi = official.groupby("national_complex_id")["line_std"].nunique()
    assert (multi > 1).sum() > 20


def test_real_usage_matches_the_pipeline_summary_and_keeps_source_info(real):
    official, usage, links, meta = real
    res = rail_access.metrics(_store(321), 1000)
    u = usage.set_index("national_complex_id")
    for s in res["stations"]:
        row = u.loc[s["complex_id"]]
        assert s["usage"]["state"] == row["usage_state"] and s["usage"]["complete_2025"] == bool(row["complete_2025"] and row["usage_state"] != "none_linked")
        if s["usage"]["boardings"] is not None:
            assert s["usage"]["boardings"] == pytest.approx(float(row["avg_daily_boardings_2025"]))
            assert s["usage"]["sources"] and s["usage"]["months_observed"] == int(row["months_observed_min"])
    assert res["usage_basis"]["year"] == 2025 and res["usage_basis"]["sources"] and res["scope"]["location_regions"] and res["scope"]["usage_regions"]
    assert "2026-06" in res["source"]["reference"] or "2022-04" in res["source"]["reference"]


def test_api_returns_the_selected_radius_stays_backward_compatible_and_json_serialisable(client, real):
    st = _store(321)
    sid = st["bizesId"]
    base = client.get(f"/api/stores/{sid}/location-influence", params={"radius_m": 500}).json()
    for radius in (250, 500, 1000):
        r = client.get(f"/api/stores/{sid}/location-influence", params={"radius_m": radius})
        assert r.status_code == 200
        body = r.json()
        rail = body["radius_metrics"]["rail"]
        assert body["radius_m"] == rail["radius_m"] == rail["selected"]["radius_m"] == radius          # API·UI·지도가 같은 반경을 쓴다
        assert rail["selected"]["count"] == len(rail["stations"]) and rail["by_radius"][str(radius)] == rail["selected"]
        json.dumps(rail)
        for key in ("anchors", "competitors", "bus"):                                                     # 기존 블록은 그대로 있다
            assert key in body["radius_metrics"]
    again = client.get(f"/api/stores/{sid}/location-influence", params={"radius_m": 500}).json()
    for key in ("anchors", "competitors", "bus"):
        assert again["radius_metrics"][key] == base["radius_metrics"][key]
    assert client.get(f"/api/stores/{sid}/location-influence", params={"radius_m": 300}).status_code == 422


# ── 최종 안정성: 출입구 일부·없음, 이용량 없는 지역, 기존 분석 영향 없음 ────────────────────────────

def _station_point(real, name_part: str, dlon: float = 0.0, dlat: float = 0.0) -> dict:
    official = real[0]
    g = official[official["name"].str.contains(name_part)].iloc[0]
    return {"lon": float(g["lon"]) + dlon, "lat": float(g["lat"]) + dlat}


def test_real_station_without_entrance_data_falls_back_to_the_center_and_says_the_entrance_scope_is_limited(real):
    """당곡(신림선): 출입구 자료가 없다 — 중심점 기준으로 세고 출입구 수집 범위 밖임을 알린다."""
    p = _station_point(real, "당곡", 0.002)
    for radius in (250, 500):
        res = rail_access.metrics(p, radius)
        st = {s["name"]: s for s in res["stations"]}["당곡"]
        assert st["basis"] == "center" and not st["has_entrances"] and st["entrances"] == []
        assert res["selected"]["stations_by_basis"] == {"entrance": 0, "center": res["selected"]["count"]} and res["selected"]["entrances"] == 0
        assert res["selected"]["entrance_scope_complete"] is False and res["scope"]["entrance_scope_complete"] is False
        assert st["distance_m"] == st["center_distance_m"]                                   # 중심점 거리를 그대로 쓴다
    assert rail_access.metrics(p, 500)["nearest_entrance"] is not None                         # 가까운 출입구가 하나도 없는 것은 아니고, 다른 역의 출구가 최근접일 뿐


def test_real_mixed_basis_is_reported_when_only_some_stations_have_entrances(real):
    res = rail_access.metrics(_station_point(real, "당곡", 0.002), 1000)
    s = res["selected"]
    assert s["mixed_basis"] is True and s["stations_by_basis"]["entrance"] >= 1 and s["stations_by_basis"]["center"] >= 1
    by = {x["name"]: x["basis"] for x in res["stations"]}
    assert by["당곡"] == "center" and by["보라매병원"] == "entrance"
    for x in res["stations"]:
        assert x["has_entrances"] == (x["basis"] == "entrance") == bool(x["entrances"])      # 출입구가 있으면 출입구 기준, 없으면 중심점 기준 — 둘을 섞어 쓰지 않는다


def test_real_no_usage_region_shows_missing_not_zero(real):
    """이용량 자료를 받지 않은 지역(대구)의 역: 승하차는 None('자료 없음'), 0 이 아니다."""
    p = _station_point(real, "동대구")
    res = rail_access.metrics(p, 1000)
    s = res["selected"]
    assert s["count"] >= 1 and s["usage_state"] == "none_linked" and s["linked"] == 0 and s["linked_ratio"] == 0.0
    assert s["boardings_observed"] is None and s["alightings_observed"] is None and s["no_source_region_stations"] == s["count"]
    for st in res["stations"]:
        assert st["usage"]["boardings"] is None and st["usage"]["alightings"] is None and st["usage"]["reason"] == "no_source_for_region" and st["usage"]["sources"] == []
    assert "대구" not in res["scope"]["usage_regions"] and "서울" in res["scope"]["usage_regions"]


def test_real_empty_area_is_a_real_zero_with_distance_to_the_nearest_station(real):
    res = rail_access.metrics({"lon": 125.5, "lat": 34.0}, 1000)
    assert res["selected"]["count"] == 0 and res["selected"]["count_state"] == "zero" and res["selected"]["usage_state"] == "no_stations" and res["stations"] == []
    assert res["nearest_station"]["distance_m"] > 100_000 and res["nearest_station"]["in_radius"] is False


def test_rail_failure_is_isolated_and_the_other_blocks_keep_working(client, monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("깨진 자료")
    monkeypatch.setattr(rail_access, "compute", boom)
    sid = _store(7)["bizesId"]
    r = client.get(f"/api/stores/{sid}/location-influence", params={"radius_m": 500})
    assert r.status_code == 200
    rm = r.json()["radius_metrics"]
    assert rm["rail"]["status"] == "unavailable" and "확인 불가" in rm["rail"]["message"]
    assert "same_category" in rm["competitors"] and rm["anchors"]["status"] in ("ok", "no_data") and rm["bus"]["status"] in ("ok", "unavailable")


@pytest.mark.parametrize("idx", [321, 5000, 30000])
def test_existing_bus_anchor_and_competitor_blocks_are_unchanged_by_the_rail_block(client, real, idx):
    """응답의 기존 블록이 철도 계산 없이 각 서비스를 직접 부른 값과 같다(철도 추가가 기존 값을 바꾸지 않음)."""
    from app.services import location_influence, store_profile
    sid = _store(idx)["bizesId"]
    store_row = store_profile.get_store(sid)                       # analyze() 가 쓰는 것과 같은 매장 객체
    for radius in (250, 500, 1000):
        rm = client.get(f"/api/stores/{sid}/location-influence", params={"radius_m": radius}).json()["radius_metrics"]
        assert rm["bus"] == json.loads(json.dumps(bus_access.metrics(store_row, radius)))
        assert rm["anchors"] == json.loads(json.dumps(location_influence._anchor_metrics(sid, radius)))
        assert rm["competitors"] == json.loads(json.dumps(location_influence._competitor_metrics(store_row, radius)))
