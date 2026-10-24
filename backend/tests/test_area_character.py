"""상권 유형 및 입지 특성 — 규칙 분류(순수 함수)의 경계값·보류·복수 특성, 경계 기준 교통 사실, 외식 전체 기준 판정(선택 업종 무관), API."""
from __future__ import annotations

import json

import numpy as np
import pandas as pd
import pytest
import shapely

from app.services import area_character as ac
from app.services import data_store, food_map

REFS = {"store_density_p75": 400.0, "fac_density_median": 120.0, "transit_boardings_p75": 30000.0}


def _f(**kw) -> dict:
    base = {"workers": 3000, "residents": 3000, "rail_near": 0, "rail_linked": 0, "rail_boardings": None, "stores": 100, "area_km2": 0.5, "store_density": 200.0, "fac_density": 50.0,
            "lunch_rank": 50.0, "late_rank": 50.0}
    base.update(kw)
    return base


def _keys(res: dict) -> set[str]:
    return {t["key"] for t in res["traits"]}


# ── 규칙 경계값 ─────────────────────────────────────────────────────────────────────────────

def test_demand_thresholds_are_inclusive_and_the_middle_is_mixed():
    assert _keys(ac.classify(_f(workers=6000, residents=4000), REFS)) == {"business"}          # 정확히 60%
    assert _keys(ac.classify(_f(workers=5999, residents=4001), REFS)) == set() and ac.classify(_f(workers=5999, residents=4001), REFS)["headline"] == ac.MIXED_LABEL
    assert _keys(ac.classify(_f(workers=3000, residents=7000), REFS)) == {"residential"}       # 정확히 30%
    assert ac.classify(_f(workers=3001, residents=6999), REFS)["kind"] == "mixed"
    for w, r in [(10, 90), (0, 5000), (9000, 1000), (3001, 3000)]:
        assert not {"business", "residential"} <= _keys(ac.classify(_f(workers=w, residents=r), REFS))   # 업무와 주거는 동시에 붙지 않는다


def test_small_or_missing_population_holds_the_demand_traits_instead_of_guessing():
    for kw in ({"workers": 400, "residents": 500}, {"workers": None, "residents": 900}, {"workers": 1200, "residents": None}):
        res = ac.classify(_f(**kw), REFS)
        assert "business" not in _keys(res) and "residential" not in _keys(res) and any(h["key"] == "demand" for h in res["held"])
    assert _keys(ac.classify(_f(workers=500, residents=500), REFS)) == {"residential"} or ac.classify(_f(workers=500, residents=500), REFS)["held"] == []   # 합 1,000 은 판정(경계 포함)


def test_transit_hub_needs_a_nearby_station_with_linked_usage_at_or_above_the_threshold():
    ok = ac.classify(_f(rail_near=2, rail_linked=2, rail_boardings=30000.0), REFS)
    assert "transit" in _keys(ok) and any("30,000명 이상" in e for t in ok["traits"] if t["key"] == "transit" for e in t["evidence"])
    assert "transit" not in _keys(ac.classify(_f(rail_near=2, rail_linked=2, rail_boardings=29999.0), REFS))
    assert "transit" not in _keys(ac.classify(_f(rail_near=0), REFS)) and not any(h["key"] == "transit" for h in ac.classify(_f(rail_near=0), REFS)["held"])   # 역이 없는 것은 보류가 아니라 해당 없음
    held = ac.classify(_f(rail_near=1, rail_linked=0, rail_boardings=None), REFS)
    assert "transit" not in _keys(held) and any(h["key"] == "transit" for h in held["held"])         # 역은 있는데 이용량이 없으면 0명으로 보지 않고 보류


def test_commercial_needs_density_and_facilities_and_holds_when_the_base_is_unstable():
    hit = ac.classify(_f(store_density=400.0, fac_density=120.0), REFS)
    assert "commercial" in _keys(hit)
    assert "commercial" not in _keys(ac.classify(_f(store_density=399.0, fac_density=500.0), REFS))
    assert "commercial" not in _keys(ac.classify(_f(store_density=900.0, fac_density=119.0), REFS))
    for kw in ({"stores": 19}, {"area_km2": 0.009}, {"fac_density": None}, {"store_density": None}):
        res = ac.classify(_f(**{"store_density": 900.0, "fac_density": 500.0, **kw}), REFS)
        assert "commercial" not in _keys(res) and any(h["key"] == "commercial" for h in res["held"])


def test_multiple_traits_are_listed_together_and_hold_needs_no_evaluable_evidence():
    res = ac.classify(_f(workers=9000, residents=1000, rail_near=1, rail_linked=1, rail_boardings=50000.0, store_density=800.0, fac_density=300.0), REFS)
    assert _keys(res) == {"business", "transit", "commercial"} and res["kind"] == "traits"
    assert res["headline"] == "업무 중심형 + 교통 거점형 + 상업 집중형" and all(1 <= len(t["evidence"]) <= 3 for t in res["traits"])
    hold = ac.classify(_f(workers=None, residents=None, stores=3, store_density=None, fac_density=None), REFS)
    assert hold["kind"] == "hold" and hold["headline"] == ac.HOLD_LABEL and len(hold["held"]) == 2 and "근거가 부족" in hold["hold_reason"]
    # 수요는 보류지만 다른 특성이 있으면 그 특성만 표시(억지로 혼합·주거로 채우지 않음)
    partial = ac.classify(_f(workers=None, residents=None, rail_near=1, rail_linked=1, rail_boardings=40000.0), REFS)
    assert partial["headline"] == "교통 거점형" and any(h["key"] == "demand" for h in partial["held"])


def test_demand_label_is_reported_even_when_other_traits_are_shown():
    res = ac.classify(_f(workers=3500, residents=6500 - 2500, rail_near=1, rail_linked=1, rail_boardings=40000.0), REFS)
    assert res["demand_label"] == "혼합형" and _keys(res) == {"transit"}
    assert ac.classify(_f(workers=9000, residents=1000), REFS)["demand_label"] == "업무형" and ac.classify(_f(workers=1000, residents=9000), REFS)["demand_label"] == "주거형"
    assert ac.classify(_f(workers=100, residents=100), REFS)["demand_label"] is None


def test_evidence_uses_the_real_numbers_and_never_a_score_or_probability():
    res = ac.classify(_f(workers=9000, residents=1000, lunch_rank=95.0), REFS)
    ev = " ".join(e for t in res["traits"] for e in t["evidence"])
    assert "90%" in ev and "9,000" in ev and "상위 5%" in ev
    assert not any(k in json.dumps(res, ensure_ascii=False) for k in ("score", "점수", "확률"))


# ── 실제 데이터(경계 기준 사실) ───────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def real():
    try:
        ac._spatial()
    except data_store.DataNotReady:
        pytest.skip("rail/bus parquet 없음 — pipelines 를 먼저 실행")
    return True


def _all_units():
    return [(lv, c) for lv in ("dong", "trdar") for c in food_map._units()[lv]["code"]]


@pytest.fixture(scope="module")
def all_results(real):
    """188개 단위의 응답을 한 번만 계산해 테스트가 나눠 쓴다."""
    return {(lv, c): ac.character(lv, c, None, None) for lv, c in _all_units()}


def test_real_every_unit_returns_a_consistent_classification(all_results):
    seen = {}
    for (lv, code), r in all_results.items():
        t = r["type"]
        keys = {x["key"] for x in t["traits"]}
        assert not {"business", "residential"} <= keys
        assert (t["kind"] == "traits") == bool(keys) and t["headline"] == (" + ".join(x["label"] for x in t["traits"]) if keys else (ac.MIXED_LABEL if t["kind"] == "mixed" else ac.HOLD_LABEL))
        if t["kind"] == "hold":
            assert t["held"] and t["hold_reason"]
        ws = t["worker_share"]
        if "business" in keys:
            assert ws is not None and ws >= ac.WORKER_MIN * 100 - 0.05
        if "residential" in keys:
            assert ws is not None and ws <= ac.RESIDENT_MAX * 100 + 0.05
        seen[(lv, code)] = t["kind"]
    assert sum(1 for k in seen if k[0] == "dong") == 36 and sum(1 for k in seen if k[0] == "trdar") == 152
    kinds = pd.Series(list(seen.values())).value_counts().to_dict()
    assert kinds.get("traits", 0) > 100 and kinds.get("hold", 0) < 50 and kinds.get("mixed", 0) > 5       # 모두 한 유형으로 쏠리거나 대부분 보류가 아니다


def test_real_trait_counts_follow_the_documented_quantile_rules(all_results):
    """교통 거점은 같은 단위에서 역 이용량이 연결된 단위의 상위 25%, 보류는 사유와 함께 센다 — 파일럿 골든 수치."""
    for lv, (hub, hold_demand) in {"dong": (7, 1), "trdar": (17, 39)}.items():
        res = [v for (l, _), v in all_results.items() if l == lv]
        p75 = ac._refs(lv)["transit_boardings_p75"]
        hubs = [v for v in res if any(t["key"] == "transit" for t in v["type"]["traits"])]
        assert len(hubs) == hub and all(v["sections"]["transit"]["rail"]["boardings_observed"] >= p75 - 0.5 for v in hubs)
        assert sum(1 for v in res if any(h["key"] == "demand" for h in v["type"]["held"])) == hold_demand
        assert sum(1 for v in res if v["type"]["kind"] == "hold") == {"dong": 1, "trdar": 30}[lv]


def test_real_classification_does_not_depend_on_the_selected_industry_but_the_competition_section_does(real):
    a = ac.character("dong", "11560540", None, None)
    b = ac.character("dong", "11560540", "CS100001", None)
    assert a["type"] == b["type"] and a["sections"]["transit"] == b["sections"]["transit"] and a["sections"]["demand"] == b["sections"]["demand"]
    assert a["sections"]["competition"]["scope"]["sales_label"] != b["sections"]["competition"]["scope"]["sales_label"]
    assert a["sections"]["competition"]["stores"]["value"] != b["sections"]["competition"]["stores"]["value"]


def test_real_rail_facts_match_an_independent_boundary_calculation(real):
    from pyproj import Transformer
    to_m = Transformer.from_crs("EPSG:4326", "EPSG:5179", always_xy=True).transform
    off = data_store.load_parquet("rail_official_stations.parquet")
    usage = data_store.load_parquet("rail_usage_complex_2025.parquet")
    from app.services import rail_access
    cx = rail_access.build_complexes(off, usage, data_store.load_parquet("rail_entrance_links.parquet"))
    x, y = to_m(cx["lon"].to_numpy(), cx["lat"].to_numpy())
    pts = shapely.points(x, y)
    for lv, code in [("dong", "11560540"), ("dong", "11560515"), ("trdar", "3120143"), ("trdar", "3130248")]:
        sh = ac._shapes(lv)[code]
        d = shapely.distance(sh, pts)
        r = ac.character(lv, code, None, None)["sections"]["transit"]["rail"]
        assert len(r["inside"]) == int((d == 0).sum()) and len(r["within_250m"]) == int(((d > 0) & (d <= 250)).sum())
        names = [s["name"] for s in r["inside"] + r["within_250m"]]
        assert len(names) == len(set(names)) == r["count"]                                            # 환승 노선을 겹쳐 세지 않는다
        linked = [s for s in r["inside"] + r["within_250m"] if s["boardings"] is not None]
        assert r["linked"] == len(linked) and r["boardings_observed"] == pytest.approx(sum(s["boardings"] for s in linked), abs=1)


def test_real_bus_and_rail_usage_are_separate_and_missing_is_none_not_zero(all_results):
    bus = data_store.load_parquet("bus_stops.parquet")
    bus = bus[bus["is_primary"] & bus["x_5179"].notna()]
    pts = shapely.points(bus["x_5179"].to_numpy(), bus["y_5179"].to_numpy())
    for lv, code in [("dong", "11560540"), ("trdar", "3120143")]:
        t = ac.character(lv, code, None, None)["sections"]["transit"]
        b = bus[shapely.contains(ac._shapes(lv)[code], pts)]
        assert t["bus"]["count"] == len(b) and t["bus"]["linked"] == int((b["usage_status"] == "linked").sum())
        assert not any(k in t["bus"] or k in t["rail"] for k in ("total_boardings", "combined", "transfers"))
    none_bus = [k for k, v in all_results.items() if v["sections"]["transit"]["bus"]["count"] == 0][:3]
    assert none_bus
    for k in none_bus:
        bus_t = all_results[k]["sections"]["transit"]["bus"]
        assert bus_t["usage_state"] == "no_stops" and bus_t["boardings_observed"] is None and bus_t["linked_ratio"] is None


def test_real_dong_and_trdar_use_their_own_boundaries(real):
    """같은 곳을 가리켜도 행정동과 상권은 경계가 달라 값이 따로 나온다(서로 합치거나 대체하지 않음)."""
    d = ac.character("dong", "11560560", None, None)["sections"]["transit"]["bus"]["count"]
    t = ac.character("trdar", "3120142", None, None)["sections"]["transit"]["bus"]["count"]
    assert d != t
    r = ac.character("trdar", "3120143", None, None)
    assert r["level"] == "trdar" and "상권" in r["basis"]["unit"] or "행정동" in r["basis"]["unit"]


def test_real_response_has_the_four_sections_sources_and_no_overall_score(real):
    r = ac.character("trdar", "3120143", None, None)
    assert set(r["sections"]) == {"transit", "demand", "anchor", "competition"}
    assert r["basis"]["sources"] and r["basis"]["rules"] and "점수" in r["basis"]["label"] and "인과" in r["basis"]["label"]
    flat = json.dumps(r, ensure_ascii=False)
    assert '"score"' not in flat and "probability" not in flat and "rank" not in r["type"] and len(r["strengths"]) <= 3 and len(r["cautions"]) <= 3
    assert r["sections"]["demand"]["floating"]["label"] and r["sections"]["competition"]["stores"]["as_of"]


def test_api_status_codes_and_shape(client, real):
    ok = client.get("/api/food/units/dong/11560540/character")
    assert ok.status_code == 200 and ok.json()["type"]["headline"] and ok.json()["level"] == "dong"
    assert client.get("/api/food/units/trdar/3120143/character", params={"svc": "CS100001"}).status_code == 200
    assert client.get("/api/food/units/dong/nope/character").status_code == 404
    assert client.get("/api/food/units/gu/x/character").status_code == 400
    assert client.get("/api/food/units/dong/11560540/character", params={"svc": "XX"}).status_code in (400, 404, 422)


# ── 민감도·검증에서 나온 수정(기준값은 그대로, 문구·귀속·비교 기준만 바로잡음) ────────────────────────────

def test_params_override_the_thresholds_and_the_defaults_are_the_documented_baseline():
    assert ac.DEFAULT_PARAMS == {"worker_min": 0.60, "resident_max": 0.30, "min_pop": 1000, "transit_q": 0.75, "density_q": 0.75}
    f = _f(workers=5500, residents=4500)                                                     # 직장 55%
    assert _keys(ac.classify(f, REFS)) == set() and ac.classify(f, REFS)["kind"] == "mixed"
    assert _keys(ac.classify(f, REFS, {"worker_min": 0.50})) == {"business"}                  # 기준만 바꾸면 판정이 바뀐다(기본값은 그대로)
    assert ac.classify(f, REFS)["kind"] == "mixed"
    g = _f(workers=2500, residents=7500)                                                     # 직장 25%
    assert _keys(ac.classify(g, REFS)) == {"residential"} and _keys(ac.classify(g, REFS, {"resident_max": 0.20})) == set()
    assert ac.classify(_f(workers=100, residents=800), REFS)["demand_label"] is None and ac.classify(_f(workers=100, residents=800), REFS, {"min_pop": 500})["demand_label"] == "주거형"   # 최소 인구 500 이면 900명도 판정


def test_hold_reasons_name_the_real_numbers_and_what_was_actually_evaluated():
    r = ac.classify(_f(workers=300, residents=400), REFS)
    assert "700명" in r["held"][0]["reason"] and "1,000명" in r["held"][0]["reason"]
    c = ac.classify(_f(stores=12, area_km2=0.004, store_density=3000.0, fac_density=None), REFS)
    reason = next(h["reason"] for h in c["held"] if h["key"] == "commercial")
    assert "점포 12곳" in reason and "0.0040㎢" in reason and "집객시설 자료 없음" in reason
    hold = ac.classify(_f(workers=None, residents=None, store_density=10.0, fac_density=10.0), REFS)        # 상업·교통은 판정했지만 기준 미달
    assert hold["kind"] == "hold" and "기준에 해당하지 않음" in hold["hold_reason"]
    mixed_ev = ac.classify(_f(workers=4000, residents=6000), REFS)["mixed_evidence"]
    assert "기준에 해당하지 않음" in mixed_ev[1]
    held_mixed = ac.classify(_f(workers=4000, residents=6000, stores=3, store_density=None, fac_density=None), REFS)["mixed_evidence"]
    assert "단정하지 않음" in held_mixed[1]                                                                 # 상업 판정을 보류했는데 '특성이 없다'고 쓰지 않는다


def test_shared_station_is_reported_in_evidence_so_unit_usage_is_not_read_as_additive():
    res = ac.classify(_f(rail_near=1, rail_linked=1, rail_boardings=40000.0, rail_shared=4), REFS)
    ev = next(t["evidence"] for t in res["traits"] if t["key"] == "transit")
    assert any("4곳이 함께 포함" in e and "더하면 중복" in e for e in ev) and len(ev) == 3
    alone = next(t["evidence"] for t in ac.classify(_f(rail_near=1, rail_linked=1, rail_boardings=40000.0, rail_shared=1), REFS)["traits"] if t["key"] == "transit")
    assert len(alone) == 2


def test_small_area_commercial_trait_carries_a_density_warning():
    res = ac.classify(_f(stores=31, area_km2=0.016, store_density=1957.0, fac_density=300.0), REFS)
    ev = next(t["evidence"] for t in res["traits"] if t["key"] == "commercial")
    assert any("면적 0.016㎢로 작아 밀도가 과대하게 보일 수 있음" in e for e in ev)
    big = next(t["evidence"] for t in ac.classify(_f(stores=300, area_km2=0.5, store_density=600.0, fac_density=300.0), REFS)["traits"] if t["key"] == "commercial")
    assert not any("과대" in e for e in big)


def test_real_station_sharing_is_counted_and_unit_usage_would_double_count_if_summed(real):
    sp = ac._spatial()
    for lv in ("dong", "trdar"):
        by = {}
        for (l, c), x in sp.items():
            if l == lv:
                for s in x["stations"]:
                    by.setdefault(s["name"], []).append(s["shared_units"])
        assert all(len(set(v)) == 1 and v[0] == len(v) for v in by.values())                  # 역마다 '몇 곳이 함께 포함하는지'가 실제 귀속 수와 같다
    trdar_total = sum(s["boardings"] for (l, c), x in sp.items() if l == "trdar" for s in x["stations"] if s["boardings"] is not None)
    unique = {}
    for (l, c), x in sp.items():
        if l == "trdar":
            for s in x["stations"]:
                if s["boardings"] is not None:
                    unique[s["name"]] = s["boardings"]
    assert trdar_total > 2 * sum(unique.values())                                              # 상권별 값을 더하면 고유 합의 2배 넘게 부풀어 오른다 — 그래서 더하지 않는다고 표시


def test_real_competition_reference_only_applies_to_the_food_total_scope(real):
    a = ac.character("trdar", "3120143", None, None)["sections"]["competition"]
    b = ac.character("trdar", "3120143", "CS100001", None)["sections"]["competition"]
    assert a["reference_applies"] is True and a["reference_density_p75"] is not None
    assert b["reference_applies"] is False and b["reference_density_p75"] is None                # 한식만 고르면 외식 전체 기준과 직접 비교하지 않는다
    assert "모집단" in a["note"] and "집계 기준이 다릅니다" in a["note"]


def test_real_bus_link_caution_appears_only_below_the_documented_ratio(all_results):
    for (lv, c), r in all_results.items():
        bus = r["sections"]["transit"]["bus"]
        if bus["count"] and bus["linked_ratio"] is not None and bus["linked_ratio"] < ac.BUS_LINK_CAUTION:
            assert bus["caution"] and "연결률" in bus["caution"] and bus["caution"] in r["cautions"]
        else:
            assert not bus.get("caution")


def test_real_basis_states_relative_reference_success_disclaimer_and_data_sources(all_results):
    b = all_results[("dong", "11560540")]["basis"]
    assert "188개" in b["relative_note"] and "상대 위치" in b["relative_note"]
    assert "창업 성공 가능성" in b["success_note"] and "참고용" in b["label"]
    joined = " ".join(b["data_notes"])
    assert "상가정보" in joined and "서울시 상권분석서비스" in joined and "방문객이 아닙니다" in joined and "0이 아니라 '자료 없음'" in joined


def test_real_trdar_store_counts_follow_their_own_boundary(real):
    """상권 점포 수는 그 상권 경계 안 음식점을 직접 센 값과 같고(152곳 모두), 행정동은 행정동 코드 기준이라 경계 직접 계산과 근소하게 다를 수 있다."""
    from pyproj import Transformer
    to_m = Transformer.from_crs("EPSG:4326", "EPSG:5179", always_xy=True).transform
    st = data_store.load_parquet("stores.parquet")
    st = st[st["indsLclsNm"].astype(str).str.startswith("음식")]
    x, y = to_m(st["lon"].to_numpy(), st["lat"].to_numpy())
    pts = shapely.points(x, y)
    shapes = ac._shapes("trdar")
    for code in list(shapes)[::7]:
        assert ac.unit_features("trdar", code)["stores"] == int(shapely.contains(shapes[code], pts).sum())
    dong_total = sum(ac.unit_features("dong", c)["stores"] for c in ac._shapes("dong"))
    assert dong_total == int(sum(shapely.contains(poly, pts).sum() for poly in ac._shapes("dong").values()))     # 합계는 같다


@pytest.fixture(scope="module")
def all_feats(real):
    return {(lv, c): ac.unit_features(lv, c) for lv, c in _all_units()}


def _run(feats, params=None):
    return {k: ac.classify(f, ac.thresholds(k[0], params), params) for k, f in feats.items()}


def _count(res, lv, key):
    return sum(any(t["key"] == key for t in v["traits"]) for (l, _), v in res.items() if l == lv)


def test_real_sensitivity_is_monotonic_and_the_baseline_is_the_documented_table(all_feats):
    base = _run(all_feats)
    assert {lv: (_count(base, lv, "business"), _count(base, lv, "residential"), _count(base, lv, "transit"), _count(base, lv, "commercial")) for lv in ("dong", "trdar")} == {"dong": (2, 27, 7, 7), "trdar": (24, 67, 17, 18)}
    for lv in ("dong", "trdar"):
        w = [_count(_run(all_feats, {"worker_min": v}), lv, "business") for v in (0.5, 0.6, 0.7)]
        r = [_count(_run(all_feats, {"resident_max": v}), lv, "residential") for v in (0.2, 0.3, 0.4)]
        t = [_count(_run(all_feats, {"transit_q": v}), lv, "transit") for v in (0.80, 0.75, 0.70)]
        d = [_count(_run(all_feats, {"density_q": v}), lv, "commercial") for v in (0.80, 0.75, 0.70)]
        assert w == sorted(w, reverse=True) and r == sorted(r) and t == sorted(t) and d == sorted(d)           # 기준을 느슨하게 할수록 해당 단위가 단조롭게 늘어난다
    holds = {v: sum(x["kind"] == "hold" for (l, _), x in _run(all_feats, {"min_pop": v}).items() if l == "trdar") for v in (500, 1000, 2000)}
    assert holds[500] <= holds[1000] <= holds[2000] and (holds[500], holds[1000], holds[2000]) == (20, 30, 55)   # 최소 인구가 보류 수를 가장 크게 움직인다


def test_real_sensitivity_golden_transitions_for_the_recommendation(all_feats):
    base = _run(all_feats)

    def changed(params, lv):
        res = _run(all_feats, params)
        return sum(res[k]["headline"] != base[k]["headline"] for k in res if k[0] == lv)
    assert changed({"worker_min": 0.5}, "trdar") == 8 and changed({"worker_min": 0.7}, "trdar") == 6
    assert changed({"resident_max": 0.2}, "trdar") == 18 and changed({"resident_max": 0.4}, "trdar") == 6
    assert changed({"min_pop": 500}, "trdar") == 16 and changed({"min_pop": 2000}, "trdar") == 30
    assert max(changed(p, "dong") for p in ({"worker_min": 0.5}, {"worker_min": 0.7}, {"resident_max": 0.2}, {"resident_max": 0.4}, {"transit_q": 0.7}, {"density_q": 0.7}, {"min_pop": 2000})) <= 4   # 행정동은 안정적


def test_floating_peer_counts_match_the_nonmissing_rank_population(all_results):
    for (level, _), result in all_results.items():
        floating = result["sections"]["demand"]["floating"]
        if floating is None:
            continue
        table = ac._refs(level)["table"]
        assert floating["lunch_peer_count"] == int(table["lunch"].notna().sum())
        assert floating["late_peer_count"] == int(table["late"].notna().sum())


@pytest.mark.parametrize("level,code,key", [("dong", "11470510", "adongCd"), ("trdar", "3110592", "trdar_cd")])
def test_facility_breakdown_uses_same_boundary_source(level, code, key):
    row = data_store.load_parquet(f"{level}_hinterland.parquet").set_index(key).loc[code]
    result = ac.facility_breakdown(level, code)
    assert len(result) == len(ac.FACILITY_LABELS)
    for item in result:
        original = row[f"fac_{item['key']}"]
        assert item["count"] == (None if pd.isna(original) else original)
    assert ac.facility_breakdown(level, "missing") == []


def test_supplementary_facilities_excludes_unconfirmed_and_closed_medical(monkeypatch):
    fac = pd.DataFrame([
        {"facility_id": "a", "facility_type": "department_store", "analysis_eligible": True, "in_scope": True, "x_5179": 1, "y_5179": 1},
        {"facility_id": "b", "facility_type": "department_store", "analysis_eligible": False, "in_scope": True, "x_5179": 1, "y_5179": 1},
        {"facility_id": "c", "facility_type": "shopping_mall", "analysis_eligible": True, "in_scope": True, "x_5179": 9, "y_5179": 9},
    ])
    base = {"license_code": "010102", "status_norm": "active", "uptae": "의원", "lon": 1., "lat": 1., "road_key": "address", "jibun_key": "address"}
    lic = pd.DataFrame([{**base, "name_norm": "의원"}, {**base, "name_norm": "의원"}, {**base, "name_norm": "폐업", "status_norm": "closed"}, {**base, "name_norm": "종합", "license_code": "010101", "uptae": "종합병원"}, {**base, "name_norm": "밖", "lon": 9.}])
    with monkeypatch.context() as m:
        m.setattr(ac, "_shapes", lambda level: {"x": shapely.box(0, 0, 2, 2)})
        m.setattr(ac, "_to_m", lambda x, y: (x, y))
        m.setattr(ac.data_store, "load_parquet", lambda name: fac if name == "facilities.parquet" else lic)
        ac.supplementary_facilities.cache_clear()
        result = {r["key"]: r["count"] for r in ac.supplementary_facilities("dong", "x")}
        assert result == {"department_store": 1, "shopping_mall": 0, "hypermarket": None, "outlet": None, "hospital": 1}
    ac.supplementary_facilities.cache_clear()


def test_oliveyoung_matching_excludes_medical_and_deduplicates():
    base = {"bizesNm": "씨제이올리브영", "brchNm": "여의도점", "rdnmAdr": "서울 A", "lnoAdr": "서울 B", "indsSclsNm": "화장품 소매업", "lon": 126.9, "lat": 37.5}
    stores = pd.DataFrame([base, base, {**base, "bizesNm": "올리브영상의학과", "indsSclsNm": "기타 의원"}, {**base, "rdnmAdr": "서울 C", "brchNm": "다른점"}])
    result = ac.oliveyoung_stores(stores)
    assert len(result) == 2
    assert not result["bizesNm"].str.contains("의학과").any()
