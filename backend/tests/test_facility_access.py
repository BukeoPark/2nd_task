"""집객시설 접근성(준비 단계) — 공식·권한 확인 시설만 기본 분석 대상, 자료 없음≠0, 반경 경계값, 수집 범위·공식 범위·검색 한도 불완전 표시, 기존 공개 API 불변."""
from __future__ import annotations

import json

import numpy as np
import pandas as pd
import pytest

from app.services import bus_access, data_store, facility_access as fa

LAT0, LON0 = 37.5200, 126.9000
META = {"buffer_m": 1100, "incomplete_zones": []}


def _at(north_m: float, east_m: float = 0.0) -> tuple[float, float]:
    deg = np.pi * bus_access.EARTH_M / 180                                   # 거리 계산(구면 haversine)과 같은 척도: 위도 1도 ≈ 111,195m
    return LON0 + east_m / (deg * np.cos(np.radians(LAT0))), LAT0 + north_m / deg


def _fac(*rows) -> pd.DataFrame:
    """rows: dict(north_m, east_m, 그 밖에 덮어쓸 칸)"""
    out = []
    for i, r in enumerate(rows):
        lon, lat = _at(r.get("north_m", 0.0), r.get("east_m", 0.0))
        d = {"facility_id": f"F{i}", "facility_type": "cultural_facility", "subtype": "공연장", "name": f"시설{i}", "lon": lon, "lat": lat, "coord_ok": True, "usable": True, "in_scope": True,
             "counts_as_independent": True, "analysis_eligible": True, "source_name": "서울시 문화공간 정보", "source_type": "official", "coordinate_source": "seoul_cultural", "reference_date": "2026-10-17",
             "usage_permission_status": "confirmed", "coverage_status": "ok", "attribution": "서울특별시 문화공간 · 공공누리 제1유형"}
        d.update({k: v for k, v in r.items() if k not in ("north_m", "east_m")})
        out.append(d)
    return pd.DataFrame(out)


def _run(fac, radius=500, pilot_m=0.0, boundary_m=2000.0, **kw) -> dict:
    return fa.compute(LON0, LAT0, fac, kw.pop("meta", META), radius, pilot_m, boundary_m, **kw)


def _t(res, t, radius=None):
    return (res["by_radius"][str(radius)] if radius else res["selected"])["by_type"][t]


# ── 대상 선택·출처 ─────────────────────────────────────────────────────────────────────────

def test_only_official_confirmed_facilities_are_counted_by_default_and_unconfirmed_only_for_diagnosis():
    fac = _fac({"north_m": 100}, {"north_m": 150, "analysis_eligible": False, "source_type": "supplementary", "coordinate_source": "kakao", "usage_permission_status": "unconfirmed", "name": "카카오시설", "attribution": None})
    res = _run(fac)
    assert _t(res, "cultural_facility")["count"] == 1 and res["official_only"] is True and res["includes_unconfirmed"] is False
    assert [f["name"] for f in res["facilities"]] == ["시설0"] and all(f["source_type"] == "official" and f["usage_permission_status"] == "confirmed" for f in res["facilities"])
    diag = _run(fac, include_unconfirmed=True)
    assert _t(diag, "cultural_facility")["count"] == 2 and diag["includes_unconfirmed"] is True and {f["source_type"] for f in diag["facilities"]} == {"official", "supplementary"}


def test_facility_rows_carry_name_type_coordinates_source_reference_date_and_attribution():
    res = _run(_fac({"north_m": 100, "reference_date": "2026-10-17"}))
    f = res["facilities"][0]
    assert {"name", "type", "subtype", "lon", "lat", "distance_m", "source_name", "source_type", "coordinate_source", "reference_date", "usage_permission_status", "coverage_status", "attribution"} <= set(f)
    assert f["distance_m"] == pytest.approx(100, abs=1) and res["attributions"] == ["서울특별시 문화공간 · 공공누리 제1유형"]
    assert not any(k in json.dumps(res, ensure_ascii=False) for k in ("visitors", "방문객 수:", "score"))


def test_types_without_an_official_source_are_unavailable_not_zero():
    res = _run(_fac({"north_m": 100}))
    for t in ("university", "department_store", "shopping_mall", "outlet", "hypermarket", "cinema"):
        x = _t(res, t)
        assert x["count"] is None and x["count_state"] == "no_official_source" and x["nearest"] is None and not x["reliable"] and "자료 없음" in x["reason"]
    assert _t(res, "cultural_facility")["count_state"] == "ok"


def test_closed_facilities_college_units_and_missing_coordinates_are_never_counted():
    fac = _fac({"north_m": 100, "usable": False, "analysis_eligible": False}, {"north_m": 120, "counts_as_independent": False, "analysis_eligible": False, "facility_type": "university", "facility_level": "college_unit"},
               {"north_m": 130, "coord_ok": False, "analysis_eligible": False}, {"north_m": 140})
    both = _run(fac, include_unconfirmed=True)
    assert _t(both, "cultural_facility")["count"] == 1 and _t(both, "university")["count"] is None      # 단과대학 건물은 진단 모드에서도 독립 대학으로 세지 않는다(독립 시설이 없으면 자료 없음)
    assert _t(_run(fac), "cultural_facility")["count"] == 1


# ── 반경 경계값·좌표 정확도 ─────────────────────────────────────────────────────────────────

def test_radius_boundaries_are_inclusive_nested_and_match_independent_distances():
    norths = [40, 240, 260, 480, 520, 900, 990, 1010, 1500]
    fac = _fac(*[{"north_m": m} for m in norths])
    res = _run(fac, 1000, pilot_m=0.0, boundary_m=5000.0)
    counts = {int(r): v["by_type"]["cultural_facility"]["count"] for r, v in res["by_radius"].items()}
    d = bus_access._haversine_m(LON0, LAT0, fac["lon"].to_numpy(), fac["lat"].to_numpy())
    assert counts == {250: int((d <= 250).sum()), 500: int((d <= 500).sum()), 1000: int((d <= 1000).sum())} == {250: 2, 500: 4, 1000: 7}
    assert counts[250] <= counts[500] <= counts[1000]
    assert _t(res, "cultural_facility", 250)["nearest"]["distance_m"] == pytest.approx(40, abs=1)
    inc = _run(_fac({"north_m": 249.0}), 250)["facilities"]                                       # 경계 안쪽(249m)은 들고 바깥쪽(251m)은 들지 않는다
    assert len(inc) == 1 and 248 <= inc[0]["distance_m"] <= 250 and _run(_fac({"north_m": 251.0}), 250)["facilities"] == []
    with pytest.raises(ValueError):
        _run(fac, 300)


def test_haversine_distance_agrees_with_the_wgs84_ellipsoid_within_a_third_of_a_percent():
    from pyproj import Geod
    geod = Geod(ellps="WGS84")
    rng = np.random.default_rng(3)
    for dn, de in rng.uniform(-900, 900, size=(40, 2)):
        lon, lat = _at(dn, de)
        _, _, true_m = geod.inv(LON0, LAT0, lon, lat)
        ours = float(bus_access._haversine_m(LON0, LAT0, np.array([lon]), np.array([lat]))[0])
        assert abs(ours - true_m) <= max(0.003 * true_m, 0.5), (dn, de, ours, true_m)            # 1km 반경에서 약 3m 이내의 차이(구면 근사)


def test_distance_uses_wgs84_coordinates_not_a_flat_degree_approximation():
    east = _run(_fac({"east_m": 400}), 500)["facilities"][0]["distance_m"]
    north = _run(_fac({"north_m": 400}), 500)["facilities"][0]["distance_m"]
    assert east == pytest.approx(400, abs=2) and north == pytest.approx(400, abs=2)                # 위도에 따른 경도 길이를 반영한다


# ── 불완전·누락 ─────────────────────────────────────────────────────────────────────────────

def test_extent_gaps_make_zero_counts_unavailable_and_nonzero_counts_lower_bounds():
    fac = _fac({"north_m": 900})
    inside = _t(_run(fac, 250, pilot_m=0.0), "cultural_facility")
    assert inside["count_state"] == "zero" and inside["reliable"] and not inside["incomplete"]
    zero = _t(_run(fac, 250, pilot_m=950.0), "cultural_facility")                                 # 950+250 > 1100: 수집 범위 밖까지 걸림
    assert zero["count"] == 0 and zero["count_state"] == "incomplete_zero" and not zero["reliable"] and "수집 범위" in zero["reason"]
    low = _t(_run(_fac({"north_m": 100}), 500, pilot_m=900.0), "cultural_facility")
    assert low["count"] == 1 and low["count_state"] == "lower_bound"
    assert _t(_run(fac, 250, pilot_m=None), "cultural_facility")["count_state"] == "incomplete_zero"


def test_an_official_source_limited_to_the_two_pilot_districts_makes_a_radius_crossing_the_boundary_partial(monkeypatch):
    """지금은 이 범위의 공식 종류가 없다(종합병원도 심평원 전국 자료가 생겼다) — 두 구뿐인 원천이 생길 때를 위한 장치를 종합병원으로 대신 시험한다."""
    monkeypatch.setitem(fa.OFFICIAL_COVERAGE, "general_hospital", "pilot_gus_only")
    fac = _fac({"north_m": 100, "facility_type": "general_hospital", "subtype": "종합병원"})
    ok = _t(_run(fac, 500, boundary_m=800.0), "general_hospital")
    partial = _t(_run(fac, 1000, boundary_m=800.0), "general_hospital")
    assert ok["count_state"] == "ok" and partial["count_state"] == "lower_bound" and "양천·영등포" in partial["reason"]
    assert _t(_run(fac, 500, boundary_m=None), "general_hospital")["count_state"] == "lower_bound"          # 구 밖 점은 공식 범위를 벗어난다
    assert _t(_run(_fac({"north_m": 900, "facility_type": "general_hospital"}), 250, boundary_m=100.0), "general_hospital")["count_state"] == "incomplete_zero"
    cult = _t(_run(_fac({"north_m": 100}), 1000, boundary_m=100.0), "cultural_facility")                    # 서울시 문화공간은 서울 전역 목록이라 구 경계와 무관
    assert cult["count_state"] == "ok"


def test_search_cap_zones_only_affect_unconfirmed_supplementary_diagnosis():
    lon, lat = _at(100)
    zone = {"query": "백화점", "types": ["department_store"], "rect": [lon - 0.001, lat - 0.001, lon + 0.001, lat + 0.001], "total_count": 154, "received": 45}
    meta = {**META, "incomplete_zones": [zone]}
    fac = _fac({"north_m": 100, "facility_type": "department_store", "analysis_eligible": False, "source_type": "supplementary", "coordinate_source": "kakao", "usage_permission_status": "unconfirmed"})
    diag = _t(_run(fac, 500, meta=meta, include_unconfirmed=True), "department_store")
    assert diag["count"] == 1 and diag["count_state"] == "lower_bound" and "검색 한도" in diag["reason"] and not diag["reliable"]
    assert _t(_run(fac, 500, meta=meta), "department_store")["count_state"] == "no_official_source"       # 공식만 쓸 때는 카카오 한도 구역을 말하지 않는다
    far = {**zone, "rect": [lon + 0.5, lat + 0.5, lon + 0.51, lat + 0.51]}
    assert _t(_run(fac, 500, meta={**META, "incomplete_zones": [far]}, include_unconfirmed=True), "department_store")["count_state"] == "ok"


def test_unavailable_when_files_are_missing(monkeypatch):
    def boom(name):
        raise data_store.DataNotReady("없음")
    monkeypatch.setattr(data_store, "load_parquet", boom)
    res = fa.metrics({"lon": LON0, "lat": LAT0}, 500)
    assert res["status"] == "unavailable" and "확인 불가" in res["message"] and "count" not in res


# ── 실제 산출물 ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def real():
    try:
        return data_store.load_parquet("facilities.parquet"), data_store.load_json("facilities_meta.json")
    except data_store.DataNotReady:
        pytest.skip("facilities.parquet 없음 — pipelines 의 collect_facilities → build_facilities 를 먼저 실행")


def _store(idx):
    return data_store.load_parquet("stores.parquet").sort_values("bizesId").iloc[idx]


@pytest.mark.parametrize("idx", [321, 5000, 30000])
def test_real_official_counts_match_an_independent_brute_force_for_every_radius(real, idx):
    fac, meta = real
    st = _store(idx)
    lon, lat = float(st["lon"]), float(st["lat"])
    pool = fac[fac["analysis_eligible"] & fac["in_scope"]]
    d = bus_access._haversine_m(lon, lat, pool["lon"].to_numpy(), pool["lat"].to_numpy())
    for radius in (250, 500, 1000):
        res = fa.metrics(st, radius)
        for t in ("general_hospital", "cultural_facility"):
            x = _t(res, t)
            expected = int(((pool["facility_type"] == t).to_numpy() & (d <= radius)).sum())
            assert x["count"] == expected, (t, radius)
            if x["count_state"] in ("ok", "zero"):
                assert x["reliable"]
        assert all(f["source_type"] == "official" and f["usage_permission_status"] == "confirmed" for f in res["facilities"])
        assert len(res["facilities"]) == sum(_t(res, t)["count"] or 0 for t in fa.TYPES)


def test_real_provenance_attribution_and_no_unconfirmed_data_in_the_default_response(real):
    st = _store(321)
    res = fa.metrics(st, 1000)
    assert res["attributions"] and all(("공공누리" in a or "소상공인" in a or "행정안전부" in a) for a in res["attributions"])
    assert "카카오" not in json.dumps(res, ensure_ascii=False).replace("카카오 검색 한도", "").replace("카카오 보조", "") or all(f["coordinate_source"] != "kakao" for f in res["facilities"])
    assert not any(f["coordinate_source"] == "kakao" for f in res["facilities"])


def test_real_removing_unconfirmed_kakao_data_changes_results_and_the_difference_is_reported(real):
    st = _store(321)
    diff = fa.source_difference(st, 1000)
    assert diff["status"] == "ok"
    cul = diff["by_type"]["cultural_facility"]
    assert cul["with_unconfirmed"] > cul["official_only"] >= 0 and cul["difference"] == cul["with_unconfirmed"] - cul["official_only"]
    for t in ("general_hospital", "department_store", "shopping_mall", "hypermarket", "cinema"):      # 심평원·행안부(대규모점포·영화상영관)가 공식 원천이 됐다
        assert diff["by_type"][t]["official_only"] is not None and diff["by_type"][t]["official_state"] != "no_official_source"
    for t in ("university", "outlet"):
        assert diff["by_type"][t]["official_only"] is None and diff["by_type"][t]["official_state"] == "no_official_source"       # 0 이 아니라 자료 없음
    assert all(diff["by_type"][t]["difference"] is None or diff["by_type"][t]["difference"] >= 0 for t in fa.TYPES)


def test_real_boundary_distance_is_none_outside_the_pilot_and_matches_polygon_inside(real):
    inside = _store(321)
    b = fa.pilot_boundary_distance_m(float(inside["lon"]), float(inside["lat"]))
    assert b is not None and 0 <= b < 10_000
    assert fa.pilot_boundary_distance_m(127.5, 36.5) is None


def test_public_api_responses_are_unchanged_and_do_not_expose_facility_data(client, real):
    sid = _store(321)["bizesId"]
    body = client.get(f"/api/stores/{sid}/location-influence", params={"radius_m": 500}).json()
    assert set(body["radius_metrics"]) == {"anchors", "competitors", "bus", "rail"}                    # 집객시설 블록을 아직 붙이지 않았다
    assert "facilit" not in json.dumps(body, ensure_ascii=False).lower()
    assert client.get(f"/api/stores/{sid}/location-influence", params={"radius_m": 300}).status_code == 422
