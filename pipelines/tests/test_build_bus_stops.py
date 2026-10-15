"""버스 정류장 위치·이용량 결합 — 합성 데이터로 연결 규칙(코드+이름만, 좌표만으로는 연결 안 함)·중복·결측·반경 계산을 검증한다."""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest
from sklearn.neighbors import BallTree

from pipelines.common import config
from pipelines.transform import build_bus_stops as b
from pipelines.transform.anchor_metrics import AnchorMetricConfig, compute_anchor_metrics, haversine_m


def _stop(uid, no, name, x=0.0, y=0.0, system="서울BIS", in_seoul=True, primary=True, **kw) -> dict:
    return {"stop_uid": uid, "mobile_no": no, "name": name, "x_5179": x, "y_5179": y, "admin_system": system, "coord_ok": True,
            "in_seoul": in_seoul, "is_primary": primary, **kw}


def _stops(*rows) -> pd.DataFrame:
    df = pd.DataFrame(rows)
    df["mobile_no"] = df["mobile_no"].astype("Int64")
    return df


def _use(row_id, mid, name, board=10.0, alight=5.0, transfer=1.0, gu=11560) -> dict:
    return {"usage_row_id": row_id, "gu_code": gu, "gu_name": "영등포구", "usage_stop_id": str(row_id), "usage_mobile_id": mid, "name": name, "year": 2025,
            "avg_daily_boardings": board, "avg_daily_alightings": alight, "avg_daily_transfers": transfer}


def _usage(*rows) -> pd.DataFrame:
    df = pd.DataFrame(rows)
    df["usage_mobile_id"] = df["usage_mobile_id"].astype("Int64")
    df["year"] = df["year"].astype("Int64")
    return df


# ── 정류장명 비교 ────────────────────────────────────────────────────────────────────────────────

def test_name_agreement_ignores_punctuation_and_allows_containment_but_not_empty_or_unrelated():
    assert b.names_agree("당산역 13번출구", "당산역13번출구")
    assert b.names_agree("목동3단지", "목동 3단지.이대목동병원")          # 한쪽이 다른 쪽을 포함
    assert b.names_agree("이대목동병원.목동6단지앞", "이대목동병원.목동6단지앞")
    assert not b.names_agree("문방구", "구기빌라")
    assert not b.names_agree("", "당산역") and not b.names_agree("당", "당산역")   # 1글자는 포함 관계로 인정하지 않음


# ── 같은 정류장의 BIS 별 중복 ───────────────────────────────────────────────────────────────────

def test_duplicates_need_same_number_same_name_and_within_50m_and_keep_the_seoul_record():
    s = _stops(
        _stop("GGB1", 15107, "목동3단지", 10, 10, "경기BIS"), _stop("SEB1", 15107, "목동3단지", 0, 0, "서울BIS"),       # 같은 번호·이름·9m → 중복
        _stop("SEB2", 20001, "A정류장", 0, 0), _stop("GGB2", 20001, "A정류장", 500, 0, "경기BIS"),                      # 같은 번호·이름이지만 500m → 별개
        _stop("SEB3", 20002, "B정류장", 0, 0), _stop("GGB3", 20002, "전혀다른이름", 5, 0, "경기BIS"),                    # 같은 번호·가까움이지만 이름이 다름 → 별개
        _stop("SEB4", 20003, "C정류장", 0, 0), _stop("GGB4", 20004, "C정류장", 5, 0, "경기BIS"),                        # 이름·거리는 같지만 번호가 다름 → 번호 없는 연결은 하지 않음
        _stop("SEB5", None, "D정류장", 0, 0), _stop("GGB5", None, "D정류장", 5, 0, "경기BIS"),                          # 번호 없음 → 묶지 않음
    )
    out = b.mark_duplicates(s.assign(lon=0.0, lat=0.0)).set_index("stop_uid")
    assert out.loc["GGB1", "is_primary"] == False and out.loc["GGB1", "duplicate_of"] == "SEB1" and out.loc["SEB1", "is_primary"]  # noqa: E712
    for uid in ("SEB2", "GGB2", "SEB3", "GGB3", "SEB4", "GGB4", "SEB5", "GGB5"):
        assert out.loc[uid, "is_primary"], uid


def test_mirror_records_merge_even_when_the_name_differs_and_coordinates_drift_but_only_with_the_same_number_and_code_tail():
    s = _stops(
        _stop("SEB114000156", 15259, "서울남부지방법원.서울남부지방검찰청", 0, 0), _stop("GGB114000156", 15259, "남부법원.검찰청교차로", 1, 0, "경기BIS"),   # 이름이 다른 미러 기록
        _stop("SEB114000221", 15325, "신월시영아파트", 0, 0), _stop("GGB114000221", 15325, "신월시영아파트", 207, 0, "경기BIS"),                       # 같은 이름이지만 좌표가 207m 어긋난 미러 기록
        _stop("SEB118000005", 19005, "영등포역", 0, 0), _stop("GGB118000005", 19005, "영등포역(중)", 50.8, 0, "경기BIS"),                              # 50m 를 갓 넘은 같은 정류장
        _stop("SEB114000300", 16000, "가", 0, 0), _stop("GGB114000999", 16000, "나다라", 100, 0, "경기BIS"),                                           # 번호는 같지만 코드 끝자리도 이름도 다름 → 별개
        _stop("SEB114000400", 17000, "마", 0, 0), _stop("GGB114000400", 17001, "마", 10, 0, "경기BIS"),                                                # 코드 끝자리·이름이 같아도 번호가 다름(맞은편) → 별개
        _stop("SEB114000500", 18000, "바", 0, 0), _stop("GGB114000500", 18000, "사아", 300, 0, "경기BIS"),                                             # 미러이지만 250m 밖 → 별개
    )
    out = b.mark_duplicates(s.assign(lon=0.0, lat=0.0)).set_index("stop_uid")
    for dup, primary in (("GGB114000156", "SEB114000156"), ("GGB114000221", "SEB114000221"), ("GGB118000005", "SEB118000005")):
        assert not out.loc[dup, "is_primary"] and out.loc[dup, "duplicate_of"] == primary, dup
    for uid in ("SEB114000300", "GGB114000999", "SEB114000400", "GGB114000400", "SEB114000500", "GGB114000500"):
        assert out.loc[uid, "is_primary"], uid


def test_opposite_direction_stops_with_the_same_name_and_different_numbers_are_never_merged():
    s = _stops(_stop("SEB1", 3340, "노들섬", 0, 0), _stop("SEB2", 3341, "노들섬", 12, 0), _stop("GGB1", 3340, "노들섬", 3, 0, "경기BIS"))
    out = b.mark_duplicates(s.assign(lon=0.0, lat=0.0)).set_index("stop_uid")
    assert out.loc["SEB1", "is_primary"] and out.loc["SEB2", "is_primary"]          # 맞은편 두 정류장은 둘 다 남는다
    assert not out.loc["GGB1", "is_primary"] and out.loc["GGB1", "duplicate_of"] == "SEB1"   # 번호가 같은 미러만 합친다


def test_primary_follows_admin_priority_regardless_of_row_order():
    s = _stops(_stop("ICB1", 100, "X", 0, 0, "인천BIS"), _stop("GGB1", 100, "X", 1, 0, "경기BIS"), _stop("SEB1", 100, "X", 2, 0, "서울BIS"))
    out = b.mark_duplicates(s.assign(lon=0.0, lat=0.0)).set_index("stop_uid")
    assert out["is_primary"].to_dict() == {"ICB1": False, "GGB1": False, "SEB1": True}
    assert out.loc["ICB1", "duplicate_of"] == "SEB1"


# ── 위치정보 ↔ 이용량 연결 ──────────────────────────────────────────────────────────────────────

def _link(stops, usage):
    s, u = b.link(stops, usage)
    return s.set_index("stop_uid"), u.set_index("usage_row_id")


def test_unique_number_and_matching_name_links_and_keeps_zero_values():
    s, u = _link(_stops(_stop("S1", 111, "당산역")), _usage(_use(0, 111, "당산역", board=0.0, alight=0.0, transfer=0.0)))
    assert s.loc["S1", "usage_status"] == "linked" and u.loc[0, "link_status"] == "linked" and u.loc[0, "linked_stop_uid"] == "S1"
    assert s.loc["S1", "avg_daily_boardings"] == 0.0 and not pd.isna(s.loc["S1", "avg_daily_alightings"])   # 실제 0 은 0 으로 유지


def test_same_number_but_different_name_is_a_conflict_and_gets_no_usage():
    s, u = _link(_stops(_stop("S1", 111, "문방구")), _usage(_use(0, 111, "구기빌라")))
    assert s.loc["S1", "usage_status"] == "name_conflict" and u.loc[0, "link_status"] == "name_conflict"
    assert pd.isna(s.loc["S1", "avg_daily_boardings"])


def test_coordinates_alone_never_link_a_stop_to_usage():
    """이름이 같고 위치가 같아도 모바일 번호가 다르면 연결하지 않는다(이용량 행에는 좌표가 없고, 근접은 근거가 아니다)."""
    s, u = _link(_stops(_stop("S1", 111, "당산역", 0, 0)), _usage(_use(0, 222, "당산역")))
    assert s.loc["S1", "usage_status"] == "no_usage_candidate" and pd.isna(s.loc["S1", "avg_daily_boardings"])
    assert u.loc[0, "link_status"] == "no_loc_candidate"


def test_aliased_usage_rows_are_not_picked_or_summed():
    s, u = _link(_stops(_stop("S1", 111, "당산역")), _usage(_use(0, 111, "당산역", board=3268), _use(1, 111, "당산역13번출구", board=3246)))
    assert s.loc["S1", "usage_status"] == "multi_usage_rows" and pd.isna(s.loc["S1", "avg_daily_boardings"])
    assert set(u["link_status"]) == {"multi_usage_rows"}


def test_number_collision_between_different_stops_is_resolved_by_name():
    stops = _stops(_stop("SEB", 5001, "군자교입구", 0, 0), _stop("GGB-other", 5001, "판교제2테크노밸리", 90_000, 0, "경기BIS"))
    s, u = _link(stops, _usage(_use(0, 5001, "군자교입구")))
    assert s.loc["SEB", "usage_status"] == "linked" and u.loc[0, "linked_stop_uid"] == "SEB"
    assert s.loc["GGB-other", "usage_status"] == "name_conflict" and pd.isna(s.loc["GGB-other", "avg_daily_boardings"])


def test_two_stops_with_the_same_number_and_matching_names_stay_ambiguous():
    s, u = _link(_stops(_stop("S1", 7, "신정역", 0, 0), _stop("S2", 7, "신정역앞", 400, 0)), _usage(_use(0, 7, "신정역")))
    assert u.loc[0, "link_status"] == "ambiguous_stop_key"
    assert set(s["usage_status"]) == {"ambiguous_stop_key"} and s["avg_daily_boardings"].isna().all()


def test_missing_numbers_duplicates_and_outside_seoul_are_not_candidates():
    stops = _stops(_stop("S1", None, "번호없음"), _stop("D1", 111, "당산역", primary=False), _stop("O1", 222, "서울밖", in_seoul=False), _stop("P1", 111, "당산역"))
    usage = _usage(_use(0, 111, "당산역"), _use(1, None, "모바일ID없음"), _use(2, 222, "서울밖"))
    s, u = _link(stops, usage)
    assert s.loc["S1", "usage_status"] == "no_mobile_no"
    assert s.loc["D1", "usage_status"] == "duplicate_of_primary" and pd.isna(s.loc["D1", "avg_daily_boardings"])  # 대표에만 붙인다
    assert s.loc["P1", "usage_status"] == "linked"
    assert s.loc["O1", "usage_status"] == "outside_seoul"
    assert u.loc[1, "link_status"] == "no_mobile_id" and u.loc[2, "link_status"] == "no_loc_candidate"


def test_unlinked_stops_keep_missing_usage_instead_of_being_filled():
    s, _ = _link(_stops(_stop("S1", 1, "가"), _stop("S2", 2, "나")), _usage(_use(0, 1, "가", board=50)))
    assert s.loc["S1", "avg_daily_boardings"] == 50 and pd.isna(s.loc["S2", "avg_daily_boardings"]) and pd.isna(s.loc["S2", "usage_year"])


# ── 정규화 ───────────────────────────────────────────────────────────────────────────────────────

def test_normalize_stops_flags_bad_coordinates_and_zero_numbers_without_dropping_rows():
    raw = pd.DataFrame({"정류장번호": ["A1", "A2", "A3", "A3"], "모바일단축번호": [0, 123, 456, 456], "정류장명": ["가", "나", "다", "다"],
                        "위도": ["37.5", "0", "abc", "37.5"], "경도": ["126.9", "126.9", "126.9", "126.9"], "도시코드": [11] * 4,
                        "도시명": ["서울특별시"] * 4, "관리도시명": ["서울BIS"] * 4, "정보수집일": ["2025-10-31"] * 4})
    out = b.normalize_stops(raw).set_index("stop_uid", drop=False)
    assert len(out) == 4
    assert pd.isna(out.loc["A1", "mobile_no"]) and bool(out.loc["A1", "coord_ok"])               # 0 은 번호 없음
    assert not out.loc["A2", "coord_ok"] and out["lat"].isna().sum() == 1                       # 위도 0·문자 → 좌표 무효(값을 만들어 채우지 않음)
    assert out["dup_stop_uid"].sum() == 2


def test_normalize_usage_keeps_zero_and_missing_distinct():
    raw = pd.DataFrame({"년도": [2025, 2025], "시군구코드(법정동)": [11560, 11560], "시군구명": ["영등포구"] * 2, "정류장ID": [1, 2], "정류장명": ["가", "나"],
                        "모바일ID": [10.0, None], "평균승차이용량": [0, 5], "평균하차이용량": [None, 3], "평균환승이용량": [0, 0]})
    out = b.normalize_usage(raw)
    assert out.loc[out["name"] == "가", "avg_daily_boardings"].iloc[0] == 0
    assert out["avg_daily_alightings"].isna().sum() == 1 and out["usage_mobile_id"].isna().sum() == 1


# ── TAGO 대조 ────────────────────────────────────────────────────────────────────────────────────

def test_tago_matches_by_code_only_and_a_same_place_with_another_code_is_reported_separately():
    stops = pd.DataFrame({"stop_uid": ["GGB1"], "mobile_no": pd.array([11161], dtype="Int64"), "name": ["부천시청역"], "lat": [37.5040], "lon": [126.7667]})
    tago = pd.DataFrame({"nodeid": ["GGB1", "ICB9"], "nodeno": [11161, 99999], "nodenm": ["부천시청역", "부천시청역"], "gpslati": [37.5040, 37.5040],
                         "gpslong": [126.7667, 126.7667], "citycode": [31050, 23]})
    rows, only = b.tago_checks(stops, tago)
    by = {r["metric"]: r for r in rows}
    assert by["TAGO nodeid 가 위치정보 정류장번호와 일치"]["value"] == 1
    assert by["일치 쌍의 좌표 차이 최대(m)"]["value"] == 0
    assert list(only["stop_uid"]) == ["ICB9"]     # 좌표·이름이 같아도 코드가 다르면 '일치'로 세지 않는다


# ── 반경 250m·500m·1km 계산 ─────────────────────────────────────────────────────────────────────

def _grid_stops(n=400, seed=3) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    return pd.DataFrame({"lon": 126.85 + rng.random(n) * 0.08, "lat": 37.48 + rng.random(n) * 0.07})


def test_radius_counts_from_the_projected_table_match_brute_force_and_the_anchor_helper():
    stops, pts = _grid_stops(), _grid_stops(60, seed=9)
    from pyproj import Transformer
    to_m = Transformer.from_crs(config.CRS_WGS84, config.CRS_METRIC, always_xy=True).transform
    sx, sy = to_m(stops["lon"].to_numpy(), stops["lat"].to_numpy())
    px, py = to_m(pts["lon"].to_numpy(), pts["lat"].to_numpy())
    tree = BallTree(np.c_[sx, sy])
    helper = compute_anchor_metrics(pts, {"bus": stops}, AnchorMetricConfig(density_radii_m=(250, 500, 1000)))
    for r in (250, 500, 1000):
        projected = tree.query_radius(np.c_[px, py], r, count_only=True)
        brute = np.array([(haversine_m(lo, la, stops["lon"].to_numpy(), stops["lat"].to_numpy()) <= r).sum() for lo, la in zip(pts["lon"], pts["lat"])])
        assert np.abs(projected - brute).max() <= 1                       # 투영(5179) 거리와 구면 거리의 경계 차이(<1%)로 최대 1곳
        assert np.abs(helper[f"bus_cnt_{r}m"].to_numpy() - brute).max() == 0
    assert (helper["bus_cnt_250m"] <= helper["bus_cnt_500m"]).all() and (helper["bus_cnt_500m"] <= helper["bus_cnt_1000m"]).all()


# ── 실제 산출물(있을 때만) ───────────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def real():
    path = config.PROCESSED_DIR / "bus_stops.parquet"
    if not path.exists():
        pytest.skip("bus_stops.parquet 없음 — collect_bus_transit → build_bus_stops 를 먼저 실행")
    return pd.read_parquet(path), pd.read_parquet(config.PROCESSED_DIR / "bus_usage_match.parquet")


def test_real_output_never_attaches_usage_to_unlinked_or_duplicate_stops(real):
    stops, match = real
    linked = stops["usage_status"] == "linked"
    assert stops.loc[~linked, ["avg_daily_boardings", "avg_daily_alightings", "avg_daily_transfers"]].isna().all().all()
    assert stops.loc[linked, "is_primary"].all() and stops.loc[linked, "avg_daily_boardings"].notna().all()
    assert not stops.loc[~stops["is_primary"], "usage_status"].ne("duplicate_of_primary").any()
    assert stops.loc[stops["is_primary"], "stop_uid"].is_unique
    # 같은 이용량 행이 두 정류장에 붙지 않는다
    assert match.loc[match["link_status"] == "linked", "linked_stop_uid"].is_unique
    assert set(match["gu_code"]) <= {11470, 11560}


def test_real_output_is_inside_the_requested_distance_and_counts_are_consistent(real):
    stops, _ = real
    assert stops["dist_to_pilot_m"].max() <= b.BUFFER_M and stops["coord_ok" if "coord_ok" in stops else "x_5179"].notna().all()
    assert stops["in_pilot"].eq(stops["gu_code"].notna()).all()
