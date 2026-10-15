"""전국 도시철도 역사 위치(공식 XLSX) + 운영기관별 승하차(서울·부산·인천) 통합 — 데이터 통합·정규화·검증만 한다.

입력
- data/raw/전체_도시철도역사정보_20260630.xlsx : 국가철도공단 표준데이터(역번호·역사명·노선·환승·위경도·운영기관·행별 데이터기준일자). 파일 이름의 날짜는 내려받은 날짜 성격이고 행마다 기준일이 다르다.
- data/raw/rail/{seoul_card_YYYYMM, seoul_daily_*, busan_*, incheon_*}_*.json, seoul_master·kakao_stations·kakao_exits (collect_rail_transit 수집분)
- data/processed/rail_entrances.parquet (기존 파일럿 출구 — 읽기만 한다)

출력(data/processed, 기존 rail_stations·rail_complexes·rail_entrances·rail_usage_monthly·rail_hs_usage·rail_meta.json 은 건드리지 않는다)
- rail_official_stations.parquet : 전국 공식 역사×노선 행(+ 역사 묶음 national_complex_id, 지역, 표준 노선·운영기관, 원천 행 번호·기준일)
- rail_station_crosswalk.parquet : 공식 행 ↔ 서울 마스터(rail_stations 의 SMA:)·카카오 역·기존 파일럿 역사(RC:) 매핑과 좌표 차이
- rail_entrance_links.parquet     : 기존 카카오 출구(보조 자료) ↔ 공식 역사 연결. 공식 XLSX 에는 출구 좌표가 없다
- rail_usage_operator_monthly.parquet : 운영기관별(서울 카드·서울 일별·부산·인천) 월 승하차(승차·하차 분리), 실제 관측 일수·기간, 중복 판정(is_primary)
- rail_usage_overlap.parquet     : 같은 역·월을 둘 이상의 원천이 담은 경우의 값 비교(대표 하나만 쓴다)
- rail_usage_complex_2025.parquet: 역사별 2025 달력 연도 하루 평균(관측된 부분 합계 표시)
- rail_national_meta.json / outputs/tables: rail_national_report.csv

규칙 (테스트로 지킨다)
- 공식 좌표 우선순위: 국가철도공단 XLSX > 서울 열린데이터광장 마스터 > 카카오. 차이는 crosswalk 에 따로 남기고 기존 파일럿 산출물의 좌표는 바꾸지 않는다.
- 역 식별: (운영기관, 역번호, 노선번호, 표준 노선). 같은 키에 같은 위치가 둘이면 같은 역의 중복 행(최신 기준일 하나만 남김). 같은 이름이라도 400m 밖이면 다른 역사, 노선이 달라도 같은 이름이 400m 안이면 환승 역사다.
- 이용량: 승차·하차를 따로 둔다(더하지 않음). 원천마다 관측 기간이 달라(서울 카드 2025-01~, 서울 일별 2024, 부산 2025-01~2026-08, 인천 2024-07~2026-06) 같은 기간처럼 비교하지 않고,
  역사 요약(rail_usage_complex_2025)은 2025 달력 연도만 쓴다. 같은 공식 역사×노선·월을 둘 이상의 원천이 담으면 운영기관 자체 자료를 대표로 하고 나머지는 중복으로 표시해 합산하지 않는다.
- 연결은 원천이 가진 식별자만 쓴다: 부산=역번호(+역명 일치 검증), 서울 일별·서울 카드·인천=(노선, 역명). 좌표로는 연결하지 않는다. 연결 못 한 이용량은 비워 둔다(원인 코드를 남김).
실행: .venv/bin/python -m pipelines.transform.build_rail_national
"""
from __future__ import annotations

import argparse
import calendar
import hashlib
import json
import re
from datetime import date, datetime

import numpy as np
import pandas as pd
import pyproj

from pipelines.common import config
from pipelines.transform import build_bus_stops as bus
from pipelines.transform import build_rail_stations as r

XLSX = config.RAW_DIR / "전체_도시철도역사정보_20260630.xlsx"
RAW = config.RAW_DIR / "rail"
COMPLEX_MAX_M = r.COMPLEX_MAX_M         # 같은 이름이 이 거리 안이면 같은 역사
CROSSWALK_MAX_M = 300               # 공식 행 ↔ 마스터·카카오: 같은 이름이고 이 거리 안
DUP_MAX_M = 50                      # 같은 키의 공식 행이 이 거리 안이면 같은 역의 중복 행
SPREAD_WARN_M = 250                 # 환승 역사 안 노선별 좌표 차이가 이 값을 넘으면 점검 대상
YEAR = 2025
OWN_SOURCE_PRIORITY = ["incheon", "busan", "seoul_daily", "seoul_card"]    # 같은 역·월이 겹치면 앞선 원천을 대표로(운영기관 자체 자료 > 교통카드 집계)
OWN_SOURCE_OPERATORS = {"인천교통공사", "부산교통공사"}                    # 이 운영기관 역은 자체 자료만 대표로 인정한다(서울 카드에 일부 게이트 값만 잡힌 경우가 있음)
SOURCE_DEFAULT_OPERATOR = {"seoul_daily": "서울교통공사", "busan": "부산교통공사", "incheon": "인천교통공사"}

_PAREN = re.compile(r"\([^)]*\)|（[^）]*）")
_NOISE = re.compile(r"[\s\.·,\-_/]+")
ADDR_REGION = {"서울특별시": "서울", "서울시": "서울", "경기도": "경기", "인천광역시": "인천", "인천시": "인천", "부산광역시": "부산", "부산시": "부산", "대전광역시": "대전",
               "광주광역시": "광주", "울산시": "울산", "울산광역시": "울산", "경상남도": "경남", "경상북도": "경북", "경북": "경북", "충남": "충남", "충청남도": "충남",
               "강원도": "강원", "대구": "대구", "경산시": "경북", "수성구": "대구", "달서구": "대구", "달성군": "대구"}
OPERATOR_REGION = {"부산교통공사": "부산", "대구교통공사": "대구", "인천교통공사": "인천", "대전교통공사": "대전", "광주교통공사": "광주", "구리도시공사": "경기", "남양주도시공사": "경기"}
LINE_ALIAS = {"경의선": "경의중앙선", "안산선": "안산과천선", "과천선": "안산과천선", "의정부선": "의정부", "에버라인선": "에버라인", "김포골드라인": "김포도시철도",
              "공항철도1호선": "인천국제공항선", "공항철도": "인천국제공항선", "9호선(연장)": "9호선", "9호선2~3단계": "9호선"}


# ── 정규화 ──────────────────────────────────────────────────────────────────────────────────

def nat_name(s) -> str:
    """역명 정규화(전국용) — 괄호 부연·앞의 'N호선 '·공백을 지우고 3글자 이상이면 끝의 '역'을 지운다('광운대역'→'광운대', '역삼'은 그대로)."""
    x = re.sub(r"^\s*\d+호선\s*", "", _PAREN.sub("", str(s or "")))
    x = _NOISE.sub("", x).strip()
    return x[:-1] if len(x) > 2 and x.endswith("역") else x


def nat_line(raw) -> str:
    """원천별 노선 표기 → 표준 노선(지역 접두 포함 숫자 노선: '부산1호선'·'인천2호선', 서울 1~9호선은 접두 없음)."""
    x = _NOISE.sub("", str(raw or ""))
    for pat, fmt in ((r"^부산(?:경량)?도시철도(\d)호선$", "부산{}호선"), (r"^인천지하철(\d)호선$", "인천{}호선"), (r"^대구도시철도(\d)호선$", "대구{}호선"),
                     (r"^대전도시철도(\d)호선$", "대전{}호선"), (r"^광주도시철도(\d)호선$", "광주{}호선"), (r"^(?:서울|수도권)(?:광역철도|도시철도|경량도시철도)?(\d)호선$", "{}호선"),
                     (r"^도시철도(\d)호선$", "{}호선"), (r"^수도권광역철도(\d)호선$", "{}호선")):
        m = re.match(pat, x)
        if m:
            return fmt.format(m.group(1))
    if x == "수도권경량도시철도신림선":
        return "신림선"
    return LINE_ALIAS.get(x, x)


def std_operator(raw) -> str:
    x = re.sub(r"^(부산광역시|서울특별시|경기도|인천광역시)\s*", "", str(raw or "").strip())
    x = re.sub(r"주식회사|㈜|\(주\)", "", x)
    return _NOISE.sub("", x).strip()


def parse_base_date(v) -> tuple[date | None, str]:
    """행별 데이터기준일자 — 문자열·datetime·정수(20240812)·'1900-01-00'(자리표시자)·결측이 섞여 있다. (날짜|None, 형식 코드)."""
    if v is None or (isinstance(v, float) and np.isnan(v)) or v is pd.NaT or (isinstance(v, str) and not v.strip()):
        return None, "missing"
    if isinstance(v, (datetime, pd.Timestamp)):
        d = v.date()
        return (d, "ok") if d.year >= 2000 else (None, "invalid")
    if isinstance(v, (int, np.integer)) or (isinstance(v, str) and re.fullmatch(r"\d{8}", v.strip())):
        try:
            return datetime.strptime(str(int(v)), "%Y%m%d").date(), "int_format"
        except ValueError:
            return None, "invalid"
    try:
        d = datetime.strptime(str(v).strip()[:10], "%Y-%m-%d").date()
        return (d, "ok") if d.year >= 2000 else (None, "invalid")
    except ValueError:
        return None, "invalid"


def _region_of(address, operator_std, line_std) -> tuple[str, str]:
    tok = str(address or "").split()
    if tok and tok[0] in ADDR_REGION:
        return ADDR_REGION[tok[0]], "address"
    if operator_std in OPERATOR_REGION:
        return OPERATOR_REGION[operator_std], "operator"
    for pre in ("대구", "부산", "대전", "광주", "인천"):
        if line_std.startswith(pre):
            return pre, "line"
    return "unknown", "none"


def read_official(path=XLSX) -> tuple[pd.DataFrame, dict]:
    if not path.exists():
        raise FileNotFoundError(f"{path.name} 이 data/raw/ 에 없습니다")
    raw = pd.read_excel(path, dtype={"역번호": str, "노선번호": str, "환승노선번호": str})
    meta = {"file": path.name, "sheet": pd.ExcelFile(path).sheet_names[0], "rows": len(raw), "columns": list(raw.columns), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()[:16]}
    return raw, meta


def normalize_official(raw: pd.DataFrame, source_file: str) -> tuple[pd.DataFrame, dict]:
    """원천 컬럼 → 표준 컬럼. 행 번호·원 기준일을 남기고, 같은 역의 중복 행(같은 키·50m 이내)은 최신 기준일 하나만 남긴다."""
    d = raw.reset_index(drop=True)
    parsed = [parse_base_date(v) for v in d["데이터기준일자"]]
    op_raw = d["운영기관명"].astype(str)
    out = pd.DataFrame({
        "station_code": d["역번호"].astype(str).str.strip(), "name": d["역사명"].astype(str).str.strip(), "line_code": d["노선번호"].astype(str).str.strip(),
        "line_raw": d["노선명"].astype(str).str.strip(), "operator_raw": op_raw.str.strip(), "address": d["역사도로명주소"], "transfer_flag_raw": d["환승역구분"],
        "transfer_line_codes": d["환승노선번호"].fillna("").astype(str), "lon": pd.to_numeric(d["역경도"], errors="coerce"), "lat": pd.to_numeric(d["역위도"], errors="coerce"),
        "base_date": [p[0] for p in parsed], "base_date_flag": [p[1] for p in parsed], "base_date_raw": d["데이터기준일자"].astype(str),
        "source_file": source_file, "source_row": d.index + 2,                    # 엑셀 행 번호(1행은 머리글)
    })
    out["name_norm"] = out["name"].map(nat_name)
    out["line_std"] = out["line_raw"].map(nat_line)
    out["operator_std"] = out["operator_raw"].map(std_operator)
    out["is_transfer"] = out["transfer_flag_raw"].astype(str).str.contains("환승역") & ~out["transfer_flag_raw"].astype(str).str.contains("일반")
    rg = [_region_of(a, o, ln) for a, o, ln in zip(out["address"], out["operator_std"], out["line_std"])]
    out["region"], out["region_basis"] = [x[0] for x in rg], [x[1] for x in rg]
    out["coord_ok"] = out["lon"].between(124, 132) & out["lat"].between(33, 39)
    out["official_station_id"] = [f"OFC:{o}:{c}:{lc}:{ls}" for o, c, lc, ls in zip(out["operator_std"], out["station_code"], out["line_code"], out["line_std"])]
    out = _project(out)
    # 중복 행: 같은 식별자 키 + 50m 안(주안·이수 같은 이중 등재). 최신 기준일(없으면 가장 앞 행)을 남긴다.
    out["_rank"] = out["base_date"].map(lambda x: x.toordinal() if x else 0)
    keep, dropped = [], []
    for _, g in out.groupby("official_station_id", sort=True):
        if len(g) == 1:
            keep.append(g.index[0]); continue
        g = g.sort_values(["_rank", "source_row"], ascending=[False, True])
        kept: list[int] = []
        for i in g.index:
            near = [k for k in kept if np.hypot(out.at[i, "x_5179"] - out.at[k, "x_5179"], out.at[i, "y_5179"] - out.at[k, "y_5179"]) <= DUP_MAX_M]
            (dropped if near else kept).append(i)
        keep += kept
    info = {"rows_raw": len(out), "duplicate_rows_dropped": len(dropped),
            "dropped_rows": [{"source_row": int(out.at[i, "source_row"]), "name": out.at[i, "name"], "line": out.at[i, "line_raw"]} for i in dropped]}
    res = out.loc[sorted(keep)].drop(columns="_rank").reset_index(drop=True)
    # 같은 키인데 위치가 다른 행이 남으면 서로 다른 역으로 보고 id 를 구분한다(자동 병합하지 않음)
    dup_id = res["official_station_id"].duplicated(keep=False)
    seq = res.loc[dup_id].groupby("official_station_id").cumcount() + 1
    res.loc[dup_id, "official_station_id"] = [f"{i}#{n}" for i, n in zip(res.loc[dup_id, "official_station_id"], seq)]
    info["same_key_different_place_rows"] = int(dup_id.sum())
    return res, info


def _project(df: pd.DataFrame) -> pd.DataFrame:
    """5179 투영 좌표와 파일럿 거리(경계 밖 포함). 좌표가 없는 행은 NaN."""
    df = df.reset_index(drop=True)
    return bus.add_geography(df)


# ── 역사 묶음·환승 검증 ──────────────────────────────────────────────────────────────────────

def add_complexes(off: pd.DataFrame) -> pd.DataFrame:
    """같은 정규화 역명이고 400m 안이면 한 역사. 좌표가 없는 행은 단독 역사로 둔다."""
    ok = off[off["coord_ok"]].rename(columns={"official_station_id": "station_line_id"})
    cx = r.build_complexes(ok[["station_line_id", "name_norm", "x_5179", "y_5179"]].assign(source="official"))
    ids = cx.set_index("station_line_id")["complex_id"].map(lambda v: "NC:" + v[3:])
    res = off.copy()
    res["national_complex_id"] = res["official_station_id"].map(ids)
    miss = res["national_complex_id"].isna()
    res.loc[miss, "national_complex_id"] = ["NC:" + v for v in res.loc[miss, "official_station_id"]]
    return res


def transfer_checks(off: pd.DataFrame) -> dict:
    """환승 역사 검증(병합에는 쓰지 않는 점검): ① 같은 이름·가까운 노선들이 서로의 환승노선번호에 나오는가(코드 일치 / 코드 없음 / 코드 불일치)
    ② 역사 안 노선별 좌표 차이 ③ 환승역으로 표시됐지만 묶이지 않은 행."""
    multi = off.groupby("national_complex_id").filter(lambda g: g["line_std"].nunique() >= 2 and g["coord_ok"].all())
    cat = {"consistent": 0, "no_codes": 0, "mismatch": 0}
    spreads, flagged = [], []
    for cid, g in multi.groupby("national_complex_id"):
        members = set(g["line_code"])
        toks = [set(re.split(r"[+,\s]+", t)) - {""} for t in g["transfer_line_codes"]]
        if all(len(t) == 0 for t in toks):
            cat["no_codes"] += 1
        elif all(any(m in t for m in members - {lc}) for lc, t in zip(g["line_code"], toks) if len(members - {lc})):
            cat["consistent"] += 1
        else:
            cat["mismatch"] += 1
        x, y = g["x_5179"].to_numpy(), g["y_5179"].to_numpy()
        sp = float(max(np.hypot(x[i] - x[j], y[i] - y[j]) for i in range(len(g)) for j in range(i + 1, len(g))))
        spreads.append(sp)
        if sp > SPREAD_WARN_M:
            flagged.append({"complex": g["name"].iloc[0], "spread_m": round(sp, 1)})
    singles = off[off["is_transfer"]].groupby("national_complex_id").filter(lambda g: len(g) == 1)
    return {"multi_line_complexes": int(multi["national_complex_id"].nunique()), "transfer_codes": cat,
            "spread_m_median": round(float(np.median(spreads)), 1) if spreads else None, "spread_m_max": round(float(max(spreads)), 1) if spreads else None,
            "spread_over_warn_count": len(flagged), "spread_over_warn": sorted(flagged, key=lambda d: -d["spread_m"])[:8],
            "transfer_flag_but_single_row": int(len(singles)), "transfer_flag_but_single_names": sorted(set(singles["name"]))[:12]}


def same_name_far_apart(off: pd.DataFrame) -> dict:
    """같은 정규화 역명이 여러 역사로 갈라진 수 — 이름만 같은 다른 역을 잘못 병합하지 않았다는 증거."""
    g = off.groupby("name_norm")["national_complex_id"].nunique()
    multi = g[g > 1]
    return {"names_with_multiple_complexes": int(len(multi)), "examples": sorted(multi.index)[:10]}


# ── 서울 마스터·카카오와 대조 ────────────────────────────────────────────────────────────────

def _nearest_same_name(off: pd.DataFrame, other: pd.DataFrame, id_col: str) -> pd.DataFrame:
    """공식 행마다 이름이 같은 other 행 중 가장 가까운 것(CROSSWALK_MAX_M 안). 매칭 안 되면 가장 가까운 같은 이름의 거리를 남긴다."""
    by = {k: g for k, g in other.dropna(subset=["x_5179"]).groupby("name_norm")}
    rows = []
    for o in off.itertuples():
        g = by.get(o.name_norm)
        if g is None or not o.coord_ok:
            rows.append((None, np.nan, False, "no_same_name" if g is None else "no_coord")); continue
        d = np.hypot(g["x_5179"].to_numpy() - o.x_5179, g["y_5179"].to_numpy() - o.y_5179)
        i = int(d.argmin())
        line_ok = bool(nat_line(g.iloc[i].get("line", "")) == o.line_std)
        rows.append((g.iloc[i][id_col] if d[i] <= CROSSWALK_MAX_M else None, round(float(d[i]), 1), line_ok, "matched" if d[i] <= CROSSWALK_MAX_M else "same_name_too_far"))
    return pd.DataFrame(rows, columns=[f"{id_col}_m", f"dist_{id_col}", f"line_agree_{id_col}", f"status_{id_col}"], index=off.index)


def build_crosswalk(off: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    m_rows, _ = r._load("seoul_master")
    master = _project(r.normalize_master(m_rows))
    master["name_norm"] = master["name"].map(nat_name)
    k_rows, _ = r._load("kakao_stations")
    kakao = _project(r.parse_kakao_stations(k_rows))
    kakao["name_norm"] = kakao["name"].map(nat_name)
    kakao = kakao.rename(columns={"kakao_id": "kid"})
    a = _nearest_same_name(off, master, "station_line_id").rename(columns={"station_line_id_m": "seoul_master_id", "dist_station_line_id": "dist_master_m",
                                                                           "line_agree_station_line_id": "line_agree_master", "status_station_line_id": "status_master"})
    b = _nearest_same_name(off, kakao.assign(line=kakao["line"]), "kid").rename(columns={"kid_m": "kakao_id", "dist_kid": "dist_kakao_m", "line_agree_kid": "line_agree_kakao", "status_kid": "status_kakao"})
    cw = pd.concat([off[["official_station_id", "national_complex_id", "region", "operator_std", "line_std", "name", "lon", "lat"]], a, b], axis=1)
    pil = pd.read_parquet(config.PROCESSED_DIR / "rail_stations.parquet")[["station_line_id", "complex_id"]].rename(columns={"station_line_id": "seoul_master_id", "complex_id": "pilot_complex_id"})
    cw = cw.merge(pil, on="seoul_master_id", how="left")
    cw["coord_preferred"] = "official_xlsx"
    rev = master.copy()
    used = set(cw["seoul_master_id"].dropna())
    # 서울 마스터에는 있는데 공식 표에 같은 이름·300m 안이 없는 행 — 역명 표기 차이거나 공식 표에 없는 역
    master_only = rev[~rev["station_line_id"].isin(used)]
    stats = {"official_rows": len(cw), "matched_master": int((cw["status_master"] == "matched").sum()), "matched_kakao_in_pilot_area": int((cw["status_kakao"] == "matched").sum()),
             "master_rows": len(master), "master_rows_without_official": len(master_only),
             "master_only_examples": sorted(f"{n}({ln})" for n, ln in zip(master_only["name"], master_only["line"]))[:12],
             "dist_master_m": _q(cw.loc[cw["status_master"] == "matched", "dist_master_m"]), "dist_kakao_m": _q(cw.loc[cw["status_kakao"] == "matched", "dist_kakao_m"]),
             "line_label_differs_master": int(((cw["status_master"] == "matched") & ~cw["line_agree_master"].astype(bool)).sum())}
    return cw, stats


def _q(s: pd.Series) -> dict:
    s = s.dropna()
    return {"n": int(len(s)), "median": round(float(s.median()), 1), "p95": round(float(s.quantile(0.95)), 1), "max": round(float(s.max()), 1)} if len(s) else {"n": 0}


# ── 이용량(운영기관별) ───────────────────────────────────────────────────────────────────────

def _load_all(prefix: str) -> tuple[pd.DataFrame, list[dict]]:
    """같은 원천의 모든 버전 파일(가장 최근 수집분만)을 합친다 → (행, 버전별 메타)."""
    frames, metas = [], []
    by_ver: dict[str, object] = {}
    for p in sorted(RAW.glob(f"{prefix}_*_*.json")):
        by_ver[p.name.split("_")[-2]] = p
    for ver, p in sorted(by_ver.items()):
        env = json.loads(p.read_text(encoding="utf-8"))
        frames.append(pd.DataFrame(env["rows"]).assign(_version=ver))
        metas.append({"version": ver, **{k: env.get(k) for k in ("period_first", "period_last", "source_total_count", "item_count")}, "file": p.name})
    if not frames:
        raise FileNotFoundError(f"data/raw/rail/{prefix}_*.json 이 없습니다 — collect_rail_transit 를 먼저 실행하세요")
    return pd.concat(frames, ignore_index=True), metas


def _month_frame(df: pd.DataFrame, date_col: str, key_cols: list[str], on_col: str, off_col: str, source: str) -> pd.DataFrame:
    """일별 행(키×날짜: 승차·하차 각각) → 월별. 승차·하차는 각각 합하고 관측 일수는 두 방향이 모두 있는 날만 센다."""
    df = df.assign(ym=df[date_col].astype(str).str[:7].str.replace("-", ""))
    g = df.groupby(key_cols + ["ym"]).agg(boardings=(on_col, "sum"), alightings=(off_col, "sum"), days_on=("_on_day", "nunique"), days_off=("_off_day", "nunique"),
                                         period_first=(date_col, "min"), period_last=(date_col, "max")).reset_index()
    g["days_observed"] = np.minimum(g["days_on"], g["days_off"])
    g["source"] = source
    return g.drop(columns=["days_on", "days_off"])


def usage_seoul_daily() -> tuple[pd.DataFrame, dict]:
    raw, metas = _load_all("seoul_daily")
    hours = [c for c in raw.columns if ("시간대" in c) or c in ("06시이전", "24시이후")]
    day_total = raw[hours].sum(axis=1, min_count=len(hours))
    info = {"rows": len(raw), "dup_keys": int(raw.duplicated(["수송일자", "역번호", "호선", "승하차구분"]).sum()), "negative_hourly": int((raw[hours] < 0).sum().sum()),
            "missing_hourly_rows": int(day_total.isna().sum()), "versions": metas}
    d = raw.drop_duplicates(["수송일자", "역번호", "호선", "승하차구분"]).assign(_t=day_total)
    d = d[d["_t"].notna()]
    d = d.assign(_on=np.where(d["승하차구분"] == "승차", d["_t"], 0.0), _off=np.where(d["승하차구분"] == "하차", d["_t"], 0.0),
                 _on_day=np.where(d["승하차구분"] == "승차", d["수송일자"], None), _off_day=np.where(d["승하차구분"] == "하차", d["수송일자"], None))
    g = _month_frame(d, "수송일자", ["역번호", "역명", "호선"], "_on", "_off", "seoul_daily")
    g = g.rename(columns={"역번호": "source_code", "역명": "name_raw", "호선": "line_raw"})
    return g, info


def usage_busan() -> tuple[pd.DataFrame, dict]:
    raw, metas = _load_all("busan")
    hours = [c for c in raw.columns if "시-" in c]
    hsum = raw[hours].sum(axis=1, min_count=len(hours))
    info = {"rows": len(raw), "dup_keys": int(raw.duplicated(["년월일", "역번호", "구분"]).sum()), "negative_hourly": int((raw[hours] < 0).sum().sum()),
            "missing_hourly_rows": int(hsum.isna().sum()), "total_col_mismatch": int((raw["합계"] != hsum).sum()), "versions": metas}
    d = raw.drop_duplicates(["년월일", "역번호", "구분"]).assign(_t=hsum)
    d = d[d["_t"].notna()]
    d = d.assign(_on=np.where(d["구분"] == "승차", d["_t"], 0.0), _off=np.where(d["구분"] == "하차", d["_t"], 0.0),
                 _on_day=np.where(d["구분"] == "승차", d["년월일"], None), _off_day=np.where(d["구분"] == "하차", d["년월일"], None))
    g = _month_frame(d, "년월일", ["역번호", "역명"], "_on", "_off", "busan")
    g = g.rename(columns={"역번호": "source_code", "역명": "name_raw"}).assign(line_raw="")
    return g, info


def usage_incheon() -> tuple[pd.DataFrame, dict]:
    raw, metas = _load_all("incheon")
    key = ["통행일자", "호선", "역명"]
    dup_all = raw[raw.duplicated(key, keep=False)]
    conflict = int((dup_all.groupby(key)[["승차인원", "하차인원"]].nunique() > 1).any(axis=1).sum()) if len(dup_all) else 0
    info = {"rows": len(raw), "dup_keys_across_versions": int(raw.duplicated(key).sum()), "dup_conflicts": conflict, "negative": int((raw[["승차인원", "하차인원"]] < 0).sum().sum()),
            "missing": int(raw[["승차인원", "하차인원"]].isna().sum().sum()), "total_col_mismatch": int((raw["이용인원"] != raw["승차인원"] + raw["하차인원"]).sum()), "versions": metas}
    d = raw.drop_duplicates(key).assign(_on_day=lambda x: x["통행일자"], _off_day=lambda x: x["통행일자"])
    g = _month_frame(d, "통행일자", ["호선", "역명"], "승차인원", "하차인원", "incheon")
    g = g.rename(columns={"호선": "line_raw", "역명": "name_raw"}).assign(source_code=None)
    g["line_raw"] = g["line_raw"].astype(str)
    return g, info


def usage_card() -> tuple[pd.DataFrame, dict]:
    """서울 교통카드 월별(기존 build_rail_stations 의 정규화를 그대로 쓴다). 일 단위 관측 일수가 없어 달력 일수를 쓴다."""
    frames = [pd.DataFrame(json.loads(p.read_text(encoding="utf-8"))["rows"]) for p in r._card_files()]
    u, info = r.normalize_card(frames)
    g = pd.DataFrame({"source": "seoul_card", "source_code": None, "name_raw": u["name_raw"], "line_raw": u["line_raw"], "ym": u["ym"], "boardings": u["boardings"], "alightings": u["alightings"],
                      "days_observed": u["days"], "period_first": u["ym"].map(lambda m: f"{m[:4]}-{m[4:]}-01"), "period_last": u["ym"].map(lambda m: f"{m[:4]}-{m[4:]}-{calendar.monthrange(int(m[:4]), int(m[4:]))[1]}")})
    return g, {k: info[k] for k in ("rows_raw", "exact_duplicate_rows", "same_key_conflicts_kept_first", "rows_with_missing_hours", "months")}


def _alts(off: pd.DataFrame) -> dict:
    return {k: g for k, g in off.groupby("name_norm")}


def link_usage_keys(keys: pd.DataFrame, off: pd.DataFrame, source: str) -> pd.DataFrame:
    """원천별 연결 — 식별자 규칙은 모듈 docstring. 결과: key → (official_station_id, link_basis, cause)."""
    out = []
    if source == "busan":
        ob = off[off["operator_std"] == "부산교통공사"].copy()
        ob["code_int"] = pd.to_numeric(ob["station_code"], errors="coerce")
        by_code = {k: g for k, g in ob.groupby("code_int")}
        for k in keys.itertuples():
            g = by_code.get(int(k.source_code))
            if g is None:
                out.append((None, "none", "no_station_code")); continue
            if len(g) > 1:
                out.append((None, "none", "ambiguous_code")); continue
            if nat_name(k.name_raw) != g.iloc[0]["name_norm"]:
                out.append((None, "none", "code_name_conflict")); continue
            out.append((g.iloc[0]["official_station_id"], "code", "ok"))
        return pd.DataFrame(out, index=keys.index, columns=["official_station_id", "link_basis", "cause"])
    primary_scope = off[off["operator_std"] == SOURCE_DEFAULT_OPERATOR[source]] if source in SOURCE_DEFAULT_OPERATOR else off
    scopes = [("", _alts(primary_scope))] + ([("+other_operator", _alts(off))] if source in SOURCE_DEFAULT_OPERATOR and source != "busan" else [])
    for k in keys.itertuples():
        line = f"인천{int(k.line_raw)}호선" if source == "incheon" and str(k.line_raw) in ("1", "2") else (f"{int(k.line_raw)}호선" if source == "incheon" else nat_line(k.line_raw))
        res, cause = (None, "none"), "no_station"
        for tag, by_name in scopes:
            g = by_name.get(nat_name(k.name_raw))
            if g is None:
                continue
            ex = g[g["line_std"] == line]
            if len(ex) == 1:
                res, cause = (ex.iloc[0]["official_station_id"], "line_name" + tag), "ok"
            elif len(ex) == 0 and len(g) == 1:
                res, cause = (g.iloc[0]["official_station_id"], "name_unique" + tag), "ok"
            else:
                res, cause = (None, "none"), "ambiguous"
            break
        out.append((res[0], res[1], cause))
    # 한 공식 행에 이용량 키가 둘 이상 붙는 경우(역명 변경 등)의 처리는 월이 겹치는지 보고 build_usage 에서 한다
    return pd.DataFrame(out, index=keys.index, columns=["official_station_id", "link_basis", "cause"])


def resolve_multi_keys(g: pd.DataFrame) -> tuple[pd.DataFrame, int]:
    """한 공식 행에 서로 다른 이용량 키(이름 표기)가 붙은 경우 — 월이 겹치지 않으면 같은 역의 이름 변경이라 이어 쓰고, 같은 월에 둘 이상이면 연결을 해제한다. (결과, 이어 쓴 별칭 키 수)"""
    g = g.copy()
    linked = g[g["official_station_id"].notna()]
    cnt = linked.groupby(["official_station_id", "ym"])["name_raw"].transform("size")
    bad = cnt.index[cnt > 1]
    ok = linked.loc[~linked.index.isin(bad), ["official_station_id", "name_raw", "line_raw"]].drop_duplicates()
    n_alias = int(ok.duplicated("official_station_id").sum())
    g.loc[bad, ["official_station_id", "link_basis", "cause"]] = [None, "none", "many_usage_keys_same_month"]
    return g, n_alias


def official_unlinked_reasons(off: pd.DataFrame, u: pd.DataFrame) -> dict:
    """이용량이 한 번도 연결되지 않은 공식 행의 원인 — 지역별. no_source_for_operator(그 운영기관·지역의 이용량 자료를 아직 받지 않음) /
    sibling_line_has_usage(같은 역사·같은 운영기관의 다른 노선만 이용량이 있음 — 호선별 게이트가 합쳐진 자료일 수 있음) / operator_source_lacks_station."""
    linked_ids = set(u.loc[u["official_station_id"].notna(), "official_station_id"])
    ops_with_source = set(zip(u.loc[u["official_station_id"].notna(), "operator_std"], u.loc[u["official_station_id"].notna(), "region"]))   # (운영기관, 지역) — 코레일 수도권 자료가 부산 동해선까지 덮는 것은 아니다
    miss = off[~off["official_station_id"].isin(linked_ids)].copy()
    sib = off[off["official_station_id"].isin(linked_ids)].groupby(["national_complex_id", "operator_std"]).size()
    def why(row) -> str:
        if (row["operator_std"], row["region"]) not in ops_with_source:
            return "no_source_for_operator"
        return "sibling_line_has_usage" if (row["national_complex_id"], row["operator_std"]) in sib.index else "operator_source_lacks_station"
    miss["why"] = miss.apply(why, axis=1)
    out: dict = {}
    for (reg, w), n in miss.groupby(["region", "why"]).size().items():
        out.setdefault(reg, {})[w] = int(n)
    return out


def build_usage(off: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    parts, infos = [], {}
    for src, fn in (("seoul_card", usage_card), ("seoul_daily", usage_seoul_daily), ("busan", usage_busan), ("incheon", usage_incheon)):
        g, info = fn()
        keycols = ["source_code", "name_raw", "line_raw"]
        keys = g[keycols].astype(object).where(g[keycols].notna(), None).drop_duplicates().reset_index(drop=True)
        if src == "busan":
            keys["source_code"] = keys["source_code"].astype(int)
        lk = link_usage_keys(keys, off, src)
        keys = pd.concat([keys, lk], axis=1)
        g = g.merge(keys, on=keycols, how="left") if src != "busan" else g.assign(source_code=g["source_code"].astype(int)).merge(keys, on=keycols, how="left")
        # 한 공식 행에 키가 둘 이상 붙었을 때: 월이 겹치지 않으면 같은 역의 이름 변경(예: '센트럴파크'→'센트럴파크(재외동포청)')이라 이어 쓰고,
        # 같은 월에 둘 이상 있으면 어느 쪽이 맞는지 알 수 없어 연결하지 않는다(합산 금지).
        g, n_alias = resolve_multi_keys(g)
        k2 = g[keycols + ["official_station_id", "cause"]].drop_duplicates(keycols)
        info["keys"] = int(len(k2))
        info["keys_linked"] = int(k2["official_station_id"].notna().sum())
        info["alias_name_changes_merged"] = n_alias
        info["unlinked_causes"] = k2.loc[k2["official_station_id"].isna(), "cause"].value_counts().to_dict()
        un = k2[k2["official_station_id"].isna()]
        info["unlinked_examples"] = [f"{n}({ln})" for n, ln in zip(un["name_raw"], un["line_raw"])][:8]
        infos[src] = info
        parts.append(g)
    u = pd.concat(parts, ignore_index=True)
    u["days_in_month"] = [calendar.monthrange(int(m[:4]), int(m[4:]))[1] for m in u["ym"]]
    u["complete_month"] = u["days_observed"] == u["days_in_month"]
    om = off.set_index("official_station_id")
    u["operator_std"] = u["official_station_id"].map(om["operator_std"]).fillna(u["source"].map(SOURCE_DEFAULT_OPERATOR))
    u["region"] = u["official_station_id"].map(om["region"])
    u["national_complex_id"] = u["official_station_id"].map(om["national_complex_id"])
    u["avg_daily_boardings"] = (u["boardings"] / u["days_observed"]).round(1)
    u["avg_daily_alightings"] = (u["alightings"] / u["days_observed"]).round(1)
    u = u.rename(columns={"link_basis": "link_basis", "cause": "link_cause"})
    u["link_cause"] = u["link_cause"].fillna("no_key")
    return reconcile(u), infos


def reconcile(u: pd.DataFrame) -> pd.DataFrame:
    """같은 공식 역사×노선·월에 여러 원천이 있으면 운영기관 자체 자료를 대표(is_primary)로. 서울 카드·일별은 부산·인천교통공사 역에서는 대표가 될 수 없다."""
    u = u.copy()
    rank = {s: i for i, s in enumerate(OWN_SOURCE_PRIORITY)}
    u["_rank"] = u["source"].map(rank)
    u["primary_reason"] = np.where(u["official_station_id"].isna(), "unlinked", "")
    # 서울 카드·서울 일별 자료에 부산·인천교통공사 역이 잡혀도(예: 7호선 까치울·상동의 일부 게이트 값) 그 역의 대표 이용량은 운영기관 자체 자료다
    own = u["source"].map(SOURCE_DEFAULT_OPERATOR)
    card_bad = u["source"].isin(["seoul_card", "seoul_daily"]) & u["operator_std"].isin(OWN_SOURCE_OPERATORS) & (u["operator_std"] != own) & u["official_station_id"].notna()
    u.loc[card_bad, "primary_reason"] = "not_operator_source"
    cand = u[(u["primary_reason"] == "")]
    best = cand.groupby(["official_station_id", "ym"])["_rank"].transform("min")
    is_best = cand["_rank"] == best
    u["is_primary"] = False
    u.loc[cand.index[is_best], "is_primary"] = True
    u.loc[cand.index[~is_best], "primary_reason"] = "duplicate_lower_priority_source"
    n_src = cand.groupby(["official_station_id", "ym"])["source"].transform("nunique")
    u["overlap_group"] = False
    u.loc[cand.index[n_src > 1], "overlap_group"] = True
    own_keys = set(zip(u.loc[u["is_primary"], "official_station_id"], u.loc[u["is_primary"], "ym"]))
    u.loc[card_bad, "overlap_group"] = [(a, b) in own_keys for a, b in zip(u.loc[card_bad, "official_station_id"], u.loc[card_bad, "ym"])]
    return u.drop(columns="_rank").sort_values(["official_station_id", "ym", "source"], na_position="last").reset_index(drop=True)


def overlap_table(u: pd.DataFrame) -> pd.DataFrame:
    """대표가 아닌 행(같은 역·월을 다른 원천도 담음)과 대표 행의 값 비교."""
    prim = u[u["is_primary"]].set_index(["official_station_id", "ym"])
    dup = u[u["overlap_group"] & ~u["is_primary"] & u["official_station_id"].notna()].copy()
    if dup.empty:
        return pd.DataFrame(columns=["official_station_id", "ym", "source", "primary_source", "boardings", "primary_boardings", "ratio_boardings", "primary_reason"])
    p = prim.reindex(pd.MultiIndex.from_frame(dup[["official_station_id", "ym"]]))
    out = pd.DataFrame({"official_station_id": dup["official_station_id"].to_numpy(), "ym": dup["ym"].to_numpy(), "source": dup["source"].to_numpy(), "primary_source": p["source"].to_numpy(),
                        "boardings": dup["boardings"].to_numpy(), "primary_boardings": p["boardings"].to_numpy(), "alightings": dup["alightings"].to_numpy(), "primary_alightings": p["alightings"].to_numpy(),
                        "primary_reason": dup["primary_reason"].to_numpy()})
    out["ratio_boardings"] = (out["boardings"] / out["primary_boardings"]).round(4)
    return out


def complex_2025(u: pd.DataFrame, off: pd.DataFrame) -> pd.DataFrame:
    """역사별 2025 달력 연도 하루 평균(승차·하차 따로) — 대표 행만, 관측 일수로 나눈 값. 일부 노선만 연결되면 partial."""
    p = u[u["is_primary"] & u["ym"].str.startswith(str(YEAR))]
    sl = p.groupby("official_station_id").agg(on=("boardings", "sum"), off=("alightings", "sum"), days=("days_observed", "sum"), months=("ym", "nunique"), complete=("complete_month", "all"),
                                              sources=("source", lambda s: "·".join(sorted(set(s))))).reset_index()
    sl["avg_on"], sl["avg_off"] = sl["on"] / sl["days"], sl["off"] / sl["days"]
    m = off[["official_station_id", "national_complex_id", "name", "region"]].merge(sl, on="official_station_id", how="left")
    rows = []
    for cid, g in m.groupby("national_complex_id", sort=True):
        have = g[g["months"].notna()]
        rows.append({"national_complex_id": cid, "name": g["name"].iloc[0], "region": g["region"].iloc[0], "lines_total": len(g), "lines_with_usage": len(have),
                     "usage_state": "none_linked" if len(have) == 0 else ("all_linked" if len(have) == len(g) else "partial"),
                     "avg_daily_boardings_2025": round(float(have["avg_on"].sum()), 1) if len(have) else None, "avg_daily_alightings_2025": round(float(have["avg_off"].sum()), 1) if len(have) else None,
                     "months_observed_min": int(have["months"].min()) if len(have) else 0, "complete_2025": bool(len(have) and (have["months"] == 12).all() and have["complete"].all()),
                     "sources": "·".join(sorted(set("·".join(have["sources"]).split("·")))) if len(have) else ""})
    return pd.DataFrame(rows)


# ── 조립 ────────────────────────────────────────────────────────────────────────────────────

def build() -> dict:
    proc = config.PROCESSED_DIR
    raw, file_meta = read_official()
    off, dedup = normalize_official(raw, file_meta["file"])
    off = add_complexes(off)
    tc, sn = transfer_checks(off), same_name_far_apart(off)
    cw, cw_stats = build_crosswalk(off)

    u, uinfo = build_usage(off)
    ov = overlap_table(u)
    cx25 = complex_2025(u, off)
    unlinked_why = official_unlinked_reasons(off, u)

    ent = pd.read_parquet(proc / "rail_entrances.parquet")
    cwm = cw.dropna(subset=["seoul_master_id"]).drop_duplicates("seoul_master_id").set_index("seoul_master_id")
    ent_l = ent[["exit_id", "station_line_id", "exit_label", "lon", "lat", "x_5179", "y_5179"]].copy()
    ent_l["official_station_id"] = ent_l["station_line_id"].map(cwm["official_station_id"])
    ent_l["national_complex_id"] = ent_l["station_line_id"].map(cwm["national_complex_id"])
    ox = off.set_index("official_station_id")[["x_5179", "y_5179"]]
    ent_l["dist_to_official_m"] = [round(float(np.hypot(e.x_5179 - ox.at[o, "x_5179"], e.y_5179 - ox.at[o, "y_5179"])), 1) if isinstance(o, str) and o in ox.index else np.nan for e, o in zip(ent_l.itertuples(), ent_l["official_station_id"])]
    ent_l["source"], ent_l["is_official_coordinate"] = "kakao_local", False

    off.sort_values("official_station_id").reset_index(drop=True).to_parquet(proc / "rail_official_stations.parquet", index=False)
    cw.sort_values("official_station_id").reset_index(drop=True).to_parquet(proc / "rail_station_crosswalk.parquet", index=False)
    ent_l.sort_values("exit_id").reset_index(drop=True).to_parquet(proc / "rail_entrance_links.parquet", index=False)
    u.to_parquet(proc / "rail_usage_operator_monthly.parquet", index=False)
    ov.to_parquet(proc / "rail_usage_overlap.parquet", index=False)
    cx25.to_parquet(proc / "rail_usage_complex_2025.parquet", index=False)

    # 지역·원천별 보고
    rep = []
    reg = off.groupby("region").agg(rows=("official_station_id", "count"), complexes=("national_complex_id", "nunique")).reset_index()
    cwr = cw.groupby("region")["status_master"].apply(lambda s: int((s == "matched").sum()))
    has_any = u[u["official_station_id"].notna()].groupby("region")["official_station_id"].nunique()
    prim25 = u[u["is_primary"] & u["ym"].str.startswith(str(YEAR))].groupby("region")["official_station_id"].nunique()
    region_rows = []
    for rr in reg.itertuples():
        region_rows.append({"region": rr.region, "official_rows": rr.rows, "complexes": rr.complexes, "already_in_seoul_master": int(cwr.get(rr.region, 0)),
                            "new_vs_existing": rr.rows - int(cwr.get(rr.region, 0)), "rows_with_any_usage": int(has_any.get(rr.region, 0)), "rows_with_2025_usage": int(prim25.get(rr.region, 0))})
    region_df = pd.DataFrame(region_rows).sort_values("official_rows", ascending=False)
    for row in region_df.itertuples():
        rep.append((f"지역 {row.region}", f"역사×노선 {row.official_rows} / 역사 {row.complexes} / 기존 마스터와 맞음 {row.already_in_seoul_master} / 신규 {row.new_vs_existing}",
                    f"이용량 연결(전 기간) {row.rows_with_any_usage}행({row.rows_with_any_usage / row.official_rows:.0%}), 2025 대표 이용량 {row.rows_with_2025_usage}행({row.rows_with_2025_usage / row.official_rows:.0%})"))
    for src, info in uinfo.items():
        s = u[u["source"] == src]
        per = f"{s['period_first'].min()} ~ {s['period_last'].max()}"
        rep.append((f"이용량 원천 {src}", f"키 {info['keys_linked']}/{info['keys']} 연결, 행(월) {len(s):,}, 관측 {per}", f"미연결 원인 {info['unlinked_causes']} 예 {info['unlinked_examples'][:4]}"))
    rep += [("공식 XLSX", f"{file_meta['file']} · 행 {file_meta['rows']} → 중복 {dedup['duplicate_rows_dropped']} 제거 → {len(off)}", f"기준일 형식 {off['base_date_flag'].value_counts().to_dict()}, 최신 {max(d for d in off['base_date'] if d)} 최소 {min(d for d in off['base_date'] if d)}"),
            ("공식 행 이용량 미연결 원인(지역별)", unlinked_why, "no_source_for_operator=해당 운영기관 이용량 자료를 받지 않음"), ("환승 검증", tc, ""), ("같은 이름 다른 역사", sn, ""), ("마스터·카카오 좌표 대조", cw_stats, ""),
            ("중복(overlap) 행", f"{len(ov)}", f"원천 쌍 {ov.groupby(['source', 'primary_source']).size().to_dict() if len(ov) else {}}")]
    pd.DataFrame(rep, columns=["항목", "값", "비고"]).to_csv(config.TABLES_DIR / "rail_national_report.csv", index=False, encoding="utf-8-sig")

    meta = {"official_file": file_meta, "official_rows_after_dedup": len(off), "official_dedup": dedup, "official_base_dates": {"flags": off["base_date_flag"].value_counts().to_dict(),
            "min": str(min(d for d in off["base_date"] if d)), "max": str(max(d for d in off["base_date"] if d))}, "regions": region_df.to_dict("records"),
            "official_unlinked_reasons": unlinked_why, "transfer_checks": tc, "same_name_far_apart": sn, "crosswalk": cw_stats, "usage_sources": uinfo, "overlap_rows": len(ov), "usage_year": YEAR,
            "coordinate_priority": "공식 XLSX > 서울 열린데이터광장 마스터 > 카카오 (기존 파일럿 산출물의 좌표는 바꾸지 않음)",
            "usage_policy": "승차·하차 분리. 원천별 관측 기간이 달라 같은 기간처럼 비교하지 않으며 역사 요약은 2025 달력 연도만. 같은 역·월 중복은 운영기관 자체 자료를 대표로 하고 합산하지 않는다.",
            "entrance_note": "공식 XLSX 에는 출구 좌표가 없다. 출구는 기존 카카오 보조 자료(rail_entrances)와 rail_entrance_links 로만 연결한다.",
            "provenance": {"official_xlsx": "국가철도공단 표준데이터 15013205(파일)", "seoul_card": "서울 열린데이터광장 CardSubwayTime", "seoul_daily": "공공데이터포털 15048032",
                           "busan": "공공데이터포털 3057229", "incheon": "공공데이터포털 15004329"}}
    (proc / "rail_national_meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
    for name, value, note in rep:
        print(f"  [{name}] {value}  {note}")
    return meta


def main() -> None:
    argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter).parse_args()
    build()


if __name__ == "__main__":
    main()
