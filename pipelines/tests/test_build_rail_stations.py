"""지하철·도시철도 정규화 — 합성 데이터로 환승 묶음·이용량 연결·중복·출구·반경 구조·고속철도 분리를 검증하고, 실제 산출물이 있으면 범위·연결률도 확인한다."""
from __future__ import annotations

import json
import math

import numpy as np
import pandas as pd
import pytest

from pipelines.collect import collect_rail_transit as c
from pipelines.common import config
from pipelines.transform import build_bus_stops as bus
from pipelines.transform import build_rail_stations as r


def _sl(*rows) -> pd.DataFrame:
    """rows: (id, name, line, x, y)"""
    return pd.DataFrame([{"station_line_id": i, "name": n, "name_norm": r.norm_name(n), "line": ln, "line_key": r.norm_line(ln), "x_5179": x, "y_5179": y, "source": "seoul_master"}
                         for i, n, ln, x, y in rows])


def _card(ym, line, name, on=10.0, off=5.0, job="20260101") -> dict:
    row = {"USE_MM": ym, "SBWY_ROUT_LN_NM": line, "STTN": name, "JOB_YMD": job}
    for h in range(24):
        row[f"HR_{h}_GET_ON_NOPE"] = on / 24
        row[f"HR_{h}_GET_OFF_NOPE"] = off / 24
    return row


# ── 이름·노선 ──────────────────────────────────────────────────────────────────────────────────

def test_name_and_line_normalisation():
    assert r.norm_name("대림(구로구청)") == "대림" == r.norm_name("대림")
    assert r.norm_name("신정 (은행정)") == "신정"
    assert r.norm_name("역삼") == "역삼" and r.norm_name("역곡") == "역곡"          # '역' 글자는 지우지 않는다
    assert r.norm_line("경의선") == r.norm_line("경의중앙선") == "경의중앙선"
    assert r.norm_line("공항철도 1호선") == "공항철도1호선" and r.norm_line("9호선2~3단계") == r.norm_line("9호선(연장)")


# ── 환승역·실제 역사 ───────────────────────────────────────────────────────────────────────────

def test_interchange_lines_are_one_complex_but_same_name_far_apart_and_neighbours_are_not():
    sl = _sl(("A2", "영등포구청", "2호선", 0, 0), ("A5", "영등포구청", "5호선", 150, 120),       # 환승역(약 192m)
             ("B1", "신촌", "2호선", 10_000, 0), ("B2", "신촌", "경의중앙선", 14_000, 0),            # 이름만 같고 4km 떨어진 다른 역
             ("C1", "당산", "2호선", 20_000, 0), ("C2", "합정", "2호선", 20_050, 0))                 # 가깝지만 이름이 달라 묶지 않음
    out = r.build_complexes(sl).set_index("station_line_id")["complex_id"]
    assert out["A2"] == out["A5"]
    assert out["B1"] != out["B2"]
    assert out["C1"] != out["C2"]
    assert out.nunique() == 5
    cx = r.summarize_complexes(r.build_complexes(sl).assign(lon=126.9, lat=37.5, line=lambda d: d["line"]))
    row = cx[cx["name"] == "영등포구청"].iloc[0]
    assert row["n_lines"] == 2 and row["n_station_lines"] == 2 and row["lines"] == "2호선·5호선"


def test_complex_ids_are_deterministic_regardless_of_input_order():
    sl = _sl(("A2", "영등포구청", "2호선", 0, 0), ("A5", "영등포구청", "5호선", 150, 120), ("Z", "문래", "2호선", 3000, 0))
    a = r.build_complexes(sl).sort_values("station_line_id")["complex_id"].tolist()
    b = r.build_complexes(sl.iloc[::-1].reset_index(drop=True)).sort_values("station_line_id")["complex_id"].tolist()
    assert a == b


# ── 이용량 정규화·연결 ─────────────────────────────────────────────────────────────────────────

def test_card_exact_duplicate_rows_are_removed_and_counted_but_conflicts_are_reported():
    a = pd.DataFrame([_card("202603", "2호선", "당산"), _card("202603", "2호선", "당산"), _card("202603", "2호선", "문래", on=48.0)])
    out, info = r.normalize_card([a])
    assert len(out) == 2 and info["exact_duplicate_rows"] == 1 and info["same_key_conflicts_kept_first"] == 0
    conflict = pd.DataFrame([_card("202603", "2호선", "당산"), _card("202603", "2호선", "당산", on=99.0)])
    _, info2 = r.normalize_card([conflict])
    assert info2["same_key_conflicts_kept_first"] == 1          # 값이 다른 같은 키는 조용히 합치지 않고 건수를 남긴다


def test_card_monthly_totals_never_fill_missing_hours_with_zero():
    row = _card("202501", "2호선", "당산", on=24.0, off=12.0)
    row["HR_5_GET_ON_NOPE"] = None
    out, info = r.normalize_card([pd.DataFrame([row, _card("202501", "2호선", "문래", on=24.0, off=12.0)])])
    d = out.set_index("name_raw")
    assert math.isnan(d.loc["당산", "boardings"]) and d.loc["당산", "alightings"] == pytest.approx(12.0)      # 빈 시간대가 있으면 승차 합계를 만들지 않는다
    assert d.loc["문래", "boardings"] == pytest.approx(24.0) and d.loc["문래", "days"] == 31
    assert info["rows_with_missing_hours"] == 1


def test_usage_link_exact_unique_ambiguous_and_never_by_coordinates():
    master = _sl(("S1", "당산", "2호선", 0, 0), ("S2", "당산", "9호선", 100, 0), ("S3", "문래", "2호선", 5000, 0), ("S4", "합정", "2호선", 9000, 0),
                 ("S5", "합정", "6호선", 9100, 0), ("S6", "여의도", "5호선", 0, 7000))
    keys = pd.DataFrame([("2호선", "당산"), ("9호선", "당산"), ("경부선", "문래"), ("5호선", "합정"), ("2호선", "없는역"), ("9호선", "여의도")],
                        columns=["line_key", "name_norm"])
    lk = r.link_usage(keys, master).set_index(["line_key", "name_norm"])
    assert lk.loc[("2호선", "당산"), "station_line_id"] == "S1" and lk.loc[("2호선", "당산"), "link_basis"] == "exact"
    assert lk.loc[("9호선", "당산"), "station_line_id"] == "S2"
    assert lk.loc[("경부선", "문래"), "link_basis"] == "name_unique"            # 노선 표기가 달라도 같은 이름의 후보가 하나뿐일 때
    assert pd.isna(lk.loc[("5호선", "합정"), "station_line_id"]) and lk.loc[("5호선", "합정"), "link_basis"] == "ambiguous"
    assert lk.loc[("2호선", "없는역"), "link_basis"] == "no_station"             # 좌표가 가까운 다른 역으로 대신 붙이지 않는다
    assert lk.loc[("9호선", "여의도"), "link_basis"] == "name_unique"


def test_one_station_with_two_usage_rows_is_not_linked_so_nothing_is_double_counted():
    master = _sl(("S1", "당산", "2호선", 0, 0))
    keys = pd.DataFrame([("2호선", "당산"), ("경부선", "당산")], columns=["line_key", "name_norm"])
    lk = r.link_usage(keys, master)
    assert lk["station_line_id"].isna().all() and set(lk["link_basis"]) == {"many_usage_keys"}


def test_period_average_uses_observed_days_and_keeps_boardings_and_alightings_separate():
    m = pd.DataFrame({"ym": ["202501", "202502", "202503"], "station_line_id": ["S1"] * 3, "boardings": [3100.0, 2800.0, 6200.0], "alightings": [310.0, 280.0, 620.0],
                      "days": [31, 28, 31]})
    avg = r.period_average(m, ["202501", "202502"])
    assert avg.loc["S1", "n"] == 2 and avg.loc["S1", "avg_on"] == pytest.approx((3100 + 2800) / 59, abs=0.05)
    assert avg.loc["S1", "avg_off"] == pytest.approx((310 + 280) / 59, abs=0.05)
    assert "avg_total" not in avg.columns and not any("transfer" in col for col in avg.columns)


# ── 출구 ────────────────────────────────────────────────────────────────────────────────────

def test_kakao_exit_and_station_names_are_parsed_and_non_exit_places_ignored():
    st = r.parse_kakao_stations([{"id": "1", "place_name": "영등포구청역 2호선", "x": "126.8967", "y": "37.5258"}, {"id": "2", "place_name": "공항철도 가는길", "x": "126.9", "y": "37.5"}])
    assert st.loc[0, "name"] == "영등포구청" and st.loc[0, "line"] == "2호선"
    ex = r.parse_kakao_exits([{"id": "9", "place_name": "영등포구청역 2호선 4번출구", "x": "126.8962", "y": "37.5247"}, {"id": "8", "place_name": "영등포구청 주차장", "x": "1", "y": "1"}])
    assert len(ex) == 1 and ex.loc[0, "exit_no"] == "4" and ex.loc[0, "station_name"] == "영등포구청"


def test_exits_link_to_the_nearest_same_name_station_and_prefer_the_same_line_but_far_ones_are_dropped():
    sl = _sl(("A2", "영등포구청", "2호선", 0, 0), ("A5", "영등포구청", "5호선", 150, 0), ("F", "당산", "2호선", 3000, 0))
    ex = pd.DataFrame([
        {"exit_id": "e1", "name_norm": "영등포구청", "line_key": "5호선", "x_5179": 140.0, "y_5179": 10.0},     # 5호선 쪽 출구
        {"exit_id": "e2", "name_norm": "영등포구청", "line_key": "경부선", "x_5179": 20.0, "y_5179": 0.0},      # 노선명이 달라도 이름이 같으면(가장 가까운 쪽)
        {"exit_id": "e3", "name_norm": "당산", "line_key": "2호선", "x_5179": 3000.0 + 900, "y_5179": 0.0},   # 800m 밖
        {"exit_id": "e4", "name_norm": "없는역", "line_key": "2호선", "x_5179": 0.0, "y_5179": 0.0}])
    out = r.link_exits(ex, sl).set_index("exit_id")
    assert out.loc["e1", "station_line_id"] == "A5" and out.loc["e1", "link_basis"] == "line_name"
    assert out.loc["e2", "station_line_id"] == "A2" and out.loc["e2", "link_basis"] == "name_only"
    assert pd.isna(out.loc["e3", "station_line_id"]) and out.loc["e3", "link_basis"] == "too_far"
    assert out.loc["e4", "link_basis"] == "no_station"


# ── 반경 구조 ────────────────────────────────────────────────────────────────────────────────

def test_radius_counts_and_nearest_match_brute_force_and_are_nested():
    rng = np.random.default_rng(7)
    x, y = rng.uniform(-1500, 1500, 300), rng.uniform(-1500, 1500, 300)
    for px, py in [(0.0, 0.0), (700.0, -400.0), (-1400.0, 1400.0)]:
        res = r.radius_metrics(x, y, px, py)
        d = np.hypot(x - px, y - py)
        assert res["counts"] == {250: int((d <= 250).sum()), 500: int((d <= 500).sum()), 1000: int((d <= 1000).sum())}
        assert res["counts"][250] <= res["counts"][500] <= res["counts"][1000]
        assert res["nearest_m"] == pytest.approx(d.min(), abs=0.1)
    assert r.radius_metrics(np.array([]), np.array([]), 0, 0) == {"counts": {250: 0, 500: 0, 1000: 0}, "nearest_m": None}
    assert r.radius_metrics(np.array([250.0, 500.0, 1000.0]), np.zeros(3), 0, 0)["counts"] == {250: 1, 500: 2, 1000: 3}   # 경계는 포함


# ── 고속철도 별도 ────────────────────────────────────────────────────────────────────────────

def test_high_speed_is_a_separate_type_with_unique_name_links_only():
    sr = [{"역명": "수서", "집계년도": 2025, "집계월": mo, "승차인원": 3100, "하차인원": 6200} for mo in (1, 2)]
    ktx = [{"정차역": "영등포", "운행년월": f"2023-{mo:02d}", "상행_승차인원수": 10, "상행_하차인원수": 20, "하행_승차인원수": 30, "하행_하차인원수": 40} for mo in range(1, 13)]
    cx = pd.DataFrame({"complex_id": ["C1", "C2", "C3"], "name_norm": ["영등포", "합정", "합정"]})
    hs = r.build_hs(sr, ktx, cx).set_index("station_name")
    assert set(hs["rail_type"]) == {"high_speed"}
    assert hs.loc["영등포", "complex_id"] == "C1" and hs.loc["영등포", "link_basis"] == "name_only"
    assert hs.loc["영등포", "boardings_total"] == 12 * 40 and hs.loc["영등포", "alightings_total"] == 12 * 60
    assert pd.isna(hs.loc["수서", "complex_id"]) and hs.loc["수서", "period"] == "2025-01~2025-02"
    assert hs.loc["수서", "avg_daily_boardings"] == pytest.approx(6200 / 59, abs=0.05)
    dup = r.build_hs(sr, ktx, pd.DataFrame({"complex_id": ["C2", "C3"], "name_norm": ["영등포", "영등포"]})).set_index("station_name")
    assert pd.isna(dup.loc["영등포", "complex_id"])                                  # 같은 이름의 역사가 둘이면 연결하지 않는다


# ── 설정·정책 ────────────────────────────────────────────────────────────────────────────────

def test_collection_extent_matches_the_bus_extent_and_radii():
    assert r.BUFFER_M == bus.BUFFER_M == c.BUFFER_M == 1_100
    assert r.RADII_M == (250, 500, 1000) and r.BUFFER_M >= 1000 + 100       # 1km 반경이 구역 경계에서 끊기지 않을 여유


def test_every_operator_label_comes_from_the_explicit_line_table():
    assert r.OPERATOR_BY_LINE["2호선"] == "서울교통공사" and r.OPERATOR_BY_LINE["9호선"] == "서울시메트로9호선" and "경강선" not in r.OPERATOR_BY_LINE   # 모르는 노선은 비워 둔다


# ── 실제 산출물(있을 때) ─────────────────────────────────────────────────────────────────────

def _real():
    p = config.PROCESSED_DIR
    if not (p / "rail_stations.parquet").exists():
        pytest.skip("rail_*.parquet 없음 — collect_rail_transit → build_rail_stations 를 먼저 실행")
    return (pd.read_parquet(p / "rail_stations.parquet"), pd.read_parquet(p / "rail_complexes.parquet"), pd.read_parquet(p / "rail_entrances.parquet"),
            pd.read_parquet(p / "rail_usage_monthly.parquet"), pd.read_parquet(p / "rail_hs_usage.parquet"), json.loads((p / "rail_meta.json").read_text(encoding="utf-8")))


def test_real_outputs_are_within_the_collected_extent_and_unique():
    sl, cx, en, use, hs, meta = _real()
    assert (sl["dist_to_pilot_m"] <= r.BUFFER_M).all() and (cx["dist_to_pilot_m"] <= r.BUFFER_M).all()
    assert sl["station_line_id"].is_unique and cx["complex_id"].is_unique and en["exit_id"].is_unique
    assert set(sl["complex_id"]) == set(cx["complex_id"])
    assert set(en["complex_id"]) <= set(cx["complex_id"])
    assert (cx["n_exits"] > 0).eq(cx["has_entrance_data"]).all()
    assert (cx.loc[~cx["has_entrance_data"], "distance_basis"] == "station_center_only").all()
    assert (en["dist_to_complex_m"] <= r.EXIT_MAX_M).all()
    assert cx["in_pilot"].sum() >= 1 and meta["buffer_m"] == r.BUFFER_M


def test_real_boundary_stations_from_neighbouring_districts_are_included_and_checked_against_kakao():
    """파일럿 구 밖(마포·구로·동작 등)의 역이 수집 범위에 들어 있고, 카카오 역 중 버퍼 안의 것은 모두 공식 마스터와 맞춰진다."""
    sl, cx, *_ = _real()
    assert (~cx["in_pilot"]).sum() >= 5 and cx.loc[~cx["in_pilot"], "dist_to_pilot_m"].max() > 500
    k_rows, _ = r._load("kakao_stations")
    m_rows, _ = r._load("seoul_master")
    master = r._project(r.normalize_master(m_rows))
    kakao = r._project(r.parse_kakao_stations(k_rows))
    extra, _ = r.merge_kakao_stations(master, kakao)
    assert not (extra["dist_to_pilot_m"] <= r.BUFFER_M).any()                       # 버퍼 안에 마스터가 놓친 역이 없다


def test_real_usage_is_never_summed_across_boardings_alightings_or_transfers_and_unlinked_is_empty():
    sl, cx, en, use, hs, meta = _real()
    for df in (sl, cx, use):
        assert not any(("transfer" in col) or ("total_usage" in col) or ("riders" in col) for col in df.columns)
    unlinked = sl[~sl["usage_link"].isin(["exact", "name_unique"])]
    assert unlinked[[c for c in sl.columns if c.startswith("avg_daily_")]].isna().all().all()     # 연결 안 된 역은 0 이 아니라 비어 있다
    assert use["boardings"].dropna().ge(0).all() and use["alightings"].dropna().ge(0).all()
    assert not use.duplicated(["ym", "line_raw", "name_raw"]).any()
    # 역사 값 = 소속 노선 값의 합(승차·하차 각각)
    sub = cx.set_index("complex_id")
    sums = sl.groupby("complex_id")["avg_daily_boardings_2025"].sum(min_count=1)
    assert np.allclose(sub.loc[sums.index, "avg_daily_boardings_2025"].fillna(-1), sums.fillna(-1), atol=0.11)


def test_real_high_speed_is_separate_from_metro_usage():
    sl, cx, en, use, hs, meta = _real()
    assert set(hs["rail_type"]) == {"high_speed"} and set(cx["rail_type"]) == {"metro"} and set(sl["rail_type"]) == {"metro"}
    assert set(hs["operator"]) == {"SR", "KORAIL_KTX"}
    assert not any(col.startswith("bus_") for df in (sl, cx, en, use, hs) for col in df.columns)    # 버스 표와 섞이지 않았다
    assert "버스" in meta["bus_overlap_policy"] and "합치지" in meta["bus_overlap_policy"]
