"""집객시설 정규화 — 종류 분류·같은 시설 묶기(지점·캠퍼스 보존)·좌표 누락·좌표 순서·중복 의심, 실제 산출물의 범위·품질을 검증한다."""
from __future__ import annotations

import json

import numpy as np
import pandas as pd
import pytest

from pipelines.common import config
from pipelines.transform import build_facilities as b


def _r(source, sid, ftype, name, x, y, level=None, status=None, address=None, **kw) -> dict:
    """x,y = 5179 미터(합성). coord_ok 는 값이 있을 때."""
    ok = x is not None
    row = {"source": source, "source_id": sid, "facility_type": ftype, "subtype": ftype, "facility_level": level, "name": name, "name_norm": b.norm_name(name), "address": address,
           "lon": 126.9 if ok else np.nan, "lat": 37.5 if ok else np.nan, "status_raw": status, "status_group": b.status_group(status), "source_date": "2026-10-17", "source_category": None,
           "source_priority": b.SOURCE_PRIORITY[source], "coord_ok": ok, "x_5179": float(x) if ok else np.nan, "y_5179": float(y) if ok else np.nan, "attach_basis": None}
    row.update(kw)
    return row


def _frame(*rows) -> pd.DataFrame:
    df = pd.DataFrame(rows)
    df["facility_level"] = df["facility_level"].astype(object)
    return df


# ── 분류 ────────────────────────────────────────────────────────────────────────────────────

def test_kakao_categories_map_to_our_types_and_everything_else_is_dropped():
    cases = {
        ("가정,생활 > 백화점 > 롯데백화점", "롯데백화점 영등포점"): "department_store", ("가정,생활 > 복합쇼핑몰", "타임스퀘어"): "shopping_mall",
        ("가정,생활 > 대형마트 > 이마트", "이마트 영등포점"): "hypermarket", ("문화,예술 > 영화,영상 > 영화관 > CGV", "CGV 여의도"): "cinema",
        ("문화,예술 > 문화시설 > 공연장,연극극장", "KBS홀"): "cultural_facility", ("교육,학문 > 학교 > 대학교", "서강대학교"): "university",
        ("의료,건강 > 병원 > 종합병원", "성애병원"): "general_hospital", ("의료,건강 > 병원 > 대학병원", "고려대학교 구로병원"): "general_hospital",
        ("가정,생활 > 상설할인매장", "팩토리아울렛"): "outlet",
    }
    for (cat, name), expected in cases.items():
        assert b.classify_kakao(cat, name)[0] == expected, (cat, name)
    assert b.classify_kakao("가정,생활 > 상설할인매장 > 의류할인매장", "굿윌스토어 신길점") is None        # 아울렛이 아닌 할인매장
    assert b.classify_kakao("가정,생활 > 슈퍼마켓 > 대형슈퍼", "신세계아울렛마트 대방점") is None              # SSM 은 대형마트가 아니다
    for cat in ("교통,수송 > 교통시설 > 주차장", "교육,학문 > 학교 > 중학교", "가정,생활 > 패션 > 의류판매", "의료,건강 > 병원 > 안과"):
        assert b.classify_kakao(cat, "x") is None


def test_university_campus_and_college_units_are_distinguished():
    assert b.university_level("서울대학교") == "campus" and b.university_level("중앙대학교 서울캠퍼스") == "campus" and b.university_level("서울사회복지대학원대학교") == "campus"
    assert b.university_level("이화여자대학교 의과대학") == "college_unit" and b.university_level("SPC식품과학대학") == "college_unit"
    assert b.university_level("KBS스포츠예술과학원 스포츠예술학부") == "college_unit"


def test_status_comes_only_from_official_license_wording():
    assert b.status_group("영업/정상") == "open" and b.status_group("폐업") == "closed" and b.status_group("취소/말소/만료/정지/중지") == "cancelled"
    assert b.status_group(None) == "unknown" and b.status_group("") == "unknown"                       # 다른 원천은 상태를 말하지 않는다


def test_names_agree_needs_equality_or_a_three_character_containment():
    n = b.norm_name
    assert b.names_agree(n("성애병원"), n("성애의료재단 성애병원")) and b.names_agree(n("CM병원"), n("CM병원"))
    assert not b.names_agree(n("롯데시네마 신도림"), n("롯데시네마 영등포")) and not b.names_agree(n("성모"), n("성모병원"))    # 2글자 포함은 같은 시설이 아니다
    assert not b.names_agree("", n("병원")) and b.norm_name("서울 (본관) 병원") == "서울병원"


# ── 원천별 정규화 ───────────────────────────────────────────────────────────────────────────

def test_cultural_space_swapped_coordinates_are_detected_corrected_and_counted():
    env = {"collected_at": "2026-10-17T00:00:00", "rows": [{"NUM": "1", "FAC_NAME": "정상 순서", "SUBJCODE": "도서관", "ADDR": "a", "GNGU": "구로구", "X_COORD": "126.9", "Y_COORD": "37.5"},
                                                           {"NUM": "2", "FAC_NAME": "뒤바뀜", "SUBJCODE": "공연장", "ADDR": "b", "GNGU": "영등포구", "X_COORD": "37.51", "Y_COORD": "126.92"},
                                                           {"NUM": "3", "FAC_NAME": "이상", "SUBJCODE": "기타", "ADDR": "c", "GNGU": "중구", "X_COORD": "", "Y_COORD": "0"}]}
    rows, info = b.rows_cultural(env)
    assert info == {"swapped_as_expected": 1, "normal_order": 1, "unparseable": 1}
    by = {r["name"]: r for r in rows}
    assert (by["뒤바뀜"]["lon"], by["뒤바뀜"]["lat"]) == (126.92, 37.51) and (by["정상 순서"]["lon"], by["정상 순서"]["lat"]) == (126.9, 37.5)
    assert np.isnan(by["이상"]["lon"]) and np.isnan(by["이상"]["lat"])                                   # 좌표를 만들지 않는다


def test_college_list_has_no_coordinates_and_none_are_invented():
    rows = b.rows_college({"collected_at": "2026-10-17T00:00:00", "rows": [{"MAIN_KEY": "k", "NAME_KOR": "서울대학교", "CATE1_NAME": "일반대학", "ADD_KOR": "관악구", "H_KOR_GU": "관악구", "STATE": "기존", "YEAR": "2013"}]})
    assert np.isnan(rows[0]["lon"]) and np.isnan(rows[0]["lat"]) and rows[0]["facility_level"] == "campus" and rows[0]["survey_year"] == "2013"


# ── 같은 시설 묶기 ──────────────────────────────────────────────────────────────────────────

def test_same_facility_from_two_sources_is_merged_but_branches_and_campuses_are_not():
    rows = _frame(
        _r("localdata", "L1", "general_hospital", "성애의료재단 성애병원", 0, 0, status="영업/정상"), _r("kakao", "K1", "general_hospital", "성애병원", 40, 10),             # 같은 시설(40m)
        _r("kakao", "K2", "cinema", "CGV 영등포", 5000, 0), _r("kakao", "K3", "cinema", "CGV 영등포", 5600, 0),                                                   # 같은 이름이지만 600m — 다른 지점
        _r("kakao", "K4", "university", "이화여자대학교", 9000, 0, level="campus"), _r("kakao", "K5", "university", "이화여자대학교 의과대학", 9040, 0, level="college_unit"),   # 캠퍼스와 단과대학
        _r("kakao", "K6", "department_store", "타임스퀘어", 12000, 0), _r("kakao", "K7", "shopping_mall", "타임스퀘어", 12000, 0))                                      # 종류가 다르면 다른 시설
    c = b.cluster(rows)
    f = c.set_index("source_id")["facility_id"]
    assert f["L1"] == f["K1"] and f["K2"] != f["K3"] and f["K4"] != f["K5"] and f["K6"] != f["K7"]
    assert c["facility_id"].nunique() == 7
    again = b.cluster(rows.iloc[::-1].reset_index(drop=True)).set_index("source_id")["facility_id"]
    assert all(again[k] == f[k] for k in f.index)                                                       # 입력 순서와 무관한 결정적 id


def test_rows_without_coordinates_attach_only_by_exact_name_to_a_single_cluster_and_never_get_coordinates():
    rows = _frame(_r("localdata", "L1", "general_hospital", "가톨릭대학교 여의도성모병원", 0, 0, status="영업/정상"),
                  _r("localdata", "L2", "general_hospital", "가톨릭대학교 여의도성모병원", None, None, status="취소/말소/만료/정지/중지"),     # 같은 이름·좌표 없음 → 붙는다
                  _r("localdata", "L3", "general_hospital", "다른병원", None, None, status="영업/정상"))                                     # 짝이 없다 → 좌표 없음으로 남는다
    c = b.cluster(rows).set_index("source_id")
    assert c.at["L2", "facility_id"] == c.at["L1", "facility_id"] and c.at["L2", "attach_basis"] == "name_exact_no_coord"
    fac = b.consolidate(c.reset_index()).set_index("name")
    assert fac.at["다른병원", "coord_ok"] is False or not bool(fac.at["다른병원", "coord_ok"])
    assert np.isnan(fac.at["다른병원", "lon"]) and np.isnan(fac.at["다른병원", "lat"])
    two = b.cluster(_frame(_r("kakao", "A", "general_hospital", "같은이름병원", 0, 0), _r("kakao", "B", "general_hospital", "같은이름병원", 5000, 0),
                           _r("localdata", "C", "general_hospital", "같은이름병원", None, None))).set_index("source_id")["facility_id"]
    assert two["C"] not in (two["A"], two["B"]) or two["A"] == two["B"]                                    # 후보가 둘이면 붙이지 않는다


def test_consolidation_prefers_official_coordinates_and_only_official_licenses_set_status():
    rows = _frame(_r("kakao", "K", "general_hospital", "성애병원", 30, 0), _r("localdata", "L", "general_hospital", "성애의료재단 성애병원", 0, 0, status="폐업"),
                  _r("sbiz", "S", "general_hospital", "성애병원", 10, 0), _r("kakao", "K9", "cinema", "CGV", 5000, 0))
    fac = b.consolidate(b.cluster(rows)).set_index("facility_type")
    h = fac.loc["general_hospital"]
    assert h["coord_source"] == "localdata" and bool(h["coord_official"]) and h["status"] == "closed" and h["coord_spread_m"] == pytest.approx(30.0)
    assert json.loads(h["sources"]) == ["localdata", "sbiz", "kakao"]                                        # 출처를 모두 보존
    cinema = fac.loc["cinema"]
    assert cinema["status"] == "unknown" and cinema["coord_source"] == "kakao" and not bool(cinema["official_listed"])   # 카카오만 있으면 공식 목록이 아니다


def test_duplicate_suspects_flag_different_names_in_the_same_spot_but_do_not_merge_them():
    rows = _frame(_r("localdata", "L", "general_hospital", "한림대학교 한강성심병원", 0, 0), _r("sbiz", "S", "general_hospital", "일송학원한강성심병원", 5, 0),
                  _r("kakao", "K", "general_hospital", "다른병원", 2000, 0))
    fac = b.consolidate(b.cluster(rows))
    fac["x_5179"] = fac["name"].map({"한림대학교 한강성심병원": 0.0, "일송학원한강성심병원": 5.0, "다른병원": 2000.0})
    fac["y_5179"] = 0.0
    fac = b.flag_dup_suspects(fac)
    assert len(fac) == 3 and fac.set_index("name")["dup_suspect"].to_dict() == {"한림대학교 한강성심병원": True, "일송학원한강성심병원": True, "다른병원": False}


def test_pair_suspects_find_same_name_coordinates_that_disagree_between_sources():
    rows = b.cluster(_frame(_r("kakao", "K", "general_hospital", "성모병원", 0, 0), _r("sbiz", "S", "general_hospital", "성모병원", 800, 0), _r("kakao", "K2", "general_hospital", "성모병원", 0, 0)))
    sus = b.pair_suspects(rows)["coord_mismatch_suspects"]
    assert len(sus) >= 1 and all(150 < s["dist_m"] <= 1500 and s["src_a"] != s["src_b"] for s in sus)


# ── 실제 산출물(있을 때) ────────────────────────────────────────────────────────────────────

def _p(name):
    f = config.PROCESSED_DIR / name
    if not f.exists():
        pytest.skip(f"{name} 없음 — collect_facilities → build_facilities 를 먼저 실행")
    return pd.read_parquet(f)


def _meta():
    f = config.PROCESSED_DIR / "facilities_meta.json"
    if not f.exists():
        pytest.skip("facilities_meta.json 없음")
    return json.loads(f.read_text(encoding="utf-8"))


def test_real_every_type_is_present_and_scoped_to_the_collected_extent():
    fac, meta = _p("facilities.parquet"), _meta()
    assert set(fac["facility_type"]) == set(b.TYPES) | {b.UNCLASSIFIED_RETAIL} and meta["buffer_m"] == b.BUFFER_M       # 종류 불명 대규모점포는 TYPES 밖에 따로
    assert all(meta["counts"][t] > 0 for t in b.TYPES)
    scoped = fac[fac["coord_ok"]]
    assert scoped["dist_to_pilot_m"].max() <= b.BUFFER_M and scoped["lon"].between(124, 132).all() and scoped["lat"].between(33, 39).all()
    assert fac["facility_id"].is_unique and (fac.loc[~fac["coord_ok"], ["lon", "lat"]].isna().all().all())               # 좌표가 없으면 NaN(만들지 않음)
    assert not any(c.startswith("visitor") or "attendance" in c or "score" in c for c in fac.columns)                      # 방문객·점수 칸이 없다


def test_real_no_duplicate_facilities_remain_and_branches_stay_separate():
    fac = _p("facilities.parquet")
    c = fac[fac["coord_ok"]].reset_index(drop=True)
    for (ft, lv), g in c.groupby(["facility_type", c["facility_level"].map(b._lv)]):
        g = g.reset_index(drop=True)
        for i in range(len(g)):
            for j in range(i + 1, len(g)):
                d = float(np.hypot(g.at[i, "x_5179"] - g.at[j, "x_5179"], g.at[i, "y_5179"] - g.at[j, "y_5179"]))
                assert not (d <= b.DUP_MAX_M and b.names_agree(g.at[i, "name_norm"], g.at[j, "name_norm"])), (ft, g.at[i, "name"], g.at[j, "name"])
    uni = fac[fac["facility_type"] == "university"]
    assert set(uni["facility_level"]) <= {"campus", "college_unit"}


def test_real_cultural_coordinates_were_corrected_and_hospital_coordinates_prefer_official_sources():
    meta, fac, rows = _meta(), _p("facilities.parquet"), _p("facility_source_rows.parquet")
    cul = rows[rows["source"] == "seoul_cultural"]
    assert cul["lat"].dropna().between(37.0, 38.0).all() and cul["lon"].dropna().between(126.0, 128.0).all()          # 위도·경도 순서가 맞다
    h = fac[(fac["facility_type"] == "general_hospital") & fac["coord_ok"]]
    official = h[h["official_listed"]]
    assert (official["coord_source"].isin(b.OFFICIAL)).all()                                                       # 공식 목록에 있는 시설은 공식 좌표를 쓴다
    assert meta["notes"]["tier"] and "상급종합" in meta["notes"]["tier"] and "추정하지 않는다" in meta["notes"]["attendance"]


def test_real_closed_or_cancelled_facilities_are_kept_but_not_usable_and_only_licenses_set_status():
    fac, rows = _p("facilities.parquet"), _p("facility_source_rows.parquet")
    assert not fac.loc[fac["status"].isin(["closed", "cancelled"]), "usable"].any()
    non_loc = set(fac.loc[fac["status"] != "unknown", "facility_id"])
    assert all(set(json.loads(s)) & set(b.LICENSE_STATUS_SOURCES) for s in fac.loc[fac["status"] != "unknown", "sources"]) and len(non_loc) >= 1
    assert (rows.loc[~rows["source"].isin(b.LICENSE_STATUS_SOURCES), "status_group"] == "unknown").all()


def test_real_provenance_is_kept_for_every_source_row_and_every_row_belongs_to_a_facility():
    fac, rows = _p("facilities.parquet"), _p("facility_source_rows.parquet")
    assert rows["facility_id"].isin(fac["facility_id"]).all() and fac["facility_id"].isin(rows["facility_id"]).all()
    assert rows[["source", "source_id", "source_date", "facility_type"]].notna().all().all()
    assert set(rows["source"]) <= set(b.SOURCE_PRIORITY) and rows["source_date"].str.match(r"\d{4}-\d{2}(-\d{2})?").all()
    assert fac["n_source_rows"].sum() == len(rows)


def test_real_one_kilometre_radius_is_inside_the_collected_extent_for_every_pilot_store():
    """파일럿 안 모든 매장의 1km 반경이 수집 범위(구역+1.1km)를 넘지 않는다 → 시설 수·최근접 거리를 계산할 수 있다."""
    from pipelines.transform import build_bus_stops as bus
    stores = pd.read_parquet(config.PROCESSED_DIR / "stores.parquet").iloc[::37]
    s = bus.add_geography(stores.assign(coord_ok=True)[["lon", "lat", "coord_ok"]].reset_index(drop=True))
    assert s["dist_to_pilot_m"].max() + 1000 <= b.BUFFER_M


def test_real_seoul_count_comparison_and_source_coverage_are_reported_not_merged():
    meta = _meta()
    cmp = meta["compare_seoul_counts"]
    assert set(cmp) == {"general_hospital", "university", "department_store", "hypermarket"} and all(v["dongs"] == 36 for v in cmp.values())
    assert cmp["general_hospital"]["corr"] is not None and cmp["general_hospital"]["corr"] > 0.8                                  # 병원은 서로 잘 맞는다
    assert any(c["query"] in ("백화점", "아울렛") for c in meta["kakao_capped_rects"]) or meta["kakao_capped_rects"] == []        # 한도에 닿은 구역이 기록돼 있다
    assert meta["sources"]["seoul_college"]["coord"] == 0 and meta["sources"]["kakao"]["official"] is False
    assert meta["sources"]["localdata"]["official"] and meta["sources"]["sbiz"]["official"] and meta["sources"]["seoul_cultural"]["official"]


def test_facility_outputs_and_reports_do_not_contain_api_keys():
    import os
    keys = [v for v in (os.environ.get(k, "").strip() for k in ("SEOUL_OPENAPI_KEY", "KAKAO_REST_API_KEY", "DATA_GO_KR_KEY")) if len(v) >= 16]
    if not keys:
        pytest.skip("키 환경변수 없음")
    for f in (config.PROCESSED_DIR / "facilities_meta.json", config.TABLES_DIR / "facility_report.csv", config.TABLES_DIR / "facility_source_survey.csv", *(config.RAW_DIR / "facilities").glob("*.json")):
        if f.exists():
            text = f.read_text(encoding="utf-8", errors="ignore")
            assert not any(k in text for k in keys), f


# ── 출처·이용 조건·수집 범위·권한 (Phase 3-B) ───────────────────────────────────────────────────

def _fac(*rows) -> pd.DataFrame:
    """rows: dict — consolidate 결과 모양. 기본값을 채운다."""
    base = {"facility_type": "general_hospital", "subtype": "종합병원", "facility_level": None, "address": None, "coord_ok": True, "coord_source": "localdata", "coord_official": True, "gu_code": 11560,
            "lon": 126.9, "lat": 37.5, "x_5179": 0.0, "y_5179": 0.0, "usable": True, "in_scope": True, "status": "open", "dup_suspect": False}
    out = []
    for i, r in enumerate(rows):
        d = {**base, "facility_id": f"F{i}", "name": f"시설{i}", "name_norm": f"시설{i}", **r}
        out.append(d)
    return pd.DataFrame(out)


def _src_rows(fac: pd.DataFrame, date="2026-10-17") -> pd.DataFrame:
    return pd.DataFrame({"facility_id": fac["facility_id"], "coord_ok": fac["coord_ok"], "source_priority": 0, "source_id": fac["facility_id"], "source_date": date})


def test_provenance_marks_official_vs_supplementary_with_permission_and_attribution():
    fac = _fac({}, {"coord_source": "kakao", "coord_official": False}, {"coord_source": "seoul_cultural", "facility_type": "cultural_facility"}, {"coord_source": "sbiz"})
    out = b.add_provenance(fac, _src_rows(fac), [])
    by = out.set_index("facility_id")
    assert by.loc["F0", "source_type"] == "official" and by.loc["F0", "usage_permission_status"] == "confirmed" and "공공누리" in by.loc["F0", "attribution"]
    assert by.loc["F1", "source_type"] == "supplementary" and by.loc["F1", "usage_permission_status"] == "unconfirmed" and pd.isna(by.loc["F1", "attribution"])
    assert "운영정책" in by.loc["F1", "usage_permission_basis"] and "제5조" in by.loc["F1", "usage_permission_basis"] and "실시간 호출" in by.loc["F1", "usage_permission_basis"]
    assert by.loc["F2", "source_name"].startswith("서울시 문화공간") and by.loc["F3", "usage_permission_status"] == "confirmed"
    assert set(b.PERMISSION) == set(b.SOURCE_PRIORITY) and b.PERMISSION["kakao"]["status"] == "unconfirmed" and b.PERMISSION["seoul_college"]["status"] == "unconfirmed"
    assert (out["coordinate_source"] == out["coord_source"]).all() and (out["reference_date"] == "2026-10-17").all()


def test_only_official_confirmed_open_independent_facilities_are_analysis_eligible():
    fac = _fac({}, {"coord_source": "kakao", "coord_official": False}, {"status": "closed", "usable": False}, {"facility_type": "university", "facility_level": "college_unit"},
               {"facility_type": "university", "facility_level": "campus", "name": "서울대학교", "name_norm": "서울대학교", "coord_source": "seoul_college", "coord_official": False}, {"coord_ok": False})
    out = b.add_provenance(fac, _src_rows(fac), []).set_index("facility_id")
    assert out["analysis_eligible"].to_dict() == {"F0": True, "F1": False, "F2": False, "F3": False, "F4": False, "F5": False}
    assert not bool(out.loc["F3", "counts_as_independent"]) and bool(out.loc["F4", "counts_as_independent"])


def test_college_units_link_to_their_campus_but_are_never_merged_or_counted_as_universities():
    fac = _fac({"facility_type": "university", "facility_level": "campus", "name": "이화여자대학교", "name_norm": "이화여자대학교", "x_5179": 0.0, "y_5179": 0.0, "coord_source": "kakao", "coord_official": False},
               {"facility_type": "university", "facility_level": "college_unit", "name": "이화여자대학교 의과대학", "name_norm": "이화여자대학교의과대학", "x_5179": 800.0, "y_5179": 0.0, "coord_source": "kakao", "coord_official": False},
               {"facility_type": "university", "facility_level": "college_unit", "name": "SPC식품과학대학", "name_norm": "spc식품과학대학", "x_5179": 100.0, "y_5179": 0.0, "coord_source": "kakao", "coord_official": False},
               {"facility_type": "university", "facility_level": "college_unit", "name": "이화여자대학교 약학대학", "name_norm": "이화여자대학교약학대학", "x_5179": 5000.0, "y_5179": 0.0, "coord_source": "kakao", "coord_official": False})
    out = b.add_provenance(fac, _src_rows(fac), []).set_index("name")
    assert out.loc["이화여자대학교 의과대학", "parent_facility_id"] == "F0"                  # 이름이 포함되고 2km 이내
    assert out.loc["SPC식품과학대학", "parent_facility_id"] is None                         # 소속을 알 수 없으면 연결하지 않는다
    assert out.loc["이화여자대학교 약학대학", "parent_facility_id"] is None                   # 5km — 같은 캠퍼스로 보지 않는다
    assert out["counts_as_independent"].tolist() == [True, False, False, False] and len(out) == 4      # 병합 없이 4곳이 그대로 남는다


def test_search_cap_zones_and_official_coverage_gaps_are_recorded_per_facility(monkeypatch):
    monkeypatch.setitem(b.OFFICIAL_COVERAGE, "general_hospital", "pilot_gus_only")        # 두 구뿐인 공식 원천을 가정(지금은 심평원 전국 자료가 있어 해당 종류가 없다)
    fac = _fac({"facility_type": "department_store", "coord_source": "kakao", "coord_official": False, "lon": 126.9235, "lat": 37.4905},
               {"facility_type": "cinema", "coord_source": "kakao", "coord_official": False, "lon": 126.9235, "lat": 37.4905},          # 같은 구역이지만 한도에 닿은 검색은 '백화점'뿐
               {"gu_code": 11530, "coord_source": "kakao", "coord_official": False}, {"gu_code": 11560})
    z = [{"query": "백화점", "rect": [126.92343, 37.48987, 126.92593, 37.49237], "total_count": 154, "received": 45}]
    out = b.add_provenance(fac, _src_rows(fac), z).set_index("facility_id")
    assert out["coverage_status"].to_dict() == {"F0": "incomplete_zone", "F1": "ok", "F2": "outside_official_coverage", "F3": "ok"}


def test_duplicate_review_lists_evidence_but_never_merges_and_ignores_generic_shared_text():
    fac = _fac({"name": "한림대학교 강남성심병원", "name_norm": b.norm_name("한림대학교 강남성심병원"), "x_5179": 0.0, "y_5179": 0.0, "sources": '["localdata"]', "dup_suspect": True},
               {"name": "일송학원강남성심병원", "name_norm": b.norm_name("일송학원강남성심병원"), "x_5179": 6.0, "y_5179": 0.0, "sources": '["sbiz"]', "dup_suspect": True},
               {"facility_type": "cultural_facility", "name": "OPCI 영등포타임스퀘어점", "name_norm": b.norm_name("OPCI 영등포타임스퀘어점"), "x_5179": 3000.0, "y_5179": 0.0, "sources": '["kakao"]', "dup_suspect": True},
               {"facility_type": "cultural_facility", "name": "구립영등포아트스퀘어", "name_norm": b.norm_name("구립영등포아트스퀘어"), "x_5179": 3000.1, "y_5179": 0.0, "sources": '["seoul_cultural"]', "dup_suspect": True},
               {"facility_type": "cultural_facility", "name": "모래야놀자", "name_norm": b.norm_name("모래야놀자"), "x_5179": 6000.0, "y_5179": 0.0, "sources": '["kakao"]', "dup_suspect": True,
                "address": "서울 영등포구 문래로 1"},
               {"facility_type": "cultural_facility", "name": "대한무용협회", "name_norm": b.norm_name("대한무용협회"), "x_5179": 6004.0, "y_5179": 0.0, "sources": '["seoul_cultural"]', "dup_suspect": True,
                "address": "서울 영등포구 문래로 1"})
    r = b.dup_review_pairs(fac).set_index("name_a")
    assert (r["merged"] == False).all() and len(r) == 3                                              # noqa: E712 — 합치지 않는다
    assert r.loc["한림대학교 강남성심병원", "review_status"] == "merge_candidate" and "강남성심" in r.loc["한림대학교 강남성심병원", "meaningful_shared_text"]
    assert r.loc["OPCI 영등포타임스퀘어점", "review_status"] != "merge_candidate"                         # '영등포'만 겹치는 건 근거가 못 된다
    assert r.loc["모래야놀자", "review_status"] == "same_building_distinct_names"


def test_source_diagnostic_reports_missing_official_sources_as_unavailable_not_zero():
    fac = _fac({"facility_id": "A", "x_5179": 100.0, "y_5179": 0.0, "analysis_eligible": True, "counts_as_independent": True},
               {"facility_id": "B", "x_5179": 200.0, "y_5179": 0.0, "analysis_eligible": False, "coord_source": "kakao", "counts_as_independent": True},
               {"facility_id": "C", "facility_type": "cinema", "x_5179": 100.0, "y_5179": 0.0, "analysis_eligible": False, "coord_source": "kakao", "counts_as_independent": True})
    stores = pd.DataFrame({"lon": [126.97, 126.97], "lat": [37.56, 37.56]})
    import pyproj
    x, y = pyproj.Transformer.from_crs("EPSG:4326", "EPSG:5179", always_xy=True).transform(126.97, 37.56)
    fac["x_5179"] = fac["x_5179"] + x
    fac["y_5179"] = fac["y_5179"] + y
    d = b.source_diagnostic(fac, stores, radii=(500,)).set_index("facility_type")
    assert d.loc["general_hospital", "facilities_all"] == 2 and d.loc["general_hospital", "facilities_official_eligible"] == 1
    assert d.loc["general_hospital", "mean_count_all"] == 2.0 and d.loc["general_hospital", "mean_count_official"] == 1.0 and d.loc["general_hospital", "share_stores_count_differs"] == 1.0
    assert not bool(d.loc["cinema", "official_available"]) and "자료 없음" in d.loc["cinema", "interpretation"] and pd.isna(d.loc["cinema", "median_nearest_m_official"])


def test_real_provenance_columns_permissions_and_eligibility_are_consistent():
    fac, meta = _p("facilities.parquet"), _meta()
    for col in ("source_name", "source_type", "reference_date", "coordinate_source", "coverage_status", "usage_permission_status"):
        assert col in fac.columns and fac.loc[fac["coord_ok"], col].notna().all(), col
    assert set(fac["source_type"]) == {"official", "supplementary"} and set(fac["coverage_status"]) <= {"ok", "incomplete_zone", "outside_official_coverage"}
    assert not fac.loc[fac["coord_source"] == "kakao", "analysis_eligible"].any()                    # 권한 미확인 카카오는 분석 대상이 아니다
    assert (fac.loc[fac["analysis_eligible"], "usage_permission_status"] == "confirmed").all() and (fac.loc[fac["analysis_eligible"], "source_type"] == "official").all()
    assert fac.loc[fac["analysis_eligible"], "attribution"].notna().all()                              # 출처표시 문구가 항상 있다
    assert meta["analysis_eligible"] == {t: int(((fac["facility_type"] == t) & fac["analysis_eligible"] & fac["in_scope"]).sum()) for t in b.TYPES}
    assert meta["permission"]["kakao"]["status"] == "unconfirmed" and "운영정책" in meta["permission"]["kakao"]["basis"]
    uni = fac[fac["facility_type"] == "university"]
    assert (~uni.loc[uni["facility_level"] == "college_unit", "counts_as_independent"]).all() and uni.loc[uni["facility_level"] == "campus", "counts_as_independent"].all()


def test_real_search_cap_zones_are_recorded_and_flag_the_facilities_inside_them():
    fac, meta = _p("facilities.parquet"), _meta()
    zones = meta["incomplete_zones"]
    assert len(zones) == len(meta["kakao_capped_rects"]) and all(z["types"] for z in zones)
    flagged = fac[fac["coverage_status"] == "incomplete_zone"]
    for f in flagged.itertuples():
        assert any(f.facility_type in z["types"] and z["rect"][0] <= f.lon <= z["rect"][2] and z["rect"][1] <= f.lat <= z["rect"][3] for z in zones)
    out_cov = fac[fac["coverage_status"] == "outside_official_coverage"]
    assert (out_cov["facility_type"] == "general_hospital").all() and not out_cov["gu_code"].isin(b.PILOT_GU).any()     # 병원 공식 원천은 두 구뿐


def test_real_duplicate_review_and_source_diagnostic_files_match_the_metadata():
    meta = _meta()
    rev = pd.read_csv(config.TABLES_DIR / "facility_dup_review.csv")
    assert (rev["merged"] == False).all() and rev["review_status"].value_counts().to_dict() == meta["dup_review"]             # noqa: E712
    assert set(rev["review_status"]) <= {"merge_candidate", "same_building_distinct_names", "needs_review"}
    diag = pd.read_csv(config.TABLES_DIR / "facility_source_diagnostic.csv")
    assert set(diag["facility_type"]) == set(b.TYPES) and set(diag["radius_m"]) == {250, 500, 1000}
    nof = diag[~diag["official_available"]]
    assert set(nof["facility_type"]) == {"university", "outlet"} and nof["median_nearest_m_official"].isna().all()
    assert (diag.loc[diag["official_available"], "mean_count_official"] <= diag.loc[diag["official_available"], "mean_count_all"] + 1e-9).all()     # 공식만 쓰면 개수가 줄거나 같다


# ───────── 행안부 대규모점포(공식) ─────────
def _retail(**kw) -> dict:
    d = {"MNG_NO": "A1", "BPLC_NM": "테스트백화점", "BZSTAT_SE_NM": "백화점", "STOR_SE_NM": "대규모점포", "SALS_STTS_NM": "영업", "DTL_SALS_STTS_NM": "", "CRD_INFO_X": "191385.06", "CRD_INFO_Y": "446098.56",
         "ROAD_NM_ADDR": "서울특별시 영등포구 1", "LCPMT_YMD": "20100101", "CLSBIZ_YMD": "", "LAST_MDFCN_PNT": "2026-04-15 00:00:00", "OPN_ATMY_GRP_CD": "3180000"}
    return {**d, **kw}


def test_retail_classification_follows_the_registered_category_and_excludes_ssm_and_other_categories():
    assert b.classify_retail("백화점", "대규모점포") == ("department_store", "백화점")
    assert b.classify_retail("대형마트", "대규모점포")[0] == "hypermarket"
    assert b.classify_retail("쇼핑센터", "대규모점포")[0] == "shopping_mall" and b.classify_retail("복합쇼핑몰", "대규모점포")[0] == "shopping_mall"
    assert b.classify_retail("대형마트", "준대규모점포") is None                  # 기업형 슈퍼마켓은 대형마트가 아니다
    assert all(b.classify_retail(c, "대규모점포") is None for c in ("그 밖의 대규모점포", "전문점", "시장", "구분없음", None))


def test_retail_rows_convert_tm_coordinates_keep_missing_ones_missing_and_count_exclusions():
    env = {"collected_at": "2026-10-17", "rows": [_retail(), _retail(MNG_NO="A2", CRD_INFO_X="", CRD_INFO_Y=""), _retail(MNG_NO="A3", STOR_SE_NM="준대규모점포", BZSTAT_SE_NM="구분없음"),
                                                   _retail(MNG_NO="A4", BZSTAT_SE_NM="전문점"), _retail(MNG_NO="A5", SALS_STTS_NM="폐업")]}
    rows, info = b.rows_retail(env)
    assert [r["source_id"] for r in rows] == ["A1", "A2", "A5"]
    assert 126.8 < rows[0]["lon"] < 127.2 and 37.4 < rows[0]["lat"] < 37.7                  # 서울 안으로 변환됨
    assert pd.isna(rows[1]["lon"]) and pd.isna(rows[1]["lat"])                                # 좌표를 만들지 않는다
    assert info["ssm_excluded"] == 1 and info["other_category_excluded"] == {"전문점": 1} and info["no_coordinates"] == 1
    assert b.status_group(rows[2]["status_raw"]) == "closed" and b.status_group("휴업") == "suspended"


def test_retail_is_an_official_source_with_confirmed_permission_and_status_authority():
    assert "mois_retail" in b.OFFICIAL and "mois_retail" in b.LICENSE_STATUS_SOURCES
    assert b.PERMISSION["mois_retail"]["status"] == "confirmed" and "행정안전부" in b.PERMISSION["mois_retail"]["attribution"]
    assert {"department_store", "shopping_mall", "hypermarket"} <= {t for t, c in b.OFFICIAL_COVERAGE.items() if c == "national"}


def test_real_retail_official_facilities_have_confirmed_permission_and_agree_with_kakao_positions():
    fac, rows = _p("facilities.parquet"), _p("facility_source_rows.parquet")
    ok = fac[fac["facility_type"].isin(["department_store", "shopping_mall", "hypermarket"]) & fac["analysis_eligible"].astype(bool)]
    assert len(ok) > 0 and (ok["usage_permission_status"] == "confirmed").all() and (ok["source_type"] == "official").all()
    assert (ok["coordinate_source"] == "mois_retail").all()
    assert not rows[rows["source"] == "mois_retail"]["store_class"].eq("준대규모점포").any()                    # SSM 은 들어오지 않는다
    both = []                                                                                  # 공식·카카오가 같은 시설로 묶인 쌍의 위치 차이 — 좌표 변환이 맞다는 근거
    for _, g in rows[rows["facility_type"].isin(["department_store", "shopping_mall", "hypermarket"])].groupby("facility_id"):
        a, k = g[(g["source"] == "mois_retail") & g["lon"].notna()], g[g["source"] == "kakao"]
        if len(a) and len(k):
            both.append(float(np.hypot((a["lon"].iloc[0] - k["lon"].iloc[0]) * 88_000, (a["lat"].iloc[0] - k["lat"].iloc[0]) * 111_000)))
    assert len(both) >= 5 and max(both) <= 150 and np.median(both) <= 60


# ───────── 행안부 영화상영관 · 건강보험심사평가원 병원정보 ─────────
def _screen(mng, name, x="191385.05", y="446098.56", status="영업/정상", grp="3180000", **kw) -> dict:
    return {"MNG_NO": mng, "OPN_ATMY_GRP_CD": grp, "BPLC_NM": name, "CRD_INFO_X": x, "CRD_INFO_Y": y, "SALS_STTS_NM": status, "ROAD_NM_ADDR": "서울특별시 영등포구 1", "LOTNO_ADDR": "",
            "LAST_MDFCN_PNT": "2026-03-26 00:00:00", "DAT_UPDT_PNT": "2026-03-26 00:00:00", **kw}


def test_screen_names_are_reduced_to_the_theater_name():
    assert b.strip_screen("CGV 영등포 제5관") == "CGV 영등포" and b.strip_screen("킴스시네마(1관)") == "킴스시네마" and b.strip_screen("신정극장") == "신정극장"
    assert b.theater_name(["CGV 영등포 제5관", "CGV 영등포 12관(IMAX)", "CGV 영등포 제2관[4D]"]) == "CGV 영등포"
    assert b.theater_name(["메가박스중앙(주) 목동지점 COMFORT 5관", "메가박스중앙(주) 목동지점 9관", "메가박스중앙(주) 목동지점 DOLBY VISION+ATMOS"]) == "메가박스중앙(주) 목동지점"
    assert b.theater_name(["메가박스중앙(주)더부티크목동현대백화점101(COMFORT)", "메가박스중앙(주)더부티크목동현대백화점102(COMFORT)"]) == "메가박스중앙(주)더부티크목동현대백화점"


def test_movie_screens_at_one_spot_become_one_theater_and_status_is_open_if_any_screen_is_open():
    env = {"collected_at": "2026-10-17", "rows": [_screen("1", "CGV 영등포 제1관"), _screen("2", "CGV 영등포 제2관"), _screen("3", "CGV 영등포 제3관", status="폐업"),
                                                   _screen("4", "롯데시네마 영등포 1관", x="191741.34", y="446000.0", status="폐업"), _screen("5", "롯데시네마 영등포 2관", x="191741.34", y="446000.0", status="폐업"),
                                                   _screen("6", "좌표없는극장 1관", x="", y="")]}
    rows, info = b.rows_movie(env)
    by = {r["name"]: r for r in rows}
    assert set(by) == {"CGV 영등포", "롯데시네마 영등포", "좌표없는극장"} and info["input_screens"] == 6 and info["theater_sites"] == 3 and info["screens_without_coordinates"] == 1
    assert by["CGV 영등포"]["status_group"] == "open" and by["CGV 영등포"]["screen_count"] == 3 and by["CGV 영등포"]["open_screens"] == 2
    assert by["롯데시네마 영등포"]["status_group"] == "closed" and pd.isna(by["좌표없는극장"]["lon"])


def test_movie_management_numbers_repeat_nationwide_so_the_source_id_includes_the_authority_code():
    env = {"collected_at": "2026-10-17", "rows": [_screen("CDFF1", "롯데시네마 속초 1관", grp="4231000"), _screen("CDFF1", "롯데시네마 검단 1관", x="", y="", grp="3010000")]}
    rows, _ = b.rows_movie(env)
    assert len({r["source_id"] for r in rows}) == 2 and {r["source_id"] for r in rows} == {"4231000-CDFF1", "3010000-CDFF1"}


def test_hira_rows_keep_the_hospital_class_but_say_nothing_about_status():
    env = {"collected_at": "2026-10-17", "rows": [{"ykiho": "ABC", "yadmNm": "가나다병원", "clCdNm": "상급종합", "addr": "서울 1", "XPos": "126.9677500", "YPos": 37.5684083, "sidoCdNm": "서울", "sgguCdNm": "종로구"}]}
    r = b.rows_hira(env)[0]
    assert r["subtype"] == "상급종합" and r["status_group"] == "unknown" and abs(r["lon"] - 126.96775) < 1e-9 and r["source"] == "hira"
    assert "hira" in b.OFFICIAL and "hira" not in b.LICENSE_STATUS_SOURCES
    assert "출처표시" in b.PERMISSION["hira"]["basis"] and "건강보험심사평가원" in b.PERMISSION["hira"]["attribution"]


def test_a_shopping_listing_hospital_is_not_counted_separately_from_the_licensed_hospital_it_renames():
    fac = _fac({"facility_type": "general_hospital", "name": "이화여자대학교의과대학부속목동병원", "name_norm": b.norm_name("이화여자대학교의과대학부속목동병원"), "sources": '["hira", "localdata"]', "x_5179": 0.0, "y_5179": 0.0},
               {"facility_type": "general_hospital", "name": "이화의대부속목동병원", "name_norm": b.norm_name("이화의대부속목동병원"), "sources": '["sbiz"]', "x_5179": 69.0, "y_5179": 0.0},
               {"facility_type": "general_hospital", "name": "전혀다른병원", "name_norm": b.norm_name("전혀다른병원"), "sources": '["sbiz"]', "x_5179": 40.0, "y_5179": 0.0})
    out = b.add_provenance(fac, _src_rows(fac), []).set_index("facility_id")
    assert list(out["counts_as_independent"]) == [True, False, True] and out.loc["F1", "parent_facility_id"] == "F0"
    assert not out.loc["F1", "analysis_eligible"] and out.loc["F2", "analysis_eligible"] in (True, False)


def test_real_cinema_and_hospital_official_data_have_confirmed_permission_and_sane_positions():
    fac = _p("facilities.parquet")
    ci = fac[(fac["facility_type"] == "cinema") & fac["analysis_eligible"].astype(bool)]
    assert len(ci) >= 8 and (ci["usage_permission_status"] == "confirmed").all() and (ci["coordinate_source"] == "mois_movie").all()
    assert not ci["name"].str.contains(r"\d+\s*관").any()                                                     # 상영관 번호가 이름에 남지 않는다
    assert ci["facility_id"].is_unique
    ho = fac[(fac["facility_type"] == "general_hospital") & fac["analysis_eligible"].astype(bool)]
    assert {"hira"} <= set(ho["coordinate_source"]) and (ho["usage_permission_status"] == "confirmed").all()
    assert (ho["subtype"] == "상급종합").sum() >= 2                                                           # 상급종합 구분이 심평원 자료에서 온다
    assert not fac.loc[fac["facility_type"] == "cinema", "coord_spread_m"].gt(300).any()                      # 서로 다른 영화관이 한 시설로 섞이지 않는다


# ───────── 정확도 개선: 구분없음·이동상영관·표시명·오래된 기록 ─────────
def test_unclassified_large_stores_are_kept_apart_not_guessed_as_hypermarkets():
    env = {"collected_at": "2026-10-17", "rows": [_retail(MNG_NO="U1", BPLC_NM="롯데쇼핑(주) 롯데마트맥스 영등포점", BZSTAT_SE_NM="구분없음", STOR_SE_NM="대규모점포"),
                                                   _retail(MNG_NO="U2", BPLC_NM="GS THE FRESH 어딘가점", BZSTAT_SE_NM="구분없음", STOR_SE_NM="준대규모점포"),
                                                   _retail(MNG_NO="U3", BPLC_NM="시장", BZSTAT_SE_NM="시장", STOR_SE_NM="대규모점포")]}
    rows, info = b.rows_retail(env)
    assert [(r["source_id"], r["facility_type"]) for r in rows] == [("U1", b.UNCLASSIFIED_RETAIL)] and b.UNCLASSIFIED_RETAIL not in b.TYPES
    assert info["unclassified_kept"] == 1 and info["ssm_excluded"] == 1 and info["other_category_excluded"] == {"시장": 1}


def test_mobile_screening_units_are_not_counted_as_cinemas():
    env = {"collected_at": "2026-10-17", "rows": [_screen("1", "서울동화(이동상영관)"), _screen("2", "CGV 영등포 제1관", x="191741.34", y="446000.0")]}
    rows, info = b.rows_movie(env)
    assert [r["name"] for r in rows] == ["CGV 영등포"] and info["mobile_screening_excluded"] == 1


def test_display_names_drop_operator_corporate_names_but_the_official_name_is_kept():
    addr = "서울특별시 구로구 경인로 662 (신도림동, 디큐브시티 제타워동 7~8층 일부)"
    assert b.display_name("cinema", "롯데컬처웍스(주)롯데시네마", addr) == "롯데시네마 (신도림동)"
    assert b.display_name("cinema", "메가박스중앙(주) 목동지점", None) == "메가박스 목동지점"
    assert b.display_name("cinema", "메가박스중앙(주)더부티크목동현대백화점", None) == "메가박스 더부티크목동현대백화점"
    assert b.display_name("cinema", "롯데컬처웍스(주)롯데시네마", None) == "롯데시네마"                                  # 주소에서 지점을 알 수 없으면 지어내지 않는다
    assert b.display_name("hypermarket", "(주)이마트 신도림점", addr) == "(주)이마트 신도림점"                          # 영화관만 손댄다


def test_old_coordinate_less_registrations_are_set_apart_and_do_not_count_as_missing():
    assert b.stale_before("2026-10-17") == "2021-10-17"
    fac = _fac({"facility_type": "cinema", "name": "시네마그래픽", "coord_ok": False, "official_listed": True, "reference_date": "2003-04-18", "address": "408-196 양천구 목1동", "address_area": "pilot", "status": "open", "gu_code": None},
               {"facility_type": "cinema", "name": "새극장", "coord_ok": False, "official_listed": True, "reference_date": "2026-05-01", "address": "서울특별시 영등포구 어딘가 1", "address_area": "pilot", "status": "open", "gu_code": None},
               {"facility_type": "cinema", "name": "CGV 영등포", "official_listed": True, "reference_date": "2026-06-01", "gu_code": 11560, "status": "open"})
    unloc, cover = b.unlocated_official(fac, "2021-10-17")
    assert unloc["cinema"]["pilot"]["count"] == 1 and unloc["cinema"]["pilot"]["names"] == ["새극장"]
    assert unloc["cinema"]["stale"]["pilot"]["names"] == ["시네마그래픽"] and unloc["cinema"]["stale"]["pilot"]["by_gu"] == {"양천구": 1}
    assert cover["cinema"]["pilot_unlocated"] == 1 and cover["cinema"]["pilot_unlocated_stale"] == 1
    assert cover["cinema"]["pilot_coord_rate"] == 0.5 and cover["cinema"]["pilot_coord_rate_incl_stale"] == round(1 / 3, 3)


def test_kakao_only_review_says_whether_an_official_facility_is_close_and_of_which_kind():
    fac = _fac({"facility_type": "shopping_mall", "name": "타임스퀘어", "official_listed": True, "x_5179": 0.0, "y_5179": 0.0},
               {"facility_type": "hypermarket", "name": "이마트 영등포점", "official_listed": False, "x_5179": 40.0, "y_5179": 0.0},
               {"facility_type": "shopping_mall", "name": "타임스퀘어몰", "official_listed": False, "x_5179": 5.0, "y_5179": 0.0},
               {"facility_type": "hypermarket", "name": "먼마트", "official_listed": False, "x_5179": 9000.0, "y_5179": 0.0})
    r = b.kakao_only_review(fac).set_index("name")
    assert "입점 매장" in r.loc["이마트 영등포점", "reading"] and r.loc["이마트 영등포점", "nearest_official"] == "타임스퀘어"
    assert "같은 시설의 다른 표기" in r.loc["타임스퀘어몰", "reading"] and pd.isna(r.loc["먼마트", "nearest_official"]) and "찾지 못함" in r.loc["먼마트", "reading"]


def test_real_unclassified_and_display_names_in_the_outputs():
    fac = _p("facilities.parquet")
    u = fac[(fac["facility_type"] == b.UNCLASSIFIED_RETAIL) & fac["in_scope"]]
    assert u["name"].str.contains("롯데마트맥스 영등포점").any() and (u["subtype"] == "구분없음").all()
    ci = fac[(fac["facility_type"] == "cinema") & fac["analysis_eligible"] & fac["in_scope"]]
    assert "롯데컬처웍스(주)롯데시네마" in set(ci["name"]) and "롯데시네마 (신도림동)" in set(ci["display_name"])             # 공식 명칭 유지 + 표시명
    assert not ci["name"].str.contains("이동상영").any()
    meta = _meta()
    assert meta["stale_before"] and meta["unlocated_official"]["cinema"]["stale"]["pilot"]["count"] >= 1 and meta["unlocated_official"]["cinema"]["pilot"]["count"] == 0
