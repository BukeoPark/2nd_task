"""전국 철도 위치(공식 XLSX)·운영기관별 승하차 통합 — 합성 데이터로 규칙을, 실제 산출물(있을 때)로 품질·파일럿 불변을 검증한다."""
from __future__ import annotations

import json
from datetime import date, datetime

import numpy as np
import pandas as pd
import pytest

from pipelines.common import config
from pipelines.transform import build_rail_national as n
from pipelines.transform import build_rail_stations as r

needs_geo = pytest.mark.skipif(not (config.PROCESSED_DIR / "regions.geojson").exists(), reason="regions.geojson 없음")


def _raw(*rows) -> pd.DataFrame:
    """rows: dict(code,name,line_code,line,op,lon,lat,date,addr,transfer_codes,flag)"""
    out = []
    for d in rows:
        out.append({"역번호": d["code"], "역사명": d["name"], "노선번호": d["line_code"], "노선명": d["line"], "영문역사명": "", "한자역사명": "", "환승역구분": d.get("flag", "일반역"),
                    "환승노선번호": d.get("transfer_codes"), "환승노선명": None, "역위도": d["lat"], "역경도": d["lon"], "운영기관명": d.get("op", "서울교통공사"),
                    "역사도로명주소": d.get("addr", "서울특별시 영등포구"), "역사전화번호": "", "데이터기준일자": d.get("date", "2025-01-01")})
    return pd.DataFrame(out)


def _lonlat(north_m: float, east_m: float = 0.0, lon0=126.9, lat0=37.52):
    return lon0 + east_m / (111_320 * np.cos(np.radians(lat0))), lat0 + north_m / 110_574


def _row(code, name, lc, line, north, east=0.0, **kw):
    lon, lat = _lonlat(north, east)
    return dict(code=code, name=name, line_code=lc, line=line, lon=lon, lat=lat, **kw)


# ── 정규화 ──────────────────────────────────────────────────────────────────────────────────

def test_base_date_formats_are_parsed_and_placeholders_flagged():
    assert n.parse_base_date(datetime(2026, 6, 18)) == (date(2026, 6, 18), "ok")
    assert n.parse_base_date("2025-04-08") == (date(2025, 4, 8), "ok")
    assert n.parse_base_date(20240812) == (date(2024, 8, 12), "int_format")
    assert n.parse_base_date("1900-01-00") == (None, "invalid")
    assert n.parse_base_date(datetime(1900, 1, 1)) == (None, "invalid")
    assert n.parse_base_date(None)[1] == "missing" and n.parse_base_date(float("nan"))[1] == "missing"
    assert n.parse_base_date("20250931")[1] == "invalid"


def test_names_lines_and_operators_are_normalised_without_merging_different_stations():
    assert n.nat_name("광운대역") == "광운대" == n.nat_name("광운대")
    assert n.nat_name("총신대입구(이수)") == "총신대입구" and n.nat_name("7호선 부평구청") == "부평구청"
    assert n.nat_name("역삼") == "역삼" and n.nat_name("서울역") == "서울" and n.nat_name("수역") == "수역"      # 2글자 이름의 '역'은 지우지 않는다
    assert n.nat_line("서울 도시철도 9호선") == n.nat_line("수도권  도시철도 9호선") == n.nat_line("9호선2~3단계") == "9호선"
    assert n.nat_line("부산 도시철도 2호선") == "부산2호선" and n.nat_line("부산 경량도시철도 4호선") == "부산4호선" and n.nat_line("인천지하철 1호선") == "인천1호선"
    assert n.nat_line("대구 도시철도 1호선") == "대구1호선" != n.nat_line("1호선")                              # 지역 접두가 달라 서울 1호선과 섞이지 않는다
    assert n.nat_line("도시철도 7호선") == "7호선" and n.nat_line("경의선") == "경의중앙선" and n.nat_line("수도권 경량도시철도 신림선") == "신림선"
    assert n.std_operator("서울특별시 서울시메트로9호선㈜") == n.std_operator("서울시메트로9호선㈜") == "서울시메트로9호선"
    assert n.std_operator("남서울경전철 주식회사") == "남서울경전철" and n.std_operator("부산광역시 부산교통공사") == "부산교통공사"


@needs_geo
def test_official_duplicates_keep_latest_but_same_code_on_different_lines_and_distant_twins_are_kept():
    raw = _raw(
        _row("0736", "이수", "S1107", "7호선", 0, date="2025-12-31"),
        _row("0736", "총신대입구(이수)", "S1107", "7호선", 0, date="2024-12-31"),                          # 같은 역의 이중 등재 — 최신 기준일만
        _row("1019", "광운대역", "I4108", "경의중앙선", 3000, op="한국철도공사"),
        _row("1019", "광운대역", "I4108", "경춘선", 3010, op="한국철도공사"),                                # 같은 역번호·노선번호지만 노선이 다르다 — 둘 다 유지
        _row("9001", "쌍둥이", "S9", "9호선", 6000), _row("9001", "쌍둥이", "S9", "9호선", 9000))        # 같은 키지만 3km 떨어짐 — 자동 병합하지 않고 id 구분
    off, info = n.normalize_official(raw, "x.xlsx")
    assert info["duplicate_rows_dropped"] == 1 and len(off) == 5
    kept = off[off["station_code"] == "0736"].iloc[0]
    assert str(kept["base_date"]) == "2025-12-31" and kept["source_row"] == 2                           # 원천 엑셀 행 번호(머리글 다음)와 기준일 보존
    assert set(off.loc[off["station_code"] == "1019", "line_std"]) == {"경의중앙선", "경춘선"}
    twins = off[off["station_code"] == "9001"]
    assert twins["official_station_id"].is_unique and twins["official_station_id"].str.contains("#").all() and info["same_key_different_place_rows"] == 2
    assert off["official_station_id"].is_unique


@needs_geo
def test_complexes_merge_interchanges_but_not_same_name_far_apart_or_neighbours_with_different_names():
    raw = _raw(
        _row("0236", "영등포구청", "S1102", "2호선", 0), _row("0523", "영등포구청", "S1105", "5호선", 120, 90),         # 환승(약 150m)
        _row("0300", "신촌", "S1102", "2호선", 10_000), _row("1500", "신촌", "I4101", "경의중앙선", 14_000, op="한국철도공사"),  # 이름만 같은 다른 역(4km)
        _row("0400", "당산", "S1102", "2호선", 20_000), _row("0401", "합정", "S1102", "2호선", 20_040))                # 가깝지만 이름이 다름
    off, _ = n.normalize_official(raw, "x.xlsx")
    off = n.add_complexes(off).set_index("name")
    cid = n.add_complexes(n.normalize_official(raw, "x.xlsx")[0])
    assert cid[cid["name"] == "영등포구청"]["national_complex_id"].nunique() == 1
    assert cid[cid["name"] == "신촌"]["national_complex_id"].nunique() == 2
    assert cid[cid["name"].isin(["당산", "합정"])]["national_complex_id"].nunique() == 2
    assert n.same_name_far_apart(cid)["names_with_multiple_complexes"] == 1
    again = n.add_complexes(n.normalize_official(raw.iloc[::-1].reset_index(drop=True), "x.xlsx")[0]).sort_values("official_station_id")["national_complex_id"].tolist()
    assert again == cid.sort_values("official_station_id")["national_complex_id"].tolist()                  # 입력 순서와 무관한 결정적 id


@needs_geo
def test_transfer_checks_classify_codes_and_flag_single_transfer_rows_and_wide_spread():
    raw = _raw(
        _row("1", "가", "A1", "2호선", 0, transfer_codes="B1", flag="환승역"), _row("2", "가", "B1", "5호선", 100, transfer_codes="A1", flag="환승역"),   # 서로의 코드가 있다
        _row("3", "나", "A1", "2호선", 5000, transfer_codes="Z9", flag="환승역"), _row("4", "나", "B1", "5호선", 5100, transfer_codes="Z9", flag="환승역"),   # 코드 불일치
        _row("5", "다", "A1", "2호선", 9000, flag="환승역"),                                                                                                  # 환승 표시인데 짝이 없다
        _row("6", "라", "A1", "2호선", 12_000), _row("7", "라", "B1", "5호선", 12_380))                                                                      # 380m 떨어진 같은 이름(묶이되 점검 대상)
    off = n.add_complexes(n.normalize_official(raw, "x.xlsx")[0])
    tc = n.transfer_checks(off)
    assert tc["transfer_codes"]["consistent"] == 1 and tc["transfer_codes"]["mismatch"] == 1 and tc["transfer_codes"]["no_codes"] == 1
    assert tc["transfer_flag_but_single_row"] == 1 and tc["transfer_flag_but_single_names"] == ["다"]
    assert tc["spread_over_warn_count"] == 1 and tc["spread_over_warn"][0]["complex"] == "라"


def test_region_assignment_uses_address_then_operator_then_line():
    assert n._region_of("서울시 강남구", "서울교통공사", "2호선") == ("서울", "address")
    assert n._region_of("수성구 달구벌대로", "대구교통공사", "대구1호선") == ("대구", "address")
    assert n._region_of("인창동 1", "구리도시공사", "8호선") == ("경기", "operator")
    assert n._region_of("서구 어딘가", "알수없음", "광주1호선") == ("광주", "line")
    assert n._region_of(None, "알수없음", "x") == ("unknown", "none")


# ── 이용량 연결·중복 ─────────────────────────────────────────────────────────────────────────

def _ids(s: pd.Series) -> list:
    return [v if isinstance(v, str) else None for v in s]


def _off(*rows) -> pd.DataFrame:
    """rows: (id, name, line_std, operator, code, region)"""
    return pd.DataFrame([{"official_station_id": i, "name": nm, "name_norm": n.nat_name(nm), "line_std": ln, "operator_std": op, "station_code": c, "region": rg, "national_complex_id": "NC:" + nm}
                         for i, nm, ln, op, c, rg in rows])


def test_busan_links_by_code_and_requires_the_name_to_agree():
    off = _off(("B1", "서면", "부산1호선", "부산교통공사", "0119", "부산"), ("B2", "서면", "부산2호선", "부산교통공사", "0219", "부산"),
               ("B3", "수영", "부산2호선", "부산교통공사", "0220", "부산"), ("B4", "수영", "부산3호선", "부산교통공사", "0320", "부산"))
    keys = pd.DataFrame({"source_code": [119, 219, 220, 9999, 320], "name_raw": ["서면", "서면", "수영", "없는역", "엉뚱한이름"], "line_raw": ["", "", "", "", ""]})
    res = n.link_usage_keys(keys, off, "busan")
    assert _ids(res["official_station_id"]) == ["B1", "B2", "B3", None, None]          # 같은 이름의 다른 호선도 번호로 구분한다
    assert res["cause"].tolist() == ["ok", "ok", "ok", "no_station_code", "code_name_conflict"]


def test_incheon_and_seoul_daily_link_by_line_and_name_with_prefix_and_operator_scope():
    off = _off(("I1", "계양", "인천1호선", "인천교통공사", "1", "인천"), ("I7", "부평구청", "7호선", "인천교통공사", "7", "인천"),
               ("S2", "신도림", "2호선", "서울교통공사", "0234", "서울"), ("K1", "신도림", "경부선", "한국철도공사", "1007", "서울"),
               ("I7b", "까치울", "7호선", "인천교통공사", "8", "경기"))
    keys = pd.DataFrame({"source_code": [None] * 3, "name_raw": ["계양", "7호선 부평구청", "서해구청"], "line_raw": ["1", "7", "2"]})
    inc = n.link_usage_keys(keys, off, "incheon")
    assert _ids(inc["official_station_id"]) == ["I1", "I7", None] and inc.loc[2, "cause"] == "no_station"   # 이름이 다른 역은 비슷해 보여도 붙이지 않는다
    seoul = n.link_usage_keys(pd.DataFrame({"source_code": [None] * 3, "name_raw": ["신도림", "신도림", "까치울"], "line_raw": ["2호선", "경부선", "7호선"]}), off, "seoul_daily")
    assert _ids(seoul["official_station_id"]) == ["S2", "S2", "I7b"]                    # 서울교통공사 범위에서 먼저, 없을 때만 다른 운영기관 역(경부선 신도림은 같은 이름이라 서울교통공사 행으로)
    assert "+other_operator" in seoul.loc[2, "link_basis"]


def test_multiple_usage_keys_for_one_station_are_chained_only_when_months_do_not_overlap():
    g = pd.DataFrame({"official_station_id": ["I1"] * 4 + ["I2"] * 2, "name_raw": ["센트럴파크"] * 2 + ["센트럴파크(재외동포청)"] * 2 + ["가", "나"], "line_raw": ["1"] * 6,
                      "ym": ["202501", "202502", "202503", "202504", "202501", "202501"], "link_basis": ["line_name"] * 6, "cause": ["ok"] * 6})
    out, aliases = n.resolve_multi_keys(g)
    assert out.loc[:3, "official_station_id"].tolist() == ["I1"] * 4 and aliases == 1       # 이름 변경(월이 이어짐)은 하나로
    assert out.loc[4:, "official_station_id"].isna().all() and (out.loc[4:, "cause"] == "many_usage_keys_same_month").all()      # 같은 월에 둘이면 합산하지 않고 해제


def test_month_frame_keeps_boardings_and_alightings_separate_and_counts_days_with_both_directions():
    d = pd.DataFrame({"일": ["2025-01-01", "2025-01-02", "2025-01-01", "2025-01-01"], "역": ["가", "가", "가", "나"], "구분": ["승차", "승차", "하차", "승차"]})
    d["_on"] = np.where(d["구분"] == "승차", [10.0, 20.0, 0, 5.0], 0.0)
    d["_off"] = np.where(d["구분"] == "하차", 4.0, 0.0)
    d["_on_day"] = np.where(d["구분"] == "승차", d["일"], None)
    d["_off_day"] = np.where(d["구분"] == "하차", d["일"], None)
    out = n._month_frame(d, "일", ["역"], "_on", "_off", "src").set_index("역")
    assert out.loc["가", "boardings"] == 30 and out.loc["가", "alightings"] == 4 and out.loc["가", "days_observed"] == 1      # 두 방향이 모두 있는 날만 관측일
    assert out.loc["나", "days_observed"] == 0 and out.loc["가", "period_first"] == "2025-01-01" and out.loc["가", "period_last"] == "2025-01-02"


def _u(**kw) -> dict:
    base = {"source": "incheon", "official_station_id": "I1", "ym": "202501", "boardings": 100.0, "alightings": 90.0, "days_observed": 31, "operator_std": "인천교통공사", "complete_month": True,
            "period_first": "2025-01-01", "period_last": "2025-01-31"}
    base.update(kw)
    return base


def test_reconcile_picks_the_operator_source_and_never_double_counts_station_months():
    u = pd.DataFrame([
        _u(),                                                                                         # 인천 자체 자료(대표)
        _u(source="seoul_card", boardings=1.0, alightings=1.0, days_observed=31),                     # 같은 역·월을 서울 카드도 담음(7호선 까치울형) — 중복
        _u(source="seoul_daily", ym="202412", official_station_id="S1", operator_std="서울교통공사", boardings=500.0),            # 서울 일별 2024
        _u(source="seoul_card", ym="202501", official_station_id="S1", operator_std="서울교통공사", boardings=520.0),             # 기간이 다른 서울 자료(겹치지 않음)
        _u(source="seoul_card", ym="202501", official_station_id=None, operator_std=None, boardings=7.0),                      # 미연결
        _u(source="seoul_daily", ym="202501", official_station_id="S2", operator_std="서울교통공사", boardings=300.0),
        _u(source="seoul_card", ym="202501", official_station_id="S2", operator_std="서울교통공사", boardings=299.0),               # 같은 서울 역·월 — 서울 일별이 우선
    ])
    out = n.reconcile(u)
    prim = out[out["is_primary"]]
    assert not prim.duplicated(["official_station_id", "ym"]).any()                                    # 같은 역·월의 대표는 하나
    inc_card = out[(out["source"] == "seoul_card") & (out["official_station_id"] == "I1")].iloc[0]
    assert not inc_card["is_primary"] and inc_card["primary_reason"] == "not_operator_source" and inc_card["overlap_group"]
    s2 = out[out["official_station_id"] == "S2"].set_index("source")
    assert s2.loc["seoul_daily", "is_primary"] and not s2.loc["seoul_card", "is_primary"] and s2.loc["seoul_card", "primary_reason"] == "duplicate_lower_priority_source"
    assert out[out["official_station_id"].isna()]["primary_reason"].eq("unlinked").all() and not out[out["official_station_id"].isna()]["is_primary"].any()
    s1 = out[out["official_station_id"] == "S1"]
    assert s1["is_primary"].all() and not s1["overlap_group"].any()                                    # 기간이 다르면 중복이 아니다 — 둘 다 유지(합치지도 않는다)
    ov = n.overlap_table(out)
    assert len(ov) == 2 and set(ov["primary_source"]) == {"incheon", "seoul_daily"} and ov["ratio_boardings"].notna().all()


def test_complex_summary_uses_2025_only_and_marks_partial_and_incomplete_coverage():
    off = _off(("L2", "당산", "2호선", "서울교통공사", "1", "서울"), ("L9", "당산", "9호선", "서울시메트로9호선", "2", "서울"), ("X", "문래", "2호선", "서울교통공사", "3", "서울"))
    off["national_complex_id"] = ["NC:당산", "NC:당산", "NC:문래"]
    months = [f"2025{m:02d}" for m in range(1, 13)]
    rows = [dict(_u(source="seoul_card", official_station_id="L2", ym=m, boardings=3100.0, alightings=3100.0, operator_std="서울교통공사"), is_primary=True) for m in months]
    rows += [dict(_u(source="seoul_daily", official_station_id="L2", ym="202412", boardings=999999.0, operator_std="서울교통공사"), is_primary=True)]       # 2024 는 요약에 쓰지 않는다
    rows += [dict(_u(source="seoul_card", official_station_id="X", ym=m, boardings=310.0, alightings=310.0, operator_std="서울교통공사"), is_primary=True) for m in months[:6]]
    c = n.complex_2025(pd.DataFrame(rows), off).set_index("name")
    d = c.loc["당산"]
    assert d["usage_state"] == "partial" and d["lines_with_usage"] == 1 and d["lines_total"] == 2 and d["avg_daily_boardings_2025"] == pytest.approx(100.0, abs=0.1)
    assert d["complete_2025"] is True or bool(d["complete_2025"])
    x = c.loc["문래"]
    assert x["months_observed_min"] == 6 and not bool(x["complete_2025"]) and x["avg_daily_boardings_2025"] == pytest.approx(310 / 31, abs=0.1)     # 관측한 달의 일수로 나눈다


# ── 실제 산출물(있을 때) ─────────────────────────────────────────────────────────────────────

def _p(name):
    f = config.PROCESSED_DIR / name
    if not f.exists():
        pytest.skip(f"{name} 없음 — build_rail_national 를 먼저 실행")
    return pd.read_parquet(f)


def _meta():
    f = config.PROCESSED_DIR / "rail_national_meta.json"
    if not f.exists():
        pytest.skip("rail_national_meta.json 없음")
    return json.loads(f.read_text(encoding="utf-8"))


def test_real_official_stations_are_unique_in_range_and_keep_provenance():
    off = _p("rail_official_stations.parquet")
    meta = _meta()
    assert meta["official_file"]["rows"] == 1099 and len(off) == meta["official_rows_after_dedup"] == 1099 - meta["official_dedup"]["duplicate_rows_dropped"]
    assert off["official_station_id"].is_unique and off["coord_ok"].all()
    assert off["lon"].between(124, 132).all() and off["lat"].between(33, 39).all()
    assert off["source_file"].eq(meta["official_file"]["file"]).all() and off["source_row"].between(2, 1100).all()
    assert set(off["base_date_flag"]) <= {"ok", "int_format", "invalid", "missing"} and off.loc[off["base_date_flag"].isin(["invalid", "missing"]), "base_date"].isna().all()
    assert (off["region"] == "unknown").sum() == 0 and set(off["region"]) >= {"서울", "경기", "부산", "인천", "대구", "대전", "광주"}
    assert not any(c.startswith("exit") or "entrance" in c for c in off.columns)                     # 공식 표에는 출구 좌표가 없다


def test_real_same_name_stations_far_apart_are_not_merged_and_interchanges_are_merged():
    off = _p("rail_official_stations.parquet")
    multi = off.groupby("name_norm")["national_complex_id"].nunique()
    assert (multi > 1).sum() >= 10                                                                    # 이름이 같은 다른 역이 실제로 갈라져 있다
    for cid, g in off.groupby("national_complex_id"):                                                 # 한 역사 안 같은 이름만, 노선 중복 행 없음
        assert g["name_norm"].nunique() == 1
        assert not g.duplicated(["line_std", "station_code", "line_code"]).any()
    deungpo = off[off["name_norm"] == "영등포구청"]
    assert deungpo["national_complex_id"].nunique() == 1 and set(deungpo["line_std"]) == {"2호선", "5호선"}


def test_real_official_vs_seoul_master_and_kakao_coordinate_differences_are_small_and_reported():
    cw = _p("rail_station_crosswalk.parquet")
    st = _meta()["crosswalk"]
    assert (cw["coord_preferred"] == "official_xlsx").all()
    assert st["matched_master"] >= 700 and st["dist_master_m"]["median"] < 50 and st["dist_master_m"]["max"] <= n.CROSSWALK_MAX_M
    assert st["dist_kakao_m"]["median"] < 50 and st["dist_kakao_m"]["max"] <= n.CROSSWALK_MAX_M
    assert cw["official_station_id"].is_unique
    matched = cw[cw["status_master"] == "matched"]
    assert matched["seoul_master_id"].notna().all() and (matched["dist_master_m"] <= n.CROSSWALK_MAX_M).all()


def test_real_usage_has_one_primary_per_station_month_and_no_negative_or_missing_primary_values():
    u = _p("rail_usage_operator_monthly.parquet")
    prim = u[u["is_primary"]]
    assert not prim.duplicated(["official_station_id", "ym"]).any()
    assert prim["official_station_id"].notna().all()
    for col in ("boardings", "alightings"):
        assert prim[col].notna().all() and (prim[col] >= 0).all()
    assert not any(("total" in c) or ("transfer" in c) for c in u.columns)                           # 승차+하차(+환승) 합계 칸이 없다
    assert (prim["days_observed"] > 0).all() and (prim["days_observed"] <= prim["days_in_month"]).all()
    unl = u[u["official_station_id"].isna()]
    assert unl["link_cause"].ne("ok").all() and unl["link_cause"].notna().all() and not unl["is_primary"].any()     # 미연결은 원인이 있고 대표가 될 수 없다
    assert u["source"].isin(["seoul_card", "seoul_daily", "busan", "incheon"]).all()


def test_real_source_periods_differ_and_are_never_presented_as_the_same_period():
    u = _p("rail_usage_operator_monthly.parquet")
    per = u.groupby("source").agg(first=("period_first", "min"), last=("period_last", "max"))
    assert per.loc["seoul_daily", "first"].startswith("2024-01") and per.loc["seoul_daily", "last"].startswith("2024-12")
    assert per.loc["busan", "first"].startswith("2025-01") and per.loc["busan", "last"].startswith("2026-08")
    assert per.loc["incheon", "first"].startswith("2024-07") and per.loc["incheon", "last"].startswith("2026-06")
    assert per.loc["seoul_card", "first"].startswith("2025-01")
    assert len({tuple(x) for x in per[["first", "last"]].to_numpy()}) == 4
    c = _p("rail_usage_complex_2025.parquet")
    assert (c.loc[c["complete_2025"], "months_observed_min"] == 12).all()
    assert (c.loc[c["usage_state"] == "none_linked", "avg_daily_boardings_2025"].isna()).all()       # 연결 안 된 역사는 0 이 아니라 비어 있다
    prim25 = u[u["is_primary"] & u["ym"].str.startswith("2025")]
    assert prim25["ym"].str[:4].eq("2025").all() and prim25["ym"].nunique() <= 12


def test_real_seoul_incheon_overlap_is_resolved_to_the_operator_source_without_double_counting():
    u = _p("rail_usage_operator_monthly.parquet")
    ov = _p("rail_usage_overlap.parquet")
    assert len(ov) > 0 and set(ov["primary_source"]) <= {"incheon", "busan"} | {"seoul_daily"}
    dup_keys = set(zip(ov["official_station_id"], ov["ym"]))
    prim = u[u["is_primary"]]
    assert sum(1 for k in zip(prim["official_station_id"], prim["ym"]) if k in dup_keys) == len(dup_keys)      # 겹친 역·월마다 대표는 정확히 하나
    inc_ids = set(u.loc[(u["source"] == "incheon") & u["official_station_id"].notna(), "official_station_id"])
    lower = u[u["overlap_group"] & ~u["is_primary"] & u["official_station_id"].notna()]
    assert lower["official_station_id"].isin(inc_ids | set(u.loc[u["source"] == "seoul_daily", "official_station_id"].dropna())).all()
    assert lower["primary_reason"].isin(["not_operator_source", "duplicate_lower_priority_source"]).all()


def test_real_busan_and_incheon_are_linked_with_reported_failure_causes():
    meta = _meta()["usage_sources"]
    assert meta["busan"]["keys_linked"] == meta["busan"]["keys"] == 112
    assert meta["incheon"]["keys_linked"] >= meta["incheon"]["keys"] - 2
    assert all(meta[s]["negative_hourly"] == 0 for s in ("seoul_daily", "busan")) and meta["incheon"]["negative"] == 0 and meta["incheon"]["missing"] == 0
    assert meta["seoul_daily"]["dup_keys"] == 0 and meta["busan"]["dup_keys"] == 0 and meta["busan"]["total_col_mismatch"] == 0 and meta["incheon"]["total_col_mismatch"] == 0
    for src, info in meta.items():
        assert sum(info["unlinked_causes"].values()) == info["keys"] - info["keys_linked"], src          # 미연결 키는 모두 원인이 있다
    reasons = _meta()["official_unlinked_reasons"]
    assert reasons["대구"] == {"no_source_for_operator": 92}                                             # 받지 않은 자료는 '자료 없음'으로 구분


def test_real_pilot_results_are_unchanged_and_match_the_new_independent_summary():
    old_c, old_s, old_e = _p("rail_complexes.parquet"), _p("rail_stations.parquet"), _p("rail_entrances.parquet")
    assert (len(old_c), len(old_s), len(old_e), int(old_c["in_pilot"].sum())) == (46, 57, 225, 24)       # 기존 파일럿 골든 수치
    cw, c25 = _p("rail_station_crosswalk.parquet"), _p("rail_usage_complex_2025.parquet")
    m = cw.dropna(subset=["pilot_complex_id"]).groupby("pilot_complex_id")["national_complex_id"].agg(lambda s: sorted(set(s)))
    assert old_c["complex_id"].isin(m.index).all() and (m.map(len) == 1).all()
    for row in old_c.itertuples():
        new = c25[c25["national_complex_id"] == m[row.complex_id][0]].iloc[0]
        assert new["avg_daily_boardings_2025"] == pytest.approx(row.avg_daily_boardings_2025, abs=0.11), row.name
        assert new["avg_daily_alightings_2025"] == pytest.approx(row.avg_daily_alightings_2025, abs=0.11), row.name


def test_real_existing_outputs_are_not_overwritten_and_entrances_stay_auxiliary():
    names = {"rail_stations", "rail_complexes", "rail_entrances", "rail_usage_monthly", "rail_hs_usage"}
    new = {"rail_official_stations", "rail_station_crosswalk", "rail_entrance_links", "rail_usage_operator_monthly", "rail_usage_overlap", "rail_usage_complex_2025"}
    assert not (names & new)
    links, ent = _p("rail_entrance_links.parquet"), _p("rail_entrances.parquet")
    assert len(links) == len(ent) and links["exit_id"].is_unique and (links["source"] == "kakao_local").all() and not links["is_official_coordinate"].any()
    assert links["official_station_id"].notna().mean() > 0.95 and links["dist_to_official_m"].dropna().max() < 900


def test_new_metadata_files_do_not_contain_api_keys():
    import os
    keys = [v for v in (os.environ.get(k, "").strip() for k in ("SEOUL_OPENAPI_KEY", "KAKAO_REST_API_KEY", "DATA_GO_KR_KEY")) if len(v) >= 16]
    if not keys:
        pytest.skip("키 환경변수 없음")
    for f in (config.PROCESSED_DIR / "rail_national_meta.json", config.TABLES_DIR / "rail_national_report.csv", config.TABLES_DIR / "rail_source_survey.csv"):
        if f.exists():
            text = f.read_text(encoding="utf-8", errors="ignore")
            assert not any(k in text for k in keys), f
