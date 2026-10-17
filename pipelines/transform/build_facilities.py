"""주요 집객시설 개별 시설 정규화·중복 정리·품질 검증 (1차: 서울 양천·영등포 + 인접 지역, 구역 밖 1.1km 버퍼).

입력(읽기 전용)
- data/raw/facilities/{kakao_facilities, seoul_cultural, seoul_college}_*.json (collect_facilities 수집분, 가장 최근 것)
- data/raw/facilities/mois_retail_*.json — 행정안전부 생활 대규모점포 조회서비스(전국 인허가, TM 좌표·영업상태) — 대형마트·백화점·쇼핑센터·복합쇼핑몰의 공식 원천
- data/raw/facilities/mois_movie_*.json — 행정안전부 영화상영관 조회서비스(전국 인허가, 상영관 단위 행 → 같은 좌표의 상영관을 영화관 한 곳으로 묶음)
- data/raw/facilities/hira_hospitals_*.json — 건강보험심사평가원 병원정보서비스(전국 상급종합·종합병원, WGS84, 영업상태 없음)
- data/processed/licenses.parquet — 서울시 LOCALDATA 병원 인허가(010101, 양천·영등포) — 공식 인허가, 영업상태·좌표 있음
- data/raw/sbiz/sangga_*.json — 소상공인 상가업소(양천·영등포) 중 종합병원(Q10101) — 공식 공개 자료
- data/processed/dong_hinterland.parquet(+ regions.geojson, dong_crosswalk) — 서울시 행정동 단위 시설 '수'(비교용, 개별 시설 좌표가 아님)

출력(data/processed): facilities.parquet(물리적 시설 하나당 한 행) · facility_source_rows.parquet(원천 행 전부 + 출처·기준일·군집) · facilities_meta.json / outputs/tables: facility_report.csv · facility_source_survey.csv
기존 파일은 건드리지 않는다.

규칙 (테스트로 지킨다)
- 시설 종류: general_hospital(종합병원·대학병원) / university(대학교 캠퍼스, 단과대학 등은 college_unit 로 구분) / department_store / shopping_mall / outlet / hypermarket(대형마트) / cinema / cultural_facility(공연장·미술관·박물관·도서관 등).
  '상급종합병원' 지정 정보는 승인된 공식 자료가 없어 구분하지 않는다(general_hospital 에 같이 담김). 슈퍼마켓·대형슈퍼(SSM)는 대형마트가 아니라서 넣지 않는다.
- 같은 시설의 여러 원천 행은 (종류가 같고, 구분 수준이 같고, 이름이 일치·포함 관계이고, 150m 이내)일 때만 하나로 묶는다. 이름이 같아도 150m 밖이면 다른 시설(지점·캠퍼스), 대학교 캠퍼스와 단과대학 건물은 서로 묶지 않는다.
  좌표가 없는 행은 거리로 묶지 못하므로 이름이 정확히 같은 군집에만 붙이고, 아니면 좌표 없음으로 남긴다(좌표를 만들지 않는다).
- 대표 좌표는 공식 원천(LOCALDATA > 상가정보 > 서울시 문화공간) 우선, 없으면 카카오. 카카오는 공식 자료가 아니라 보조 출처이며 시설 이용객 수는 어디에도 없다(추정하지 않는다).
- 폐업·취소 상태는 공식 인허가(LOCALDATA)가 말할 때만 반영한다. 다른 원천의 상태는 'unknown'(등재 시점 기준)이다.
- 서울시 시설 수(행정동·상권 단위)와 개별 시설 좌표는 집계 기준이 다르다 — 행정동별로 비교만 하고 합치지 않는다.
실행: .venv/bin/python -m pipelines.transform.build_facilities
"""
from __future__ import annotations

import argparse
import json
import re
from difflib import SequenceMatcher
from pathlib import Path

import numpy as np
import pandas as pd

from pipelines.common import config
from pipelines.transform import build_bus_stops as bus

RAW = config.RAW_DIR / "facilities"
BUFFER_M = bus.BUFFER_M
DUP_MAX_M = 150                  # 같은 이름·같은 종류가 이 거리 안이면 같은 시설
MISMATCH_MAX_M = 1_500           # 이름이 같은데 DUP_MAX_M 보다 멀고 이 거리 안이면 '좌표 불일치 의심'
HOSPITAL_VARIANT_M = 100         # 상가정보에만 있는 병원 등재가 이 거리 안의 인허가·심평원 병원과 이름이 겹치면 같은 병원의 다른 표기로 보고 독립 시설로 세지 않음
NEAR_DIFFNAME_M = 30             # 이름이 달라도 이 거리 안이면 '중복 의심'(같은 건물의 다른 표기일 수 있음)
SOURCE_PRIORITY = {"localdata": 0, "hira": 1, "mois_retail": 2, "mois_movie": 3, "sbiz": 4, "seoul_cultural": 5, "seoul_college": 6, "kakao": 7}
OFFICIAL = {"localdata", "hira", "mois_retail", "mois_movie", "sbiz", "seoul_cultural", "seoul_college"}
LICENSE_STATUS_SOURCES = ("localdata", "mois_retail", "mois_movie")          # 영업·폐업 상태를 말하는 공식 인허가 원천(나머지는 상태 unknown)
SOURCE_LABEL = {"hira": "건강보험심사평가원 병원정보서비스", "mois_movie": "행정안전부 영화상영관 조회서비스", "localdata": "서울시 LOCALDATA 병원 인허가", "mois_retail": "행정안전부 생활 대규모점포 조회서비스", "sbiz": "소상공인 상가업소(종합병원)", "seoul_cultural": "서울 열린데이터광장 문화공간(culturalSpaceInfo)",
                "seoul_college": "서울 열린데이터광장 대학교 기본정보(SebcCollegeInfoKor)", "kakao": "카카오 로컬(보조)"}
TYPES = ("general_hospital", "university", "department_store", "shopping_mall", "outlet", "hypermarket", "cinema", "cultural_facility")
TYPE_LABEL = {"general_hospital": "종합병원", "university": "대학교", "department_store": "백화점", "shopping_mall": "복합쇼핑몰", "outlet": "아울렛", "hypermarket": "대형마트",
              "cinema": "영화관", "cultural_facility": "문화시설"}
_NOISE = re.compile(r"[\s\.\,\-_/·・]+")
_PAREN = re.compile(r"\([^)]*\)|（[^）]*）")
_COLLEGE_UNIT = re.compile(r"의과대학|과학대학|학부|단과대|대학원$|연구소|병원$|도서관$|기숙사|캠퍼스타운")
_CAMPUS = re.compile(r"(대학교|대학원대학교|대학교 .*캠퍼스|캠퍼스)$")


# ── 이름·분류 ─────────────────────────────────────────────────────────────────────────────────

def norm_name(s) -> str:
    return _NOISE.sub("", _PAREN.sub("", str(s or ""))).lower()


def names_agree(a: str, b: str) -> bool:
    """정규화한 이름이 같거나 한쪽이 다른 쪽에 3글자 이상 포함된다."""
    if not a or not b:
        return False
    if a == b:
        return True
    short, long_ = (a, b) if len(a) <= len(b) else (b, a)
    return len(short) >= 3 and short in long_


def university_level(name: str) -> str:
    """'campus'(대학교 캠퍼스) / 'college_unit'(단과대학·학부·대학원·부속 기관 건물). 단과대학을 캠퍼스와 묶지 않는다."""
    n = str(name or "").strip()
    if _COLLEGE_UNIT.search(n) and not re.search(r"대학교\s*(서울|\w+)?캠퍼스$", n):
        return "college_unit"
    return "campus" if _CAMPUS.search(n) or n.endswith("대학교") else "college_unit"


def classify_kakao(category: str, name: str) -> tuple[str, str, str | None] | None:
    """카카오 category_name → (종류, 세부, 수준). 우리 종류가 아니면 None(예: 패션·슈퍼마켓·주차장·초중고)."""
    c = category or ""
    if c.startswith("가정,생활 > 백화점"):
        return "department_store", "백화점", None
    if c.startswith("가정,생활 > 복합쇼핑몰"):
        return "shopping_mall", "복합쇼핑몰", None
    if c.startswith("가정,생활 > 대형마트"):
        return "hypermarket", c.split(" > ")[-1] if c.count(">") >= 2 else "대형마트", None
    if c.startswith("가정,생활 > 상설할인매장") and re.search(r"아울렛|outlet", name or "", re.I):
        return "outlet", "아울렛", None
    if c.startswith("문화,예술 > 영화,영상 > 영화관"):
        return "cinema", "영화관", None
    if c.startswith("문화,예술 > 문화시설"):
        return "cultural_facility", c.split(" > ")[-1], None
    if c.startswith("교육,학문 > 학교 > 대학교"):
        return "university", "대학교", university_level(name)
    if c.startswith("의료,건강 > 병원 > 종합병원") or c.startswith("의료,건강 > 병원 > 대학병원"):
        return "general_hospital", c.split(" > ")[-1], None
    return None


def status_group(raw: str | None) -> str:
    """LOCALDATA 영업상태 → open / closed / cancelled / unknown. 다른 원천은 상태를 말하지 않으므로 unknown."""
    r = str(raw or "")
    if r.startswith("영업"):
        return "open"
    if r.startswith("폐업"):
        return "closed"
    if r.startswith("취소") or r.startswith("제외"):
        return "cancelled"
    if r.startswith("휴업"):
        return "suspended"
    return "unknown"


# ── 원천 읽기 ─────────────────────────────────────────────────────────────────────────────────

def _latest(prefix: str, root: Path = RAW) -> Path | None:
    files = sorted(root.glob(f"{prefix}_*.json"))
    return files[-1] if files else None


def _env(prefix: str) -> dict:
    p = _latest(prefix)
    if p is None:
        raise FileNotFoundError(f"data/raw/facilities/{prefix}_*.json 이 없습니다 — 먼저 collect_facilities 를 실행하세요")
    return json.loads(p.read_text(encoding="utf-8"))


def _row(source, source_id, ftype, subtype, level, name, address, lon, lat, status_raw, source_date, category, extra=None) -> dict:
    r = {"source": source, "source_id": str(source_id), "facility_type": ftype, "subtype": subtype, "facility_level": level, "name": str(name or "").strip(), "name_norm": norm_name(name),
         "address": (str(address).strip() if address and str(address) != "nan" else None), "lon": lon, "lat": lat, "status_raw": status_raw, "status_group": status_group(status_raw),
         "source_date": source_date, "source_category": category}
    r.update(extra or {})
    return r


def rows_kakao(env: dict) -> tuple[list[dict], dict]:
    out, dropped = [], {}
    date_ = str(env.get("collected_at", ""))[:10]
    for d in env["rows"]:
        cls = classify_kakao(d.get("category_name", ""), d.get("place_name", ""))
        if cls is None:
            key = " > ".join(str(d.get("category_name", "")).split(" > ")[:2]) or "(없음)"
            dropped[key] = dropped.get(key, 0) + 1
            continue
        out.append(_row("kakao", d["id"], cls[0], cls[1], cls[2], d["place_name"], d.get("road_address_name") or d.get("address_name"), _f(d.get("x")), _f(d.get("y")),
                        None, date_, d.get("category_name")))
    return out, dropped


def _f(v):
    try:
        x = float(v)
    except (TypeError, ValueError):
        return np.nan
    return x if np.isfinite(x) else np.nan


def rows_cultural(env: dict) -> tuple[list[dict], dict]:
    """서울시 문화공간 — X_COORD 가 위도, Y_COORD 가 경도로 뒤바뀌어 온다. 값 범위로 확인해 바로잡고 건수를 센다."""
    out, swapped, normal, bad = [], 0, 0, 0
    date_ = str(env.get("collected_at", ""))[:10]
    for d in env["rows"]:
        a, b = _f(d.get("X_COORD")), _f(d.get("Y_COORD"))
        if 33 <= a <= 39 and 124 <= b <= 132:
            lat, lon, swapped = a, b, swapped + 1
        elif 124 <= a <= 132 and 33 <= b <= 39:
            lon, lat, normal = a, b, normal + 1
        else:
            lon = lat = np.nan
            bad += 1
        out.append(_row("seoul_cultural", d.get("NUM") or d.get("FAC_NAME"), "cultural_facility", d.get("SUBJCODE") or "기타", None, d.get("FAC_NAME"), d.get("ADDR"), lon, lat, None, date_,
                        d.get("SUBJCODE"), {"gu_name": d.get("GNGU")}))
    return out, {"swapped_as_expected": swapped, "normal_order": normal, "unparseable": bad}


def rows_college(env: dict) -> list[dict]:
    """서울시 대학교 기본정보 — 주소만 있고 좌표가 없다(좌표를 만들지 않는다). 자료 연도가 오래돼 목록 대조용."""
    date_ = str(env.get("collected_at", ""))[:10]
    return [_row("seoul_college", d.get("MAIN_KEY"), "university", d.get("CATE1_NAME") or "대학교", university_level(d.get("NAME_KOR")), d.get("NAME_KOR"), d.get("ADD_KOR"), np.nan, np.nan,
                 d.get("STATE"), date_, d.get("CATE1_NAME"), {"gu_name": d.get("H_KOR_GU"), "survey_year": d.get("YEAR")}) for d in env["rows"]]


def rows_localdata() -> list[dict]:
    p = config.PROCESSED_DIR / "licenses.parquet"
    if not p.exists():
        return []
    l = pd.read_parquet(p)
    h = l[(l["license_code"] == "010101") & (l["uptae"] == "종합병원")]
    return [_row("localdata", r.license_id, "general_hospital", "종합병원", None, r.name, r.road_addr or r.jibun_addr, _f(r.lon), _f(r.lat), r.state_name, str(r.collected_at)[:10], "LOCALDATA 병원(종합병원)",
                 {"permit_date": None if pd.isna(r.permit_date) else str(r.permit_date)[:10], "close_date": None if pd.isna(r.close_date) else str(r.close_date)[:10]}) for r in h.itertuples()]


UNCLASSIFIED_RETAIL = "retail_unclassified"          # 등록 구분이 '구분없음'인 대규모점포 — 종류를 알 수 없어 대형마트 등으로 임의 분류하지 않고 따로 둔다(TYPES 에 없음)
RETAIL_TYPE = {"백화점": ("department_store", "백화점"), "대형마트": ("hypermarket", "대형마트"), "쇼핑센터": ("shopping_mall", "쇼핑센터"), "복합쇼핑몰": ("shopping_mall", "복합쇼핑몰")}


def classify_retail(biz_class: str | None, store_class: str | None) -> tuple[str, str] | None:
    """행안부 대규모점포 → (종류, 세부). 준대규모점포(기업형 슈퍼마켓)와 '구분없음·그 밖의 대규모점포·전문점·시장'은 우리 종류가 아니다.
    등록 구분(BZSTAT_SE_NM)을 그대로 따른다 — 상호와 구분이 어긋나 보이는 행(예: 이마트가 '백화점'으로 등록)도 임의로 바꾸지 않는다."""
    if str(store_class or "").strip() == "준대규모점포":
        return None
    return RETAIL_TYPE.get(str(biz_class or "").strip())


PILOT_ADDR = ("양천구", "영등포구")
NEIGHBOR_ADDR = ("강서구", "구로구", "금천구", "관악구", "동작구", "마포구", "용산구", "광명시", "부천시")          # 파일럿 두 구와 맞닿았거나 1.1km 수집 구역에 걸치는 시군구


def address_area(addr) -> str | None:
    """주소 글자로 본 위치: pilot(양천·영등포) / neighbor(맞닿은 구·시) / None(그 밖이거나 주소 없음). 좌표가 없는 공식 시설이 어디쯤 있는지 가늠하는 데만 쓴다(좌표를 만들지 않는다)."""
    t = str(addr or "")
    if any(g in t for g in PILOT_ADDR):
        return "pilot"
    if any(g in t for g in NEIGHBOR_ADDR) and ("서울" in t or "경기" in t):          # 부산 강서구 같은 같은 이름의 다른 지역을 걸러낸다
        return "neighbor"
    return None


def rows_retail(env: dict) -> tuple[list[dict], dict]:
    """전국 대규모점포 원본 → 우리 종류의 시설 행. 좌표는 TM(EPSG:5174)을 WGS84 로 바꾼다(없으면 좌표 없음으로 남김). 건수·제외 사유를 돌려준다."""
    import pyproj
    to_wgs = pyproj.Transformer.from_crs("EPSG:5174", config.CRS_WGS84, always_xy=True)
    out, info = [], {"input": len(env["rows"]), "ssm_excluded": 0, "other_category_excluded": {}, "no_coordinates": 0}
    for d in env["rows"]:
        cls = classify_retail(d.get("BZSTAT_SE_NM"), d.get("STOR_SE_NM"))
        if cls is None and str(d.get("STOR_SE_NM") or "").strip() == "대규모점포" and str(d.get("BZSTAT_SE_NM") or "").strip() == "구분없음":
            cls = (UNCLASSIFIED_RETAIL, "구분없음")
            info["unclassified_kept"] = info.get("unclassified_kept", 0) + 1
        if cls is None:
            if str(d.get("STOR_SE_NM") or "").strip() == "준대규모점포":
                info["ssm_excluded"] += 1
            else:
                k = str(d.get("BZSTAT_SE_NM") or "(없음)")
                info["other_category_excluded"][k] = info["other_category_excluded"].get(k, 0) + 1
            continue
        x, y = _f(d.get("CRD_INFO_X")), _f(d.get("CRD_INFO_Y"))
        lon, lat = (np.nan, np.nan) if np.isnan(x) or np.isnan(y) else to_wgs.transform(x, y)
        if np.isnan(lon):
            info["no_coordinates"] += 1
        status = d.get("SALS_STTS_NM")
        if str(d.get("DTL_SALS_STTS_NM") or "") == "영업개시전":
            status = "영업개시전"
        out.append(_row("mois_retail", d["MNG_NO"], cls[0], cls[1], None, d.get("BPLC_NM"), d.get("ROAD_NM_ADDR") or d.get("LOTNO_ADDR"), lon, lat, status,
                        str(d.get("LAST_MDFCN_PNT") or "")[:10] or str(env.get("collected_at", ""))[:10], d.get("BZSTAT_SE_NM"),
                        {"permit_date": d.get("LCPMT_YMD") or None, "close_date": d.get("CLSBIZ_YMD") or None, "store_class": d.get("STOR_SE_NM") or None, "opn_atmy_grp_cd": d.get("OPN_ATMY_GRP_CD")}))
    return out, info


_SCREEN = re.compile(r"[\s\(\[]*(제\s*)?\d+\s*관.*$")


def strip_screen(name: str) -> str:
    """'CGV 영등포 제5관' → 'CGV 영등포'. 상영관 번호 이후를 떼어 영화관 이름만 남긴다."""
    n = _SCREEN.sub("", str(name or "").strip()).strip(" -_·(")
    return n or str(name or "").strip()


def theater_name(names: list[str]) -> str:
    """같은 영화관의 상영관 이름들에서 영화관 이름을 뽑는다 — 공통 앞부분(상영관 번호·숫자 꼬리 제거), 너무 짧으면 첫 상영관 이름에서 번호만 뗀 것."""
    names = sorted(set(str(n or "").strip() for n in names if n))
    pref = names[0]
    for n in names[1:]:
        i = 0
        while i < min(len(pref), len(n)) and pref[i] == n[i]:
            i += 1
        pref = pref[:i]
    pref = strip_screen(pref.rstrip(" -_·([0123456789제"))
    return pref if len(pref) >= 3 else strip_screen(names[0])


def _movie_id(d: dict) -> str:
    """영화상영관의 관리번호(MNG_NO)는 전국에서 유일하지 않다(5,244건 중 608개 값) — 개방자치단체코드와 합친 키만 유일하다."""
    return f"{d.get('OPN_ATMY_GRP_CD')}-{d['MNG_NO']}"


_CORP = re.compile(r"\(주\)|㈜|주식회사|\(유\)")
_OPERATOR_PREFIX = (("메가박스중앙", "메가박스 "), ("롯데컬처웍스", ""), ("씨제이씨지브이", "CGV "))
_BRANDS = ("롯데시네마", "메가박스", "CGV", "씨네Q", "CINE Q")


def display_name(ftype: str, name: str, address) -> str:
    """화면에 보일 이름 — 공식 명칭(`name`)은 그대로 두고, 영화관만 운영사 법인명을 떼어 읽기 쉽게 한다.
    법인명을 떼고 나면 브랜드만 남는 경우(예: '롯데컬처웍스(주)롯데시네마')는 공식 도로명주소 괄호 속 법정동을 붙여 지점을 구분한다. 알 수 없는 건 지어내지 않는다."""
    if ftype != "cinema":
        return name
    n = _CORP.sub("", str(name or "")).strip()
    for pre, rep_ in _OPERATOR_PREFIX:
        if n.startswith(pre):
            n = (rep_ + n[len(pre):]).strip()
    n = re.sub(r"\s+", " ", n)
    if n in _BRANDS:
        m = re.search(r"\(([^,)]+?동[0-9가]*)\s*[,)]", str(address or ""))
        n = f"{n} ({m.group(1)})" if m else n
    return n or name


def rows_movie(env: dict) -> tuple[list[dict], dict]:
    """행안부 영화상영관(상영관 단위) → 영화관 단위 행. 같은 좌표(1m)이면서 이름 앞 3글자가 같은 상영관을 한 곳으로 묶고, 좌표가 없는 상영관은 좌표를 만들지 않고 이름만 남긴다.
    한 곳의 상태: 영업 중인 상영관이 하나라도 있으면 영업, 아니면 휴업 → 폐업 → 취소 순."""
    import pyproj
    to_wgs = pyproj.Transformer.from_crs("EPSG:5174", config.CRS_WGS84, always_xy=True)
    groups: dict[tuple, list[dict]] = {}
    no_coord = 0
    mobile = 0
    for d in env["rows"]:
        if "이동상영" in str(d.get("BPLC_NM") or ""):                      # 이동상영관은 고정된 영화관이 아니다
            mobile += 1
            continue
        x, y = _f(d.get("CRD_INFO_X")), _f(d.get("CRD_INFO_Y"))
        if np.isnan(x) or np.isnan(y):
            no_coord += 1
            key = ("nocoord", strip_screen(d.get("BPLC_NM")), str(d.get("ROAD_NM_ADDR") or d.get("LOTNO_ADDR") or ""))
        else:
            key = (round(x), round(y), strip_screen(d.get("BPLC_NM"))[:3])
        groups.setdefault(key, []).append(d)
    out, order = [], {"영업": 0, "휴업": 1, "폐업": 2, "취소": 3}
    for key in sorted(groups, key=lambda k: tuple(str(v) for v in k)):
        g = sorted(groups[key], key=lambda d: _movie_id(d))
        stat = [str(d.get("SALS_STTS_NM") or "") for d in g]
        head_status = min(stat, key=lambda v: order.get(next((k for k in order if v.startswith(k)), "취소"), 4))
        x, y = _f(g[0].get("CRD_INFO_X")), _f(g[0].get("CRD_INFO_Y"))
        lon, lat = (np.nan, np.nan) if np.isnan(x) or np.isnan(y) else to_wgs.transform(x, y)
        dates = [str(d.get("LAST_MDFCN_PNT") or d.get("DAT_UPDT_PNT") or "")[:10] for d in g]
        out.append(_row("mois_movie", _movie_id(g[0]), "cinema", "영화상영관", None, theater_name([d.get("BPLC_NM") for d in g]), g[0].get("ROAD_NM_ADDR") or g[0].get("LOTNO_ADDR"), lon, lat,
                        head_status, max(dates) or str(env.get("collected_at", ""))[:10], "영화상영관",
                        {"screen_count": len(g), "open_screens": sum(1 for v in stat if v.startswith("영업")), "close_date": None}))
    return out, {"input_screens": len(env["rows"]), "theater_sites": len(out), "screens_without_coordinates": no_coord, "mobile_screening_excluded": mobile}


def rows_hira(env: dict) -> list[dict]:
    """건강보험심사평가원 병원정보 → 종합병원 행. 종별(상급종합·종합병원)을 subtype 에 남기고, 영업상태는 말하지 않는다(status unknown)."""
    out = []
    for d in env["rows"]:
        out.append(_row("hira", d.get("ykiho") or f"{d.get('yadmNm')}:{d.get('addr')}", "general_hospital", d.get("clCdNm"), None, d.get("yadmNm"), d.get("addr"), _f(d.get("XPos")), _f(d.get("YPos")), None,
                        str(env.get("collected_at", ""))[:10], f"HIRA {d.get('clCdNm')}", {"sido": d.get("sidoCdNm"), "sggu": d.get("sgguCdNm")}))
    return out


def _ym(v) -> str | None:
    """기준월 '202606' → '2026-06'(원천 표기가 날짜가 아니라 월이다)."""
    t = str(v or "")
    return f"{t[:4]}-{t[4:6]}" if re.fullmatch(r"\d{6}", t) else None


def rows_sbiz() -> list[dict]:
    out = []
    for f in sorted((config.RAW_DIR / "sbiz").glob("sangga_*_*.json")):
        env = json.loads(f.read_text(encoding="utf-8"))
        for d in env["items"]:
            if d.get("indsSclsCd") == "Q10101":
                out.append(_row("sbiz", d["bizesId"], "general_hospital", "종합병원", None, d.get("bizesNm"), d.get("rdnmAdr") or d.get("lnoAdr"), _f(d.get("lon")), _f(d.get("lat")), None,
                                _ym(env.get("stdrYm")) or str(env.get("collected_at", ""))[:10], "소상공인 종합병원(Q10101)"))
    return out


# ── 군집(같은 시설) ──────────────────────────────────────────────────────────────────────────

def _lv(v) -> str:
    return "-" if v is None or (isinstance(v, float) and np.isnan(v)) else str(v)


def flag_dup_suspects(fac: pd.DataFrame) -> pd.DataFrame:
    """이름은 다르지만 같은 종류·같은 수준이 NEAR_DIFFNAME_M 안에 있고 원천이 완전히 다른 시설 — 같은 시설의 다른 표기(예: 법인명 등재)일 수 있어 묶지 않고 표시만 한다."""
    fac = fac.copy()
    fac["dup_suspect"] = False
    c = fac[fac["coord_ok"]]
    for (ft, lv), g in c.groupby(["facility_type", c["facility_level"].map(_lv)]):
        idx = g.index.to_numpy()
        x, y = g["x_5179"].to_numpy(), g["y_5179"].to_numpy()
        srcs = [set(json.loads(v)) for v in g["sources"]]
        for a in range(len(idx)):
            for b in range(a + 1, len(idx)):
                if np.hypot(x[a] - x[b], y[a] - y[b]) <= NEAR_DIFFNAME_M and not names_agree(g["name_norm"].iloc[a], g["name_norm"].iloc[b]) and not (srcs[a] & srcs[b]):
                    fac.loc[[idx[a], idx[b]], "dup_suspect"] = True
    return fac


def cluster(rows: pd.DataFrame) -> pd.DataFrame:
    """같은 시설의 원천 행을 묶는다 — 종류·수준이 같고, 이름이 일치/포함이고, DUP_MAX_M 이내. 좌표 없는 행은 이름이 정확히 같은 군집에만 붙는다. 결정적 순서."""
    rows = rows.sort_values(["facility_type", "source", "source_id"]).reset_index(drop=True)
    parent = list(range(len(rows)))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for (ft, lv), g in rows[rows["coord_ok"]].groupby(["facility_type", rows["facility_level"].map(_lv)]):
        idx = g.index.to_numpy()
        x, y, names = g["x_5179"].to_numpy(), g["y_5179"].to_numpy(), g["name_norm"].tolist()
        for a in range(len(idx)):
            for b in range(a + 1, len(idx)):
                if np.hypot(x[a] - x[b], y[a] - y[b]) <= DUP_MAX_M and names_agree(names[a], names[b]):
                    parent[find(idx[b])] = find(idx[a])
    root = pd.Series([find(i) for i in range(len(rows))], index=rows.index)
    # 좌표 없는 행: 같은 종류·수준에서 이름이 정확히 같은 좌표 있는 군집이 하나뿐이면 붙인다
    lv_all = rows["facility_level"].map(_lv)
    for i in rows.index[~rows["coord_ok"]]:
        cand = rows[(rows["coord_ok"]) & (rows["facility_type"] == rows.at[i, "facility_type"]) & (lv_all == lv_all[i]) & (rows["name_norm"] == rows.at[i, "name_norm"])]
        roots = set(root[cand.index])
        if len(roots) == 1:
            root[i] = roots.pop()
            rows.at[i, "attach_basis"] = "name_exact_no_coord"
    rows["cluster_root"] = root
    ids = rows.groupby("cluster_root").apply(lambda g: f"{g['facility_type'].iloc[0]}:{g.sort_values(['source_priority', 'source_id']).iloc[0]['source']}:{g.sort_values(['source_priority', 'source_id']).iloc[0]['source_id']}",
                                             include_groups=False)
    rows["facility_id"] = rows["cluster_root"].map(ids)
    return rows.drop(columns="cluster_root")


def consolidate(rows: pd.DataFrame) -> pd.DataFrame:
    """군집 → 물리적 시설 한 행. 대표 이름·좌표는 우선순위가 높은 원천(공식 우선), 상태는 공식 인허가가 있을 때만."""
    out = []
    for fid, g in rows.groupby("facility_id", sort=True):
        g = g.sort_values(["source_priority", "source_id"])
        withc = g[g["coord_ok"]]
        head = (withc if len(withc) else g).iloc[0]
        nm = g.iloc[0]["name"]
        pts = withc[["x_5179", "y_5179"]].to_numpy()
        spread = float(max((np.hypot(*(pts[i] - pts[j])) for i in range(len(pts)) for j in range(i + 1, len(pts))), default=0.0))
        loc = g[g["source"].isin(LICENSE_STATUS_SOURCES)]
        status = "unknown"
        if len(loc):
            sg = set(loc["status_group"])
            status = "open" if "open" in sg else next((x for x in ("suspended", "closed", "cancelled") if x in sg), "unknown")
        out.append({"facility_id": fid, "facility_type": g.iloc[0]["facility_type"], "subtype": next((x for x in g.loc[g["source"] == "hira", "subtype"]), g.iloc[0]["subtype"]), "facility_level": g.iloc[0]["facility_level"], "name": nm, "name_norm": norm_name(nm),
                    "address": next((a for a in g["address"] if a), None), "lon": head["lon"] if head["coord_ok"] else np.nan, "lat": head["lat"] if head["coord_ok"] else np.nan,
                    "coord_ok": bool(head["coord_ok"]), "coord_source": head["source"] if head["coord_ok"] else None, "coord_spread_m": round(spread, 1),
                    "status": status, "sources": json.dumps(sorted(set(g["source"]), key=lambda s: SOURCE_PRIORITY[s])), "n_source_rows": int(len(g)),
                    "official_listed": bool(set(g["source"]) & OFFICIAL), "coord_official": bool(head["coord_ok"] and head["source"] in OFFICIAL),
                    "source_ids": json.dumps([f"{s}:{i}" for s, i in zip(g["source"], g["source_id"])], ensure_ascii=False)})
    return pd.DataFrame(out)


def pair_suspects(rows: pd.DataFrame) -> dict:
    """좌표 불일치 의심(이름은 같은데 DUP_MAX_M 보다 멀고 MISMATCH_MAX_M 안) · 중복 의심(이름이 달라도 NEAR_DIFFNAME_M 이내)."""
    mismatch, near = [], []
    c = rows[rows["coord_ok"]]
    for (ft, lv), g in c.groupby(["facility_type", c["facility_level"].map(_lv)]):
        g = g.reset_index(drop=True)
        x, y, names, srcs, ids = g["x_5179"].to_numpy(), g["y_5179"].to_numpy(), g["name_norm"].tolist(), g["source"].tolist(), g["facility_id"].tolist()
        for a in range(len(g)):
            for b in range(a + 1, len(g)):
                d = float(np.hypot(x[a] - x[b], y[a] - y[b]))
                if ids[a] == ids[b]:
                    continue
                if names_agree(names[a], names[b]) and DUP_MAX_M < d <= MISMATCH_MAX_M and srcs[a] != srcs[b]:
                    mismatch.append({"type": ft, "name_a": g.at[a, "name"], "src_a": srcs[a], "name_b": g.at[b, "name"], "src_b": srcs[b], "dist_m": round(d)})
                elif d <= NEAR_DIFFNAME_M and not names_agree(names[a], names[b]):
                    near.append({"type": ft, "name_a": g.at[a, "name"], "src_a": srcs[a], "name_b": g.at[b, "name"], "src_b": srcs[b], "dist_m": round(d)})
    return {"coord_mismatch_suspects": mismatch, "near_different_name": near}


# ── 서울시 시설 수와 비교 ────────────────────────────────────────────────────────────────────

SEOUL_COUNT_COL = {"general_hospital": "fac_general_hospital", "university": "fac_university", "department_store": "fac_department_store", "hypermarket": "fac_supermarket"}


def compare_with_seoul_counts(fac: pd.DataFrame) -> pd.DataFrame:
    """행정동별: 개별 시설 좌표로 센 수 vs 서울시 상권분석서비스 시설 수. 집계 기준이 달라 같을 필요가 없다 — 차이만 기록한다."""
    import shapely
    from shapely.geometry import shape
    from shapely.ops import transform as shp_transform
    import pyproj
    hin = pd.read_parquet(config.PROCESSED_DIR / "dong_hinterland.parquet").set_index("adongCd")
    gj = json.loads((config.PROCESSED_DIR / "regions.geojson").read_text(encoding="utf-8"))
    cw = pd.read_parquet(config.PROCESSED_DIR / "dong_crosswalk.parquet").set_index("region_id")["adongCd"]
    to_m = pyproj.Transformer.from_crs(config.CRS_WGS84, config.CRS_METRIC, always_xy=True).transform
    polys = {cw[f["properties"]["region_id"]]: shp_transform(to_m, shape(f["geometry"])) for f in gj["features"] if f["properties"]["region_id"] in cw.index}
    use = fac[fac["coord_ok"] & ~fac["status"].isin(["closed", "cancelled", "suspended"])]
    rows = []
    for ftype, col in SEOUL_COUNT_COL.items():
        pts = use[use["facility_type"] == ftype]
        p = shapely.points(pts["x_5179"].to_numpy(), pts["y_5179"].to_numpy())
        for code, poly in polys.items():
            if code not in hin.index:
                continue
            rows.append({"facility_type": ftype, "adongCd": code, "ours": int(shapely.contains(poly, p).sum()), "seoul_count": hin.at[code, col]})
    return pd.DataFrame(rows)


# ── 출처·이용 조건(시설마다 유지) ─────────────────────────────────────────────────────────────

PILOT_GU = (11470, 11560)
# 원천별 이용 조건 — 2026-10-17 공식 문서 확인 결과. status: confirmed(공개 라이선스 확인) / unconfirmed(미확인). 확인되지 않은 자료는 서비스용 확정 DB·공개 API 에 쓰지 않는다.
PERMISSION = {
    "localdata": {"status": "confirmed", "basis": "공공누리 제1유형(출처표시·상업적 이용·변경 가능) — 서울 열린데이터광장 인허가 데이터군(대규모점포·의료법인·의료기기판매업)에서 확인. 병원 데이터셋 페이지 자체는 개별 확인하지 못함",
                  "attribution": "서울특별시(서울 열린데이터광장) 병원 인허가 정보 · 공공누리 제1유형"},
    "sbiz": {"status": "confirmed", "basis": "공공데이터포털 15012005 이용허락범위 '제한 없음'(출처표시 의무는 명시되지 않음)", "attribution": "소상공인시장진흥공단 상가(상권)정보(공공데이터포털)"},
    "seoul_cultural": {"status": "confirmed", "basis": "서울 열린데이터광장 OA-15487 공공누리 제1유형(출처표시·상업적 이용·변경 가능), 문화본부 문화정책과", "attribution": "서울특별시 문화본부 문화정책과 '서울시 문화공간 정보' · 공공누리 제1유형"},
    "seoul_college": {"status": "unconfirmed", "basis": "대학교 기본정보 데이터셋의 이용허락범위를 문서에서 확인하지 못함(좌표도 없음)", "attribution": None},
    "mois_retail": {"status": "confirmed", "basis": "공공데이터포털 15154948 이용허락범위 '제한 없음'(2026-10-17 확인, 출처표시 의무는 명시되지 않음 — 출처는 표기). 서비스키 승인 확인(호출 성공)", "attribution": "행정안전부 생활 대규모점포 조회서비스(공공데이터포털)"},
    "hira": {"status": "confirmed", "basis": "공공데이터포털 15001698 이용허락범위 '공공저작물 출처표시(제1유형)'(2026-10-17 확인) — 출처 표시 필수", "attribution": "건강보험심사평가원 병원정보서비스(공공데이터포털) · 공공저작물 출처표시 제1유형"},
    "mois_movie": {"status": "confirmed", "basis": "공공데이터포털 15154848 이용허락범위 '제한 없음'(2026-10-17 확인, 출처표시 의무는 명시되지 않음 — 출처는 표기). 서비스키 승인 확인(호출 성공)", "attribution": "행정안전부 영화상영관 조회서비스(공공데이터포털)"},
    "kakao": {"status": "unconfirmed", "basis": "장기 저장·가공·공개 표시·재배포가 허용된다는 공식 근거를 확인하지 못함. 오히려 제한 근거가 있음 — 카카오 운영정책 제5조 제20호(캐시는 사용자 환경 개선 목적 외 금지)·제30호(사전 승낙 없는 복사·복제 금지), "
                         "플랫폼 서비스 약관 제11조 제3항, 카카오 개발자 포럼 공식 계정 답변(2026-08-26: 저장 데이터 삭제·실시간 호출만 허용·별도 제휴 불검토)", "attribution": None},
}
SOURCE_NAME = {"hira": "건강보험심사평가원 병원정보서비스", "mois_movie": "행정안전부 영화상영관 조회서비스", "mois_retail": "행정안전부 생활 대규모점포 조회서비스", "localdata": "서울시 LOCALDATA 병원 인허가(영등포·양천)", "sbiz": "소상공인시장진흥공단 상가(상권)정보", "seoul_cultural": "서울시 문화공간 정보(culturalSpaceInfo)",
               "seoul_college": "서울시 대학교 기본정보(SebcCollegeInfoKor)", "kakao": "카카오 로컬 API(보조)"}
QUERY_TYPES = {"MT1": ["hypermarket"], "CT1": ["cinema", "cultural_facility"], "SC4": ["university"], "종합병원": ["general_hospital"], "백화점": ["department_store"],
               "복합쇼핑몰": ["shopping_mall"], "아울렛": ["outlet"]}
OFFICIAL_COVERAGE = {"general_hospital": "national", "cinema": "national", "cultural_facility": "seoul_wide", "department_store": "national", "shopping_mall": "national", "hypermarket": "national"}   # 공식 원천이 있는 종류와 그 범위(나머지 종류는 공식 원천 없음)


def add_provenance(fac: pd.DataFrame, rows: pd.DataFrame, capped: list[dict]) -> pd.DataFrame:
    """시설마다 출처·기준일·좌표 출처·수집 범위·이용 권한을 붙인다. source_type 은 대표 좌표의 출처가 공식이면 official, 아니면 supplementary."""
    fac = fac.copy()
    head_date = rows[rows["coord_ok"]].sort_values(["source_priority", "source_id"]).groupby("facility_id")["source_date"].first()
    any_date = rows.sort_values(["source_priority", "source_id"]).groupby("facility_id")["source_date"].first()
    fac["reference_date"] = fac["facility_id"].map(head_date).fillna(fac["facility_id"].map(any_date))
    fac["coordinate_source"] = fac["coord_source"]
    fac["source_name"] = fac["coord_source"].map(SOURCE_NAME)
    fac["source_type"] = np.where(fac["coord_official"], "official", "supplementary")
    fac["usage_permission_status"] = fac["coord_source"].map(lambda s: PERMISSION[s]["status"] if s in PERMISSION else "unconfirmed")
    fac["usage_permission_basis"] = fac["coord_source"].map(lambda s: PERMISSION[s]["basis"] if s in PERMISSION else "좌표가 없어 이용 권한을 따질 수 없음")
    fac["attribution"] = fac["coord_source"].map(lambda s: PERMISSION[s]["attribution"] if s in PERMISSION else None)
    # 수집 범위: 카카오 검색 한도에 닿은 구역 안이거나, 공식 원천이 양천·영등포 구뿐인 종류의 구역 밖 시설
    fac["coverage_status"] = "ok"
    for z in capped:
        x1, y1, x2, y2 = z["rect"]
        types = QUERY_TYPES.get(z["query"], [])
        hit = fac["facility_type"].isin(types) & fac["coord_ok"] & fac["lon"].between(x1, x2) & fac["lat"].between(y1, y2)
        fac.loc[hit, "coverage_status"] = "incomplete_zone"
    outside = fac["facility_type"].map(OFFICIAL_COVERAGE).eq("pilot_gus_only") & ~fac["gu_code"].isin(PILOT_GU) & (fac["coverage_status"] == "ok")
    fac.loc[outside, "coverage_status"] = "outside_official_coverage"
    # 대학: 캠퍼스만 독립 시설, 단과대학 건물은 소속 캠퍼스에 연결(이름 포함·2km 이내, 못 찾으면 연결 없음 — 자동 병합하지 않는다)
    fac["counts_as_independent"] = fac["facility_level"].map(_lv) != "college_unit"
    fac["parent_facility_id"] = None
    camp = fac[(fac["facility_type"] == "university") & fac["counts_as_independent"] & fac["coord_ok"]]
    for i in fac.index[(fac["facility_type"] == "university") & ~fac["counts_as_independent"] & fac["coord_ok"]]:
        cand = camp[[(n in fac.at[i, "name_norm"]) and len(n) >= 4 for n in camp["name_norm"]]]
        if len(cand):
            d = np.hypot(cand["x_5179"] - fac.at[i, "x_5179"], cand["y_5179"] - fac.at[i, "y_5179"])
            if d.min() <= 2000:
                fac.at[i, "parent_facility_id"] = cand.loc[d.idxmin(), "facility_id"]
    # 종합병원: 상가정보(sbiz)에만 있는 등재가 가까운(100m 이내) 인허가·심평원 병원과 이름 일부가 겹치면(법인명·약칭) 독립 시설로 세지 않고 그 병원에 연결만 한다 — 합치지는 않는다
    srcs = fac["sources"].map(lambda v: set(json.loads(v))) if "sources" in fac.columns else pd.Series([set()] * len(fac), index=fac.index)
    lic = fac[(fac["facility_type"] == "general_hospital") & fac["coord_ok"] & srcs.map(lambda x: bool(x & {"hira", "localdata"}))]
    for i in fac.index[(fac["facility_type"] == "general_hospital") & fac["coord_ok"] & srcs.map(lambda x: x == {"sbiz"})]:
        d = np.hypot(lic["x_5179"] - fac.at[i, "x_5179"], lic["y_5179"] - fac.at[i, "y_5179"])
        near = d[d <= HOSPITAL_VARIANT_M]
        for j in near.sort_values().index:                      # 가까운 순 — 이름 일부가 겹치는 첫 병원에 연결
            a, b = fac.at[i, "name_norm"], lic.at[j, "name_norm"]
            m = SequenceMatcher(None, a, b).find_longest_match(0, len(a), 0, len(b))
            shared = a[m.a:m.a + m.size]
            if len(shared) >= 5 or len(meaningful_shared(shared)) >= 4:      # 100m 안의 면허 병원과 5글자 넘게 겹치면 같은 병원의 다른 표기
                fac.at[i, "counts_as_independent"] = False
                fac.at[i, "parent_facility_id"] = lic.at[j, "facility_id"]
                break
    # 서비스(분석) 대상: 공식 + 이용 권한 확인 + 좌표 + 폐업 아님 + 독립 시설
    fac["analysis_eligible"] = fac["coord_ok"] & fac["usable"] & (fac["source_type"] == "official") & (fac["usage_permission_status"] == "confirmed") & fac["counts_as_independent"]
    return fac


GENERIC_NAME_TEXT = ("영등포", "양천", "구로", "문래", "목동", "신정", "여의도", "서울", "병원", "의원", "박물관", "미술관", "도서관", "문화", "아트홀", "센터", "구립", "시립", "홀", "점")


def meaningful_shared(shared: str) -> str:
    """겹친 이름 글자에서 지역명·일반 명사(병원·박물관 등)를 지우고 남는 글자 — 길이가 짧으면 같은 시설이라는 근거가 못 된다."""
    t = shared
    for g in GENERIC_NAME_TEXT:
        t = t.replace(g, "")
    return t


def dup_review_pairs(fac: pd.DataFrame) -> pd.DataFrame:
    """중복 의심 시설 쌍의 점검 근거(같은 주소인가·이름이 겹치는가·거리). 근거와 무관하게 자동으로 합치지 않는다 — review_status 는 사람이 보는 참고 분류다."""
    c = fac[fac["dup_suspect"] & fac["coord_ok"]].reset_index(drop=True)
    out = []
    for (ft, lv), g in c.groupby(["facility_type", c["facility_level"].map(_lv)]):
        g = g.reset_index(drop=True)
        for a in range(len(g)):
            for b_ in range(a + 1, len(g)):
                d = float(np.hypot(g.at[a, "x_5179"] - g.at[b_, "x_5179"], g.at[a, "y_5179"] - g.at[b_, "y_5179"]))
                if d > NEAR_DIFFNAME_M or names_agree(g.at[a, "name_norm"], g.at[b_, "name_norm"]):
                    continue
                m = SequenceMatcher(None, g.at[a, "name_norm"], g.at[b_, "name_norm"]).find_longest_match(0, len(g.at[a, "name_norm"]), 0, len(g.at[b_, "name_norm"]))
                shared = g.at[a, "name_norm"][m.a:m.a + m.size]
                addr = lambda v: re.sub(r"[\s,()]+", "", str(v or "")).split("(")[0]   # noqa: E731
                same_addr = bool(g.at[a, "address"]) and bool(g.at[b_, "address"]) and addr(g.at[a, "address"])[:25] == addr(g.at[b_, "address"])[:25]
                sa, sb = set(json.loads(g.at[a, "sources"])), set(json.loads(g.at[b_, "sources"]))
                strong = len(meaningful_shared(shared)) >= 4
                status = "merge_candidate" if strong and (same_addr or d <= 15) else ("same_building_distinct_names" if same_addr or d <= 10 else "needs_review")
                out.append({"facility_type": ft, "facility_id_a": g.at[a, "facility_id"], "name_a": g.at[a, "name"], "sources_a": "+".join(sorted(sa)), "facility_id_b": g.at[b_, "facility_id"],
                            "name_b": g.at[b_, "name"], "sources_b": "+".join(sorted(sb)), "distance_m": round(d, 1), "same_address": same_addr, "shared_name_text": shared if len(shared) >= 2 else "", "meaningful_shared_text": meaningful_shared(shared),
                            "review_status": status, "merged": False})
    return pd.DataFrame(out, columns=["facility_type", "facility_id_a", "name_a", "sources_a", "facility_id_b", "name_b", "sources_b", "distance_m", "same_address", "shared_name_text", "meaningful_shared_text", "review_status", "merged"])


STALE_YEARS = 5                  # 인허가 기록이 이 햇수 넘게 갱신되지 않았으면 '현존 여부 미확인'으로 본다(좌표가 없으면 개수 판단에서 뺀다)


def stale_before(collected_at: str) -> str:
    """수집일 기준 STALE_YEARS 년 전 날짜(YYYY-MM-DD) — 이보다 이른 기준일의 기록은 오래된 것."""
    y, m, d = (int(v) for v in str(collected_at)[:10].split("-"))
    return f"{y - STALE_YEARS:04d}-{m:02d}-{d:02d}"


def unlocated_official(fac: pd.DataFrame, stale_cut: str) -> tuple[dict, dict]:
    """공식 목록에는 있으나 좌표가 없어 반경 분석에서 빠지는 영업(또는 상태 불명) 시설을 종류·위치(파일럿/인접)별로 센다.
    기준일이 stale_cut 보다 이른 좌표 없는 기록은 현존 여부를 알 수 없어(갱신 없는 인허가 기록) 'stale' 로 따로 두고 개수 판단(불완전 여부)에 쓰지 않는다. 좌표가 있는 공식 시설과 합쳐 좌표 보유율을 구한다."""
    live = ~fac["status"].isin(["closed", "cancelled", "suspended"])
    unloc, cover = {}, {}
    old = fac["reference_date"].map(lambda v: isinstance(v, str) and v < stale_cut)
    for t in TYPES:
        f = fac[(fac["facility_type"] == t) & fac["official_listed"] & live]
        no_all = f[~f["coord_ok"]]
        no = no_all[~old.reindex(no_all.index)]
        stale = no_all[old.reindex(no_all.index)]
        unloc[t] = {a: {"count": int((no["address_area"] == a).sum()), "names": sorted(no.loc[no["address_area"] == a, "name"].tolist())[:20],
                        "by_gu": {g: int(no.loc[no["address_area"] == a, "address"].map(lambda v: g in str(v or "")).sum()) for g in (PILOT_ADDR if a == "pilot" else NEIGHBOR_ADDR) if no.loc[no["address_area"] == a, "address"].map(lambda v: g in str(v or "")).any()}}
                    for a in ("pilot", "neighbor")}
        unloc[t]["stale"] = {a: {"count": int((stale["address_area"] == a).sum()), "names": sorted(stale.loc[stale["address_area"] == a, "name"].tolist())[:20],
                                 "by_gu": {g: int(stale.loc[stale["address_area"] == a, "address"].map(lambda v: g in str(v or "")).sum()) for g in PILOT_ADDR if stale.loc[stale["address_area"] == a, "address"].map(lambda v: g in str(v or "")).any()}}
                             for a in ("pilot", "neighbor")}
        located = int((f["coord_ok"] & f["gu_code"].isin(PILOT_GU)).sum())
        miss = int((no["address_area"] == "pilot").sum())
        miss_stale = int((stale["address_area"] == "pilot").sum())
        cover[t] = {"pilot_located": located, "pilot_unlocated": miss, "pilot_unlocated_stale": miss_stale, "pilot_coord_rate": None if located + miss == 0 else round(located / (located + miss), 3),
                    "pilot_coord_rate_incl_stale": None if located + miss + miss_stale == 0 else round(located / (located + miss + miss_stale), 3)}
    return unloc, cover


def kakao_only_review(fac: pd.DataFrame, radius_m: float = 150.0) -> pd.DataFrame:
    """공식 목록에 없고 카카오에만 있는 시설(사용 가능·구역 안)이 공식 시설 가까이에 있는지 — 공식 대규모점포·복합몰 안의 입점 매장이라 따로 등록되지 않았을 가능성의 근거(분석에는 쓰지 않는다)."""
    use = fac[fac["coord_ok"] & fac["usable"] & fac["in_scope"]]
    off = use[use["official_listed"]]
    out = []
    for _, k in use[~use["official_listed"]].iterrows():
        d = np.hypot(off["x_5179"] - k["x_5179"], off["y_5179"] - k["y_5179"])
        j = d.idxmin() if len(d) else None
        near = None if j is None or d[j] > radius_m else off.loc[j]
        out.append({"facility_type": k["facility_type"], "name": k["name"], "nearest_official": None if near is None else near["name"], "nearest_official_type": None if near is None else near["facility_type"],
                    "distance_m": None if near is None else round(float(d[j]), 1), "reading": (None if near is None else "같은 종류의 공식 시설이 가까이 있음 — 같은 시설의 다른 표기일 가능성" if near["facility_type"] == k["facility_type"] else "다른 종류의 공식 시설 가까이 있음 — 그 안의 입점 매장일 수 있음(공식 목록에 따로 없음)") if near is not None else "공식 목록에서 찾지 못함(공식 목록 누락 또는 등록 구분 차이)"})
    return pd.DataFrame(out, columns=["facility_type", "name", "nearest_official", "nearest_official_type", "distance_m", "reading"])


def source_diagnostic(fac: pd.DataFrame, stores: pd.DataFrame, radii=(250, 500, 1000)) -> pd.DataFrame:
    """권한 미확인(카카오 보조) 시설을 뺐을 때 반경 분석이 얼마나 달라지는지 — 파일럿 매장 전체에서 종류·반경별로 비교한다.
    공식 원천이 없는 종류는 '공식만'의 0 이 아니라 '해당 자료 없음'이라서 count 가 아니라 official_available=False 로 보고한다."""
    import pyproj
    to_m = pyproj.Transformer.from_crs(config.CRS_WGS84, config.CRS_METRIC, always_xy=True).transform
    sx, sy = to_m(stores["lon"].to_numpy(), stores["lat"].to_numpy())
    base = fac[fac["coord_ok"] & fac["usable"] & fac["counts_as_independent"] & fac["in_scope"]]
    rows = []
    for t in TYPES:
        ft = base[base["facility_type"] == t]
        off = ft[ft["analysis_eligible"]]
        for r in radii:
            def stats(df):
                if len(df) == 0:
                    return np.zeros(len(sx), dtype=int), np.full(len(sx), np.nan)
                d = np.hypot(sx[:, None] - df["x_5179"].to_numpy()[None, :], sy[:, None] - df["y_5179"].to_numpy()[None, :])
                return (d <= r).sum(axis=1), d.min(axis=1)
            ca, na = stats(ft)
            co, no = stats(off)
            both = ~np.isnan(na) & ~np.isnan(no)
            rows.append({"facility_type": t, "label": TYPE_LABEL[t], "radius_m": r, "facilities_all": len(ft), "facilities_official_eligible": len(off), "official_available": bool(len(off) > 0),
                         "stores": len(sx), "stores_with_any_all": int((ca > 0).sum()), "stores_with_any_official": int((co > 0).sum()), "mean_count_all": round(float(ca.mean()), 3),
                         "mean_count_official": round(float(co.mean()), 3), "stores_count_differs": int((ca != co).sum()), "share_stores_count_differs": round(float((ca != co).mean()), 4),
                         "median_nearest_m_all": None if np.isnan(na).all() else round(float(np.nanmedian(na)), 1), "median_nearest_m_official": None if np.isnan(no).all() else round(float(np.nanmedian(no)), 1),
                         "median_nearest_diff_m": round(float(np.median(no[both] - na[both])), 1) if both.any() else None,
                         "interpretation": ("공식 원천 없음 — 공식만 쓰면 이 종류는 분석할 수 없음(0곳이 아니라 자료 없음)" if len(off) == 0 else
                                            ("공식 자료만으로도 같은 결과" if (ca == co).all() else "카카오 보조 시설을 빼면 결과가 달라짐(공식 목록은 일부 시설만 담음)"))})
    return pd.DataFrame(rows)


SURVEY = [
    # (종류, 후보 공식 제공처·데이터, 제공 방식, 범위, 좌표, 기준일·갱신, 이용 조건, 이번 상태)
    ("종합병원·상급종합병원", "건강보험심사평가원 병원정보서비스(B551182/hospInfoServicev2/getHospBasisList)", "API", "전국", "XPos·YPos(WGS84) — 문서상", "수시", "공공누리/제한 없음(공공데이터포털)", "사용 — 승인됨(2026-10-17 호출 성공). 전국 상급종합 47·종합병원 338, 상급종합 구분은 이 자료에만 있음. 영업상태 없음, 출처표시(공공저작물 제1유형) 필수"),
    ("종합병원", "국립중앙의료원 전국 병·의원 찾기(B552657/HsptlAsembySearchService)", "API", "전국", "위·경도", "수시", "제한 없음(공공데이터포털)", "미사용 — 서비스키 미승인(호출 확인 이전 기록, 건강보험심사평가원 자료로 대체)"),
    ("종합병원", "서울시 LOCALDATA 병원 인허가(010101)", "API(승인됨)", "서울 구별(양천·영등포 수집)", "TM(EPSG:5174) X·Y", "상시(구별 갱신일 상이)", "서울 열린데이터광장 이용약관", "사용 — 영업/폐업 상태 있음, 상급종합 구분 없음"),
    ("종합병원", "소상공인 상가업소(Q10101 종합병원)", "API(승인됨)", "시군구 단위 수집(양천·영등포)", "WGS84 lon·lat", "분기", "이용허락범위 제한 없음", "사용 — 등재 목록(영업상태 없음)"),
    ("대학교", "한국교육개발원·대학알리미 대학 기본정보 / 교육부 대학 현황", "파일·API", "전국", "주소만(좌표 없음) 또는 파일 미확인", "연 1회", "공공누리/제한 없음", "미사용 — 승인된 전국 API 없음, 좌표 자료를 찾지 못함"),
    ("대학교", "서울 열린데이터광장 SebcCollegeInfoKor(서울시 대학교 기본정보)", "API(승인됨)", "서울 64건", "주소만(좌표 없음)", "자료 연도 2013 등으로 오래됨", "서울 열린데이터광장 이용약관", "사용 — 목록 대조용(좌표 없음 → 누락으로 기록)"),
    ("백화점·쇼핑몰·대형마트", "행정안전부 생활 대규모점포 조회서비스(data.go.kr 15154948, apis.data.go.kr/1741000/large_scale_retail_stores/info)", "API(승인됨 — 2026-10-17 사용자 제공 엔드포인트로 호출 성공)", "전국 4,190건(일간 갱신)", "TM(EPSG:5174) CRD_INFO_X·Y — 679건은 좌표 없음", "일간(최종 수정 2026-10-14)", "이용허락범위 제한 없음(공공데이터포털)", "사용 — 전국 원본 별도 보관, 준대규모점포(SSM) 제외, 영업·폐업 상태 반영"),
    ("아울렛", "(공식 구분 없음 — 대규모점포 등록 구분에 '아울렛'이 없음)", "-", "-", "-", "-", "-", "공식 원천 없음 — 카카오 보조만"),
    ("영화관", "행정안전부 문화_영화상영관 조회서비스(15154848) / 영화진흥위원회 KOBIS", "API", "전국", "TM(EPSG:5174) — 문서상", "일간", "이용허락범위 제한 없음(공공데이터포털)", "사용 — 승인됨(apis.data.go.kr/1741000/movie_theaters/info, 전국 5,244 상영관). 상영관 단위라 영화관 단위로 묶음, 좌표 없는 상영관 315건은 분석에서 제외"),
    ("문화시설", "서울 열린데이터광장 culturalSpaceInfo(서울시 문화공간 정보)", "API(승인됨)", "서울 1,096건", "좌표 있음(X_COORD=위도·Y_COORD=경도로 뒤바뀜)", "상시", "서울 열린데이터광장 이용약관", "사용 — 공연장·미술관·박물관·도서관·문화원 등"),
    ("백화점·쇼핑몰·아울렛·대형마트·영화관·대학교·종합병원·문화시설", "카카오 로컬 API(category MT1/CT1/SC4, keyword)", "API(승인됨, .env 카카오 키)", "전국(검색 구역 지정)", "WGS84", "상시", "카카오 API 이용약관 — 저장·재배포 조건 확인 필요(원본은 git 제외, 화면에는 지도 서비스 목적으로만)", "사용 — 공식 자료가 없는 종류의 보조 좌표 출처"),
    ("공공기관·대규모 업무시설", "행정안전부 공공기관 청사 정보 등", "미확인", "-", "-", "-", "-", "이번 범위에서 제외 — 시설 이용 규모를 알 수 없고 승인된 공식 자료도 확인하지 못함"),
]


# ── 조립 ────────────────────────────────────────────────────────────────────────────────────

def build() -> dict:
    proc = config.PROCESSED_DIR
    k_env = _env("kakao_facilities")
    k_rows, k_dropped = rows_kakao(k_env)
    c_env = _env("seoul_cultural")
    c_rows, c_info = rows_cultural(c_env)
    col_rows = rows_college(_env("seoul_college"))
    l_rows, s_rows = rows_localdata(), rows_sbiz()
    r_env = _env("mois_retail")
    m_rows, retail_info = rows_retail(r_env)
    mv_rows, movie_info = rows_movie(_env("mois_movie"))
    h_rows = rows_hira(_env("hira_hospitals"))
    raw_rows = pd.DataFrame([*l_rows, *h_rows, *m_rows, *mv_rows, *s_rows, *c_rows, *col_rows, *k_rows])
    raw_rows["source_priority"] = raw_rows["source"].map(SOURCE_PRIORITY)
    raw_rows["facility_level"] = raw_rows["facility_level"].astype(object)
    raw_rows["coord_ok"] = raw_rows["lon"].between(124, 132) & raw_rows["lat"].between(33, 39)
    raw_rows.loc[~raw_rows["coord_ok"], ["lon", "lat"]] = np.nan
    n_in = len(raw_rows)
    geo = bus.add_geography(raw_rows.reset_index(drop=True))
    geo["attach_basis"] = None
    # 파일럿 구역 + 버퍼 밖의 좌표 있는 행은 이 표에 넣지 않는다(좌표 없는 행은 소속을 알 수 없어 남긴다)
    in_scope = geo["coord_ok"] & (geo["dist_to_pilot_m"] <= BUFFER_M)
    keep = in_scope | ~geo["coord_ok"]
    outside = int((geo["coord_ok"] & ~in_scope).sum())
    rows = geo[keep].reset_index(drop=True)
    # 좌표 없는 행 중 서울 밖·파일럿 인접 구 밖 주소는 소속을 알 수 없다 — 서울시 대학 목록만 구 이름으로 파일럿 구 여부를 본다
    nc = ~rows["coord_ok"]
    if "gu_name" in rows:
        pilot_gu = {"양천구", "영등포구"}
        drop = nc & rows["gu_name"].notna() & ~rows["gu_name"].isin(pilot_gu)
        outside += int(drop.sum())
        rows = rows[~drop].reset_index(drop=True)
    # 좌표 없는 공식 행(행안부 대규모점포·영화상영관 등)은 주소가 파일럿 또는 맞닿은 구·시일 때만 남긴다 — 전국의 좌표 없는 행은 이 구역과 무관하다
    nc = ~rows["coord_ok"] & ~rows["source"].eq("seoul_college")
    far = nc & rows["address"].map(address_area).isna()
    outside += int(far.sum())
    unlocated_dropped = int(far.sum())
    rows = rows[~far].reset_index(drop=True)
    rows = cluster(rows)
    fac = consolidate(rows)
    fac = bus.add_geography(fac.assign(coord_ok=fac["coord_ok"]).reset_index(drop=True))
    fac = flag_dup_suspects(fac)
    fac["address_area"] = fac["address"].map(address_area)
    fac["display_name"] = [display_name(t, n, a) for t, n, a in zip(fac["facility_type"], fac["name"], fac["address"])]
    fac["in_scope"] = fac["coord_ok"] & (fac["dist_to_pilot_m"] <= BUFFER_M)
    fac["usable"] = fac["coord_ok"] & ~fac["status"].isin(["closed", "cancelled", "suspended"])
    capped_rects = k_env.get("capped_rects", [])
    fac = add_provenance(fac, rows, capped_rects)
    sus = pair_suspects(rows)
    recon = {}
    for t in TYPES:
        ft = fac[(fac["facility_type"] == t) & fac["in_scope"] & fac["usable"]]
        srcs = ft["sources"].map(lambda v: set(json.loads(v)))
        official = srcs.map(lambda x: bool(x & OFFICIAL))
        kakao = srcs.map(lambda x: "kakao" in x)
        recon[t] = {"usable": int(len(ft)), "official_listed": int(official.sum()), "official_and_kakao": int((official & kakao).sum()), "official_only": int((official & ~kakao).sum()), "kakao_only": int((~official).sum())}
    stale_cut = stale_before(str(r_env.get("collected_at"))[:10])
    unloc, cover = unlocated_official(fac, stale_cut)
    kreview = kakao_only_review(fac)
    review = dup_review_pairs(fac)
    stores = pd.read_parquet(proc / "stores.parquet")[["lon", "lat"]].dropna()
    diag = source_diagnostic(fac, stores)
    cmp = compare_with_seoul_counts(fac[fac["in_scope"]])

    # 저장
    fac_out = fac.sort_values("facility_id").reset_index(drop=True)
    rows_out = rows.sort_values(["facility_id", "source_priority", "source_id"]).reset_index(drop=True)
    fac_out.to_parquet(proc / "facilities.parquet", index=False)
    rows_out.to_parquet(proc / "facility_source_rows.parquet", index=False)

    # 보고
    rep = []
    for t in TYPES:
        f = fac_out[fac_out["facility_type"] == t]
        r_ = rows_out[rows_out["facility_type"] == t]
        use = f[f["usable"] & f["in_scope"]]
        n_sus = int((f["dup_suspect"] & f["in_scope"]).sum())
        by_src = r_.groupby("source").agg(rows=("source_id", "count"), coord=("coord_ok", "sum")).to_dict("index")
        dup_removed = len(r_) - len(f)
        rep.append((f"{TYPE_LABEL[t]} ({t})", f"시설 {len(f)} · 사용 가능(좌표 있음·폐업 아님·구역+1.1km 안) {len(use)} · 원천 행 {len(r_)} → 중복 정리 {dup_removed}건 · 중복 의심(다른 이름 30m 이내·다른 원천) {n_sus}",
                    "원천별 행/좌표: " + ", ".join(f"{s} {v['rows']}/{int(v['coord'])}" for s, v in by_src.items())
                    + f" · 좌표 없음 {int((~f['coord_ok']).sum())} · 공식 목록에도 있는 시설 {int(f['official_listed'].sum())} · 공식 좌표 {int(f['coord_official'].sum())}"))
    cmp_sum = {}
    for t, g in cmp.groupby("facility_type"):
        s = g.dropna(subset=["seoul_count"])
        cmp_sum[t] = {"dongs": int(len(s)), "ours_total": int(s["ours"].sum()), "seoul_total": int(s["seoul_count"].sum()),
                      "corr": None if len(s) < 3 or s["ours"].std() == 0 or s["seoul_count"].std() == 0 else round(float(np.corrcoef(s["ours"], s["seoul_count"])[0, 1]), 3),
                      "same_count_dongs": int((s["ours"] == s["seoul_count"]).sum())}
    rep.append(("서울시 시설 수와 비교(행정동 36곳)", json.dumps(cmp_sum, ensure_ascii=False), "집계 기준이 달라 같지 않다(서울시: 상권분석서비스 집객시설 수 / 여기: 개별 시설 좌표를 행정동 경계로 센 값, 대학은 캠퍼스·단과대학 건물 모두 센 값)"))
    rep.append(("카카오 분류에서 제외한 장소(상위)", json.dumps(dict(sorted(k_dropped.items(), key=lambda kv: -kv[1])[:8]), ensure_ascii=False), "패션·슈퍼마켓(SSM 포함)·주차장·초중고 등 — 우리 종류가 아니다"))
    rep.append(("좌표 불일치 의심 / 중복 의심", f"{len(sus['coord_mismatch_suspects'])} / {len(sus['near_different_name'])}", "이름이 같은데 다른 원천 좌표가 150m~1.5km 어긋남 / 이름은 다르지만 30m 이내(같은 건물의 다른 표기 가능)"))
    rep.append(("서울시 문화공간 좌표 순서", json.dumps(c_info), "X_COORD 가 위도·Y_COORD 가 경도로 뒤바뀌어 제공됨 — 범위로 확인해 바로잡음"))
    rep.append(("파일럿 밖 좌표 행(제외)", outside, f"파일럿 구역 + {BUFFER_M}m 밖이라 이 표에 넣지 않음"))
    capped = k_env.get("capped_rects", [])
    rep.append(("행안부 대규모점포(전국 전량)", json.dumps(retail_info, ensure_ascii=False), "준대규모점포(SSM)와 우리 종류가 아닌 등록 구분은 제외, 좌표 없음은 좌표를 만들지 않음"))
    rep.append(("행안부 영화상영관(상영관→영화관)", json.dumps(movie_info, ensure_ascii=False), "같은 좌표·같은 이름 앞부분의 상영관을 한 곳으로 묶음, 좌표 없는 상영관은 좌표를 만들지 않음"))
    rep.append(("공식 목록 vs 카카오(사용 가능 시설)", json.dumps(recon, ensure_ascii=False), "official_only=공식에만, kakao_only=카카오에만 있음(공식 목록에 없는 시설이거나 등록 구분이 다른 시설)"))
    rep.append(("서비스 분석 대상(공식·이용 권한 확인·좌표·폐업 아님·독립 시설, 구역+1.1km 안)", json.dumps({t: int(((fac_out["facility_type"] == t) & fac_out["analysis_eligible"] & fac_out["in_scope"]).sum()) for t in TYPES}, ensure_ascii=False),
                "나머지는 카카오 보조(이용 권한 미확인)라 서비스 분석에서 제외 — facility_source_diagnostic.csv 에서 차이를 본다"))
    rep.append(("카카오 검색 한도에 닿은 구역", json.dumps({q: sum(1 for c in capped if c["query"] == q) for q in sorted({c["query"] for c in capped})}, ensure_ascii=False),
                f"깊이 {k_env.get('max_depth')} 로 쪼개도 45건을 넘은 약 250m 구역 — 키워드 검색 잡음 때문이며 그 구역의 시설은 일부 빠졌을 수 있음"))
    pd.DataFrame(rep, columns=["항목", "값", "비고"]).to_csv(config.TABLES_DIR / "facility_report.csv", index=False, encoding="utf-8-sig")
    review.to_csv(config.TABLES_DIR / "facility_dup_review.csv", index=False, encoding="utf-8-sig")
    kreview.to_csv(config.TABLES_DIR / "facility_kakao_only_review.csv", index=False, encoding="utf-8-sig")
    diag.to_csv(config.TABLES_DIR / "facility_source_diagnostic.csv", index=False, encoding="utf-8-sig")
    pd.DataFrame(SURVEY, columns=["종류", "후보 공식 제공처·데이터", "제공 방식", "범위", "좌표", "기준일·갱신", "이용 조건", "이번 상태"]).to_csv(config.TABLES_DIR / "facility_source_survey.csv", index=False, encoding="utf-8-sig")
    meta = {"buffer_m": BUFFER_M, "dup_max_m": DUP_MAX_M, "extent": f"파일럿 두 구(양천·영등포) 경계 밖 {BUFFER_M / 1000:g}km 이내", "counts": {t: int(((fac_out["facility_type"] == t) & fac_out["in_scope"]).sum()) for t in TYPES},
            "sources": {s: {"label": SOURCE_LABEL[s], "official": s in OFFICIAL, "rows": int((rows_out["source"] == s).sum()), "coord": int(rows_out[rows_out["source"] == s]["coord_ok"].sum())} for s in SOURCE_PRIORITY},
            "collected_at": {"kakao": str(k_env.get("collected_at"))[:10], "seoul_cultural": str(c_env.get("collected_at"))[:10]}, "input_rows": n_in, "outside_scope_rows": outside,
            "compare_seoul_counts": cmp_sum, "suspects": {"coord_mismatch": sus["coord_mismatch_suspects"][:30], "near_different_name": sus["near_different_name"][:30]},
            "kakao_capped_rects": capped, "incomplete_zones": [{**z, "types": QUERY_TYPES.get(z["query"], [])} for z in capped],
            "permission": {k: {"status": v["status"], "basis": v["basis"], "attribution": v["attribution"]} for k, v in PERMISSION.items()},
            "analysis_eligible": {t: int(((fac_out["facility_type"] == t) & fac_out["analysis_eligible"] & fac_out["in_scope"]).sum()) for t in TYPES},
            "official_coverage": OFFICIAL_COVERAGE, "dup_review": review["review_status"].value_counts().to_dict(), "university_levels": fac_out[fac_out["facility_type"] == "university"]["facility_level"].value_counts().to_dict(),
            "stale_before": stale_cut, "stale_years": STALE_YEARS, "unlocated_official": unloc, "coord_coverage": cover, "unlocated_rows_dropped_outside_area": unlocated_dropped, "movie": movie_info, "retail": {**retail_info, "total_in_scope_rows": int((rows_out["source"] == "mois_retail").sum())}, "reconciliation": recon,
            "notes": {"attendance": "시설 이용객 수 자료는 없다 — 방문객·수요를 추정하지 않는다.", "official": "백화점·쇼핑몰·아울렛·대형마트·영화관·대학교는 승인된 공식 좌표 자료가 없어 카카오 보조 출처만 있다.",
                                                  "status": "폐업·취소는 공식 인허가(LOCALDATA 종합병원)만 반영한다. 나머지는 상태 unknown.", "tier": "상급종합병원 지정 정보는 공식 자료 미승인으로 구분하지 않는다."}}
    (proc / "facilities_meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
    for name, value, note in rep:
        print(f"  [{name}] {value}  {note}")
    return meta


def main() -> None:
    argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter).parse_args()
    build()


if __name__ == "__main__":
    main()
