"""지하철·도시철도 위치·이용량 정규화 (1차: 서울 양천·영등포 + 인접 지역, 구역 밖 1.1km 버퍼).

입력(data/raw/rail, 가장 최근 수집분): seoul_master · seoul_card_YYYYMM · kakao_stations · kakao_exits · korail_metro · sr · ktx · daegu_meta
출력(data/processed): rail_stations.parquet(역사×노선) · rail_complexes.parquet(실제 역사 단위) · rail_entrances.parquet(출구) · rail_usage_monthly.parquet(역×노선×월)
                     · rail_hs_usage.parquet(고속철도 별도) · rail_meta.json / outputs/tables: rail_transit_report.csv · rail_source_survey.csv

규칙 (모두 테스트로 지킨다)
- 역 좌표는 서울 열린데이터광장 역사 마스터(공식)가 기준이다. 카카오 지하철역은 좌표 대조용이고, 마스터에 없는 역만 'kakao_local' 로 추가한다(이용량 없음).
- 환승역: 같은 정규화 역명이고 400m 안이면 한 '역사(complex)'로 묶는다. 노선별 행(rail_stations)은 그대로 둔다. 이름이 다른 환승(예: 서로 다른 역명의 연결역)은 묶지 않는다.
- 출구(출입구) 좌표는 카카오 로컬의 '지하철출구' 장소뿐이다(공식 자료 아님·누락 가능). 역 좌표와 출구 좌표는 서로 다른 표(rail_complexes / rail_entrances)에 둔다.
  출구가 하나도 없는 역사는 has_entrance_data=False 이고 '역 중심점 기준'으로만 분석한다.
- 이용량: 서울 교통카드 월별 시간대 승하차 합계. 승차·하차만 있고 환승 칸이 없어 환승은 다루지 않는다. 승차와 하차는 따로 두고 더하지 않는다.
  역×노선×월 행이 완전히 같은 중복(원천이 월을 두 번 담은 경우)은 하나만 남기고 건수를 기록한다. 연결은 (정규화 역명, 노선) 이 맞고 유일한 쌍만 하며 연결 안 된 이용량은 비워 둔다.
- 고속철도(KTX·SRT)는 rail_hs_usage 로 따로 관리하고 도시철도 이용량에 합치지 않는다(역명이 유일할 때만 name_only 로 역사에 연결).
- 버스(bus_*)와는 합치거나 중복 제거하지 않는다. 역 이용량과 버스 이용량은 다른 교통수단의 측정치라 더하지 않는다.
- 반경 N m 계산은 역사 중심점(복수 노선은 평균 좌표)·출구 좌표의 5179 투영 좌표(x_5179, y_5179)로 한다. 직선거리이며 보행거리가 아니다.
실행: .venv/bin/python -m pipelines.transform.build_rail_stations
"""
from __future__ import annotations

import argparse
import calendar
import json
import re
from pathlib import Path

import numpy as np
import pandas as pd

from pipelines.common import config
from pipelines.transform import build_bus_stops as bus

RAW = config.RAW_DIR / "rail"
BUFFER_M = bus.BUFFER_M            # 버스와 같은 수집 범위 — 파일럿 구역 + 1.1km
COMPLEX_MAX_M = 400                # 같은 역명이 이 거리 안이면 같은 역사(환승역)
KAKAO_MATCH_MAX_M = 300            # 마스터 역과 같은 역명의 카카오 역이 이 거리 안이면 같은 역
EXIT_MAX_M = 800                   # 출구가 소속 역 중심에서 이 거리 밖이면 연결하지 않음
YEAR = 2025                        # 버스 이용량 기준연도와 맞춘 대표 집계 연도
RADII_M = (250, 500, 1000)
_PAREN = re.compile(r"\([^)]*\)|（[^）]*）")
_NOISE = re.compile(r"[\s\.·,\-_/]+")
LINE_ALIAS = {"경의선": "경의중앙선", "9호선2~3단계": "9호선(연장)"}   # 이용량 노선명 → 마스터 노선명
OPERATOR_BY_LINE = {   # 원천에 운영기관 열이 없어 노선명으로 대응한 표(확인되지 않은 노선은 비워 둔다)
    "1호선": "서울교통공사", "2호선": "서울교통공사", "3호선": "서울교통공사", "4호선": "서울교통공사", "5호선": "서울교통공사",
    "6호선": "서울교통공사", "7호선": "서울교통공사", "8호선": "서울교통공사",
    "9호선": "서울시메트로9호선", "9호선(연장)": "서울시메트로9호선",
    "인천1호선": "인천교통공사", "인천2호선": "인천교통공사", "공항철도1호선": "공항철도",
    "신림선": "남서울경전철", "우이신설선": "우이신설경전철", "김포골드라인": "김포도시철도",
    "경부선": "한국철도공사", "경인선": "한국철도공사", "경원선": "한국철도공사", "경의중앙선": "한국철도공사", "안산선": "한국철도공사",
    "일산선": "한국철도공사", "중앙선": "한국철도공사", "경춘선": "한국철도공사", "분당선": "한국철도공사", "수인선": "한국철도공사", "서해선": "한국철도공사",
}


# ── 이름·노선 정규화 ──────────────────────────────────────────────────────────────────────────

def norm_name(s) -> str:
    """역명 정규화 — 괄호 부연('대림(구로구청)')·공백·점을 지운다. '역' 글자는 지우지 않는다('역삼'·'역곡')."""
    return _NOISE.sub("", _PAREN.sub("", str(s or ""))).strip()


def norm_line(s) -> str:
    x = _NOISE.sub("", str(s or ""))
    return LINE_ALIAS.get(x, x)


def _latest(prefix: str) -> Path:
    files = sorted(RAW.glob(f"{prefix}_*.json"))
    if not files:
        raise FileNotFoundError(f"data/raw/rail/{prefix}_*.json 이 없습니다 — 먼저 collect_rail_transit 를 실행하세요")
    return files[-1]


def _load(prefix: str) -> tuple[list[dict], dict]:
    env = json.loads(_latest(prefix).read_text(encoding="utf-8"))
    return env["rows"], {k: v for k, v in env.items() if k != "rows"}


def _card_files() -> list[Path]:
    """월별 이용량 파일 — 같은 월이 여러 번 수집됐으면 가장 최근 수집분."""
    by_month: dict[str, Path] = {}
    for p in sorted(RAW.glob("seoul_card_*_*.json")):
        by_month[p.name.split("_")[2]] = p
    return [by_month[m] for m in sorted(by_month)]


# ── 역·노선 ──────────────────────────────────────────────────────────────────────────────────

def normalize_master(rows: list[dict]) -> pd.DataFrame:
    m = pd.DataFrame(rows)
    lat, lon = pd.to_numeric(m["LAT"], errors="coerce"), pd.to_numeric(m["LOT"], errors="coerce")
    out = pd.DataFrame({
        "station_line_id": "SMA:" + m["BLDN_ID"].astype(str), "source": "seoul_master", "station_code": m["BLDN_ID"].astype(str),
        "name": m["BLDN_NM"].astype(str), "name_norm": m["BLDN_NM"].map(norm_name), "line": m["ROUTE"].astype(str), "line_key": m["ROUTE"].map(norm_line),
        "lon": lon, "lat": lat,
    })
    out["coord_ok"] = lon.between(124, 132) & lat.between(33, 39)
    return out


_K_STATION = re.compile(r"^(?P<n>.+?)역\s+(?P<l>\S.*)$")
_K_EXIT = re.compile(r"^(?P<n>.+?)역\s+(?P<l>.+?)\s+(?P<e>\S*출구)$")


def parse_kakao_stations(rows: list[dict]) -> pd.DataFrame:
    out = []
    for d in rows:
        m = _K_STATION.match(d["place_name"].strip())
        name, line = (m["n"], m["l"]) if m else (re.sub(r"역$", "", d["place_name"].strip()), "")
        out.append({"kakao_id": d["id"], "name": name, "name_norm": norm_name(name), "line": line, "line_key": norm_line(line), "lon": float(d["x"]), "lat": float(d["y"])})
    df = pd.DataFrame(out)
    df["coord_ok"] = True
    return df


def merge_kakao_stations(master: pd.DataFrame, kakao: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """카카오 역을 마스터에 맞춘다 → (마스터에 없는 카카오 역(추가 후보), 좌표 대조표). 같은 역명이고 KAKAO_MATCH_MAX_M 안이면 같은 역."""
    mx = master.dropna(subset=["x_5179"])
    cross, extra = [], []
    for k in kakao.itertuples():
        same = mx[mx["name_norm"] == k.name_norm]
        if len(same):
            d = np.hypot(same["x_5179"].to_numpy() - k.x_5179, same["y_5179"].to_numpy() - k.y_5179)
            if d.min() <= KAKAO_MATCH_MAX_M:
                i = int(d.argmin())
                cross.append({"kakao_id": k.kakao_id, "name": k.name, "station_line_id": same.iloc[i]["station_line_id"], "dist_m": round(float(d[i]), 1),
                              "line_agree": bool(same.iloc[i]["line_key"] == k.line_key)})
                continue
        extra.append(k.kakao_id)
    return kakao[kakao["kakao_id"].isin(extra)].copy(), pd.DataFrame(cross)


def build_complexes(sl: pd.DataFrame) -> pd.DataFrame:
    """역사×노선 → 실제 역사. 같은 정규화 역명이고 COMPLEX_MAX_M 안이면 같은 역사(단일 연결 군집, 결정적 순서)."""
    sl = sl.sort_values("station_line_id").reset_index(drop=True)
    parent = list(range(len(sl)))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for _, g in sl.groupby("name_norm", sort=True):
        idx = g.index.to_numpy()
        x, y = g["x_5179"].to_numpy(), g["y_5179"].to_numpy()
        for a in range(len(idx)):
            for b in range(a + 1, len(idx)):
                if np.hypot(x[a] - x[b], y[a] - y[b]) <= COMPLEX_MAX_M:
                    parent[find(idx[b])] = find(idx[a])
    sl = sl.assign(_root=[find(i) for i in range(len(sl))])
    ids = sl.groupby("_root")["station_line_id"].min()
    return sl.assign(complex_id=sl["_root"].map(lambda r: "RC:" + ids[r])).drop(columns="_root")


def summarize_complexes(sl: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for cid, g in sl.groupby("complex_id", sort=True):
        official = g[g["source"] == "seoul_master"]
        base = official if len(official) else g       # 좌표는 공식(마스터) 행이 있으면 그 평균
        lines = sorted(set(g["line"]) - {""})
        rows.append({
            "complex_id": cid, "name": g["name"].iloc[0], "name_norm": g["name_norm"].iloc[0], "lines": "·".join(lines), "n_lines": len(lines),
            "operators": "·".join(sorted({OPERATOR_BY_LINE.get(k, "") for k in g["line_key"]} - {""})), "n_station_lines": len(g),
            "lon": round(float(base["lon"].mean()), 6), "lat": round(float(base["lat"].mean()), 6),
            "coord_source": "seoul_master" if len(official) else "kakao_local", "rail_type": "metro",
            "station_line_ids": json.dumps(sorted(g["station_line_id"]), ensure_ascii=False),
        })
    return pd.DataFrame(rows)


# ── 출구 ─────────────────────────────────────────────────────────────────────────────────────

def parse_kakao_exits(rows: list[dict]) -> pd.DataFrame:
    out = []
    for d in rows:
        m = _K_EXIT.match(d["place_name"].strip())
        if not m:
            continue
        num = re.search(r"(\d+(?:-\d+)?)번", m["e"])
        out.append({"exit_id": "KKO:" + d["id"], "station_name": m["n"], "name_norm": norm_name(m["n"]), "line": m["l"], "line_key": norm_line(m["l"]),
                    "exit_label": m["e"], "exit_no": num.group(1) if num else m["e"].replace("출구", ""),
                    "lon": float(d["x"]), "lat": float(d["y"]), "query_station_id": d.get("query_station_id")})
    df = pd.DataFrame(out)
    if len(df):
        df["coord_ok"] = True
    return df


def link_exits(ex: pd.DataFrame, sl: pd.DataFrame) -> pd.DataFrame:
    """출구 → 같은 정규화 역명의 가장 가까운 역사×노선(EXIT_MAX_M 안). 노선이 같은 후보가 있으면 그쪽을 우선한다."""
    cand_by = {k: g for k, g in sl.groupby("name_norm")}
    sid, basis, dist = [], [], []
    for e in ex.itertuples():
        g = cand_by.get(e.name_norm)
        if g is None:
            sid.append(None); basis.append("no_station"); dist.append(np.nan); continue
        d = np.hypot(g["x_5179"].to_numpy() - e.x_5179, g["y_5179"].to_numpy() - e.y_5179)
        same_line = (g["line_key"] == e.line_key).to_numpy()
        pick = np.where(same_line)[0] if same_line.any() and d[same_line].min() <= EXIT_MAX_M else np.arange(len(g))
        j = pick[int(np.argmin(d[pick]))]
        if d[j] > EXIT_MAX_M:
            sid.append(None); basis.append("too_far"); dist.append(round(float(d[j]), 1)); continue
        sid.append(g.iloc[j]["station_line_id"]); basis.append("line_name" if same_line[j] else "name_only"); dist.append(round(float(d[j]), 1))
    out = ex.assign(station_line_id=sid, link_basis=basis, dist_to_station_m=dist)
    return out


# ── 이용량(서울 교통카드 월별) ───────────────────────────────────────────────────────────────

HOURS = [f"HR_{h}_GET_ON_NOPE" for h in range(24)], [f"HR_{h}_GET_OFF_NOPE" for h in range(24)]


def normalize_card(frames: list[pd.DataFrame]) -> tuple[pd.DataFrame, dict]:
    """월별 파일을 합쳐 (월, 노선, 역) 단위로 승·하차 월 합계를 만든다. 완전히 같은 중복 행은 하나만 남긴다."""
    raw = pd.concat(frames, ignore_index=True)
    n_raw = len(raw)
    raw = raw.drop_duplicates()
    n_exact_dup = n_raw - len(raw)
    key_dup = int(raw.duplicated(["USE_MM", "SBWY_ROUT_LN_NM", "STTN"]).sum())     # 내용이 달라 남은 같은 키 — 0 이어야 함
    raw = raw.drop_duplicates(["USE_MM", "SBWY_ROUT_LN_NM", "STTN"], keep="first")
    on, off = raw[HOURS[0]], raw[HOURS[1]]
    out = pd.DataFrame({
        "ym": raw["USE_MM"].astype(str), "line_raw": raw["SBWY_ROUT_LN_NM"].astype(str), "name_raw": raw["STTN"].astype(str),
        "name_norm": raw["STTN"].map(norm_name), "line_key": raw["SBWY_ROUT_LN_NM"].map(norm_line),
        "boardings": on.sum(axis=1, min_count=24), "alightings": off.sum(axis=1, min_count=24), "job_ymd": raw["JOB_YMD"].astype(str),
    })
    out["days"] = [calendar.monthrange(int(m[:4]), int(m[4:]))[1] for m in out["ym"]]
    info = {"rows_raw": n_raw, "exact_duplicate_rows": n_exact_dup, "same_key_conflicts_kept_first": key_dup,
            "rows_with_missing_hours": int(out["boardings"].isna().sum() + out["alightings"].isna().sum()),
            "months": sorted(out["ym"].unique())}
    return out.sort_values(["ym", "line_raw", "name_raw"]).reset_index(drop=True), info


def link_usage(usage_keys: pd.DataFrame, master: pd.DataFrame) -> pd.DataFrame:
    """이용량 (역명,노선) → 마스터 역사×노선. exact(역명+노선) → name_unique(역명만 맞고 후보 하나). 한 역사×노선에 이용량 키가 둘 이상 붙으면 연결하지 않는다."""
    by_name = {k: g for k, g in master.groupby("name_norm")}
    res = []
    for u in usage_keys.itertuples():
        g = by_name.get(u.name_norm)
        if g is None:
            res.append((u.line_key, u.name_norm, None, "no_station")); continue
        ex = g[g["line_key"] == u.line_key]
        if len(ex) == 1:
            res.append((u.line_key, u.name_norm, ex.iloc[0]["station_line_id"], "exact"))
        elif len(ex) > 1:
            res.append((u.line_key, u.name_norm, None, "ambiguous"))
        elif len(g) == 1:
            res.append((u.line_key, u.name_norm, g.iloc[0]["station_line_id"], "name_unique"))
        else:
            res.append((u.line_key, u.name_norm, None, "ambiguous"))
    out = pd.DataFrame(res, columns=["line_key", "name_norm", "station_line_id", "link_basis"])
    dup = out["station_line_id"].notna() & out.duplicated("station_line_id", keep=False)
    out.loc[dup, ["station_line_id", "link_basis"]] = [None, "many_usage_keys"]
    return out


def period_average(m: pd.DataFrame, months: list[str]) -> pd.DataFrame:
    """역사×노선별 지정 월 구간의 하루 평균 승·하차 = 월 합계의 합 ÷ 관측된 달의 일수. 관측 월 수도 함께."""
    sub = m[m["ym"].isin(months)]
    g = sub.groupby("station_line_id").agg(on=("boardings", "sum"), off=("alightings", "sum"), days=("days", "sum"), n=("ym", "nunique"))
    return g.assign(avg_on=(g["on"] / g["days"]).round(1), avg_off=(g["off"] / g["days"]).round(1))


def trailing_months(months: list[str], n: int = 12) -> list[str]:
    return sorted(months)[-n:]


# ── 반경 구조 ────────────────────────────────────────────────────────────────────────────────

def radius_metrics(cx: np.ndarray, cy: np.ndarray, px: float, py: float, radii=RADII_M) -> dict:
    """한 지점(5179 m)의 반경별 개수와 최근접 직선거리(m). 입력은 역사 중심점 또는 출구 좌표 배열."""
    if len(cx) == 0:
        return {"counts": {r: 0 for r in radii}, "nearest_m": None}
    d = np.hypot(cx - px, cy - py)
    return {"counts": {r: int((d <= r).sum()) for r in radii}, "nearest_m": round(float(d.min()), 1)}


# ── 고속철도(별도 유형) ──────────────────────────────────────────────────────────────────────

def build_hs(sr: list[dict], ktx: list[dict], complexes: pd.DataFrame) -> pd.DataFrame:
    s = pd.DataFrame(sr)
    s_year = int(s["집계년도"].max())
    s = s[s["집계년도"] == s_year]
    sr_out = s.groupby("역명").agg(on=("승차인원", "sum"), off=("하차인원", "sum"), months=("집계월", "nunique")).reset_index()
    sr_days = sum(calendar.monthrange(s_year, int(mo))[1] for mo in sorted(s["집계월"].unique()))
    sr_out = pd.DataFrame({"operator": "SR", "station_name": sr_out["역명"], "period": f"{s_year}-01~{s_year}-{int(s['집계월'].max()):02d}", "months": sr_out["months"],
                           "boardings_total": sr_out["on"], "alightings_total": sr_out["off"], "days": sr_days})
    k = pd.DataFrame(ktx)
    k_year = k["운행년월"].str[:4].astype(int).max()
    k = k[k["운행년월"].str[:4].astype(int) == k_year]
    k = k.assign(on=k["상행_승차인원수"] + k["하행_승차인원수"], off=k["상행_하차인원수"] + k["하행_하차인원수"])
    kg = k.groupby("정차역").agg(on=("on", "sum"), off=("off", "sum"), months=("운행년월", "nunique")).reset_index()
    k_days = sum(calendar.monthrange(k_year, int(mo[5:]))[1] for mo in sorted(k["운행년월"].unique()))
    ktx_out = pd.DataFrame({"operator": "KORAIL_KTX", "station_name": kg["정차역"], "period": f"{k_year}-01~{k_year}-12", "months": kg["months"],
                            "boardings_total": kg["on"], "alightings_total": kg["off"], "days": k_days})
    hs = pd.concat([sr_out, ktx_out], ignore_index=True)
    hs["name_norm"] = hs["station_name"].map(norm_name)
    hs["avg_daily_boardings"] = (hs["boardings_total"] / hs["days"]).round(1)
    hs["avg_daily_alightings"] = (hs["alightings_total"] / hs["days"]).round(1)
    cnt = complexes.groupby("name_norm")["complex_id"].agg(["count", "first"])
    uniq = cnt[cnt["count"] == 1]["first"]
    hs["complex_id"] = hs["name_norm"].map(uniq)
    hs["link_basis"] = np.where(hs["complex_id"].notna(), "name_only", "none")
    hs["rail_type"] = "high_speed"
    return hs.drop(columns="days").sort_values(["operator", "station_name"]).reset_index(drop=True)


# ── 자료 조사표(공식 제공처·최신 기준일·제공 방식) ──────────────────────────────────────────

SURVEY = [
    # (운영기관/자료, 제공처, 최신 기준일, 제공 방식, 이번 수집 상태)
    ("서울(1~9호선·수도권 전철) 역 좌표", "서울 열린데이터광장 subwayStationMaster", "상시", "API(.env 서울 키)", "수집함 — 784개 역사×노선"),
    ("서울(수도권 전철) 역별 승하차", "서울 열린데이터광장 CardSubwayTime", "2026-09(월별)", "API(.env 서울 키)", "수집함 — 2025-01~2026-09"),
    ("출입구(출구) 좌표", "카카오 로컬 API(지하철출구)", "상시", "API(.env 카카오 키) — 공식 철도기관 자료 아님", "수집함 — 파일럿+버퍼만"),
    ("전국 도시철도 역사정보(좌표 포함)", "국가철도공단 표준데이터 15013205", "2024-12-31", "파일(XLSX)만 — OpenAPI 아님·로그인 필요", "미수집 — 직접 내려받아야 함"),
    ("한국철도공사 광역철도 역별 승하차", "공공데이터포털 15100373", "2021-12-31(연 단위)", "API(승인됨)", "수집함 — 오래돼 참고용(서울 카드 자료와 합치지 않음)"),
    ("KTX 상하행 역별 승하차", "공공데이터포털 15108119", "2023-12(월별)", "API(승인됨)", "수집함 — 고속철도 별도 유형"),
    ("SRT 월별역별 승하차", "공공데이터포털 15131754", "2025-09(월별)", "API(승인됨)", "수집함 — 고속철도 별도 유형"),
    ("대구교통공사 역별일별시간별 승하차", "공공데이터포털 15002503", "2026-08(월별)", "API(승인됨, 월 4~5만 행)", "메타만 — 파일럿 밖이라 이용량 미수집"),
    ("인천교통공사 일별역별시간대별 이용인원", "공공데이터포털(파일)", "2026-04", "파일(CSV)", "미수집 — API 확인 안 됨, 서울 마스터가 인천 역 좌표는 포함"),
    ("부산교통공사 시간대별 승하차", "공공데이터포털 3057229(파일)", "2026-06", "파일(CSV)", "미수집 — 호선별 게이트 합산 주의사항 있음"),
    ("대전교통공사 월별 역별 승하차", "공공데이터포털(파일)", "확인 필요", "파일", "미수집 — 기간 확인 필요"),
    ("광주도시철도공사 역별 승하차", "-", "확인 안 됨", "찾지 못함", "미수집 — 공식 자료 확인 필요"),
    ("국토교통부 TAGO 지하철정보(SubwayInfoService)", "공공데이터포털", "-", "API", "사용 불가 — 호출 시 '서비스가 없거나 폐기됨'(2026-10-15)"),
]


# ── 조립 ────────────────────────────────────────────────────────────────────────────────────

def _project(df: pd.DataFrame) -> pd.DataFrame:
    return bus.add_geography(df.reset_index(drop=True))


def build() -> dict:
    # 1) 역사×노선 + 좌표 대조
    m_rows, m_meta = _load("seoul_master")
    master = _project(normalize_master(m_rows))
    k_rows, k_meta = _load("kakao_stations")
    kakao = _project(parse_kakao_stations(k_rows))
    extra, cross = merge_kakao_stations(master, kakao)
    extra = extra.assign(station_line_id="KKO:" + extra["kakao_id"], source="kakao_local", station_code=extra["kakao_id"])
    allsl = pd.concat([master, extra.drop(columns="kakao_id")], ignore_index=True)
    in_scope = allsl["coord_ok"] & (allsl["dist_to_pilot_m"] <= BUFFER_M)
    sl = allsl[in_scope].reset_index(drop=True)
    sl = build_complexes(sl)
    sl["operator"] = sl["line_key"].map(OPERATOR_BY_LINE)
    sl["rail_type"] = "metro"

    # 2) 이용량 연결
    frames = []
    for p in _card_files():
        frames.append(pd.DataFrame(json.loads(p.read_text(encoding="utf-8"))["rows"]))
    usage, card_info = normalize_card(frames)
    keys = usage[["line_key", "name_norm"]].drop_duplicates().reset_index(drop=True)
    lk = link_usage(keys, master)
    usage = usage.merge(lk, on=["line_key", "name_norm"], how="left")
    months = card_info["months"]
    year_months = [m for m in months if m.startswith(str(YEAR))]
    t12 = trailing_months(months, 12)
    linked = usage[usage["station_line_id"].notna()]
    y_avg, t_avg = period_average(linked, year_months), period_average(linked, t12)
    sl = sl.merge(lk.dropna(subset=["station_line_id"])[["station_line_id", "link_basis"]].rename(columns={"link_basis": "usage_link"}), on="station_line_id", how="left")
    sl["usage_link"] = sl["usage_link"].fillna(pd.Series(np.where(sl["source"] == "kakao_local", "no_usage_source", "no_usage_row"), index=sl.index))
    for tag, avg in ((str(YEAR), y_avg), ("t12", t_avg)):
        sl[f"avg_daily_boardings_{tag}"] = sl["station_line_id"].map(avg["avg_on"])
        sl[f"avg_daily_alightings_{tag}"] = sl["station_line_id"].map(avg["avg_off"])
        sl[f"months_observed_{tag}"] = sl["station_line_id"].map(avg["n"]).fillna(0).astype(int)

    # 3) 역사 단위 + 출구
    cx = summarize_complexes(sl)
    cx = _project(cx.assign(coord_ok=True))
    cx["in_scope"] = cx["dist_to_pilot_m"] <= BUFFER_M
    g = sl.groupby("complex_id")
    cx["lines_total"] = cx["complex_id"].map(g["station_line_id"].count())
    cx["lines_linked"] = cx["complex_id"].map(g["usage_link"].agg(lambda s: int(s.isin(["exact", "name_unique"]).sum())))
    cx["usage_state"] = np.select([cx["lines_linked"] == 0, cx["lines_linked"] == cx["lines_total"]], ["none_linked", "all_linked"], "partial")
    for tag in (str(YEAR), "t12"):
        for kind in ("boardings", "alightings"):
            col = f"avg_daily_{kind}_{tag}"
            s = g[col].sum(min_count=1)
            cx[col] = cx["complex_id"].map(s).round(1)
        cx[f"months_observed_{tag}_min"] = cx["complex_id"].map(g[f"months_observed_{tag}"].min())

    e_rows, e_meta = _load("kakao_exits")
    ex = parse_kakao_exits(e_rows)
    n_exit_raw = len(ex)
    ex = _project(ex) if len(ex) else ex
    ex = link_exits(ex, sl) if len(ex) else ex
    ex_in = ex[(ex["dist_to_pilot_m"] <= BUFFER_M)] if len(ex) else ex
    ex_ok = ex_in[ex_in["station_line_id"].notna()].copy() if len(ex) else ex
    if len(ex_ok):
        ex_ok["complex_id"] = ex_ok["station_line_id"].map(sl.set_index("station_line_id")["complex_id"])
        cxy = cx.set_index("complex_id")[["x_5179", "y_5179"]]
        ex_ok["dist_to_complex_m"] = [round(float(np.hypot(r.x_5179 - cxy.loc[r.complex_id, "x_5179"], r.y_5179 - cxy.loc[r.complex_id, "y_5179"])), 1) for r in ex_ok.itertuples()]
        ex_ok = ex_ok.sort_values(["complex_id", "exit_no", "dist_to_complex_m", "exit_id"]).drop_duplicates(["complex_id", "exit_label"]).reset_index(drop=True)
    cnt = ex_ok.groupby("complex_id")["exit_id"].count() if len(ex_ok) else pd.Series(dtype=int)
    cx["n_exits"] = cx["complex_id"].map(cnt).fillna(0).astype(int)
    cx["has_entrance_data"] = cx["n_exits"] > 0
    cx["distance_basis"] = np.where(cx["has_entrance_data"], "station_center_and_entrances", "station_center_only")

    # 4) 고속철도(별도)
    s_rows, s_meta = _load("sr")
    t_rows, t_meta = _load("ktx")
    hs = build_hs(s_rows, t_rows, cx[cx["in_scope"]])
    kor_rows, kor_meta = _load("korail_metro")
    dg_rows, dg_meta = _load("daegu_meta")

    # 5) 저장
    proc = config.PROCESSED_DIR
    cols_sl = ["station_line_id", "complex_id", "source", "station_code", "name", "name_norm", "line", "line_key", "operator", "rail_type", "lon", "lat", "x_5179", "y_5179",
               "gu_code", "in_pilot", "dist_to_pilot_m", "usage_link"] + [c for c in sl.columns if c.startswith(("avg_daily_", "months_observed_"))]
    sl_out = sl[cols_sl].sort_values("station_line_id").reset_index(drop=True)
    cx_out = cx[cx["in_scope"]].sort_values("complex_id").reset_index(drop=True)
    en_out = ex_ok[["exit_id", "complex_id", "station_line_id", "station_name", "line", "exit_label", "exit_no", "lon", "lat", "x_5179", "y_5179", "dist_to_complex_m", "link_basis"]] if len(ex_ok) else pd.DataFrame()
    use_out = usage[["ym", "station_line_id", "link_basis", "line_raw", "name_raw", "boardings", "alightings", "days", "job_ymd"]].rename(columns={"link_basis": "usage_link"})
    sl_out.to_parquet(proc / "rail_stations.parquet", index=False)
    cx_out.to_parquet(proc / "rail_complexes.parquet", index=False)
    en_out.to_parquet(proc / "rail_entrances.parquet", index=False)
    use_out.to_parquet(proc / "rail_usage_monthly.parquet", index=False)
    hs.to_parquet(proc / "rail_hs_usage.parquet", index=False)

    # 6) 보고
    scope_sl = sl_out
    in_scope_usage_keys = lk[lk["station_line_id"].isin(scope_sl["station_line_id"])]
    n_sl_master_scope = int((scope_sl["source"] == "seoul_master").sum())
    linked_sl = int(scope_sl["usage_link"].isin(["exact", "name_unique"]).sum())
    last_month = months[-1]
    kc = cross
    rep = [
        ("역사×노선 행(수집 범위 안)", len(scope_sl), f"파일럿 구역 + {BUFFER_M}m. 서울 마스터 {n_sl_master_scope}행 + 카카오에만 있는 역 {int((scope_sl['source'] == 'kakao_local').sum())}행"),
        ("마스터 전체 역사×노선 행", len(master), "수도권 전체(범위 밖 포함) — 수집 범위 밖은 이 표에 넣지 않음"),
        ("역사(환승역 묶음) 수", len(cx_out), f"환승 역사(2개 노선 이상) {int((cx_out['n_lines'] >= 2).sum())}곳; 묶음 기준: 같은 정규화 역명 + {COMPLEX_MAX_M}m"),
        ("파일럿 구 안 역사 수", int(cx_out["in_pilot"].sum()), ""),
        ("카카오 역 수 / 마스터와 같은 역으로 맞춘 수", f"{len(kakao)} / {len(kc)}", f"같은 역명 {KAKAO_MATCH_MAX_M}m 안. 마스터에 없어 추가한 역 {len(extra)}곳"),
        ("카카오-마스터 좌표 차이(m) 중앙값·최대", f"{kc['dist_m'].median():.1f} / {kc['dist_m'].max():.1f}" if len(kc) else "-", "공식 좌표 대조(같은 역으로 맞춘 쌍)"),
        ("카카오 노선명이 마스터와 다른 쌍", int((~kc["line_agree"]).sum()) if len(kc) else 0, "노선 표기 차이(예: 수인분당선) — 위치로만 같은 역 판단"),
        ("출구 원본 / 범위 안 소속 확인 / 연결 못 함", f"{n_exit_raw} / {len(en_out)} / {len(ex_in) - len(ex_ok) if len(ex) else 0}", "카카오 '지하철출구'. 같은 역사·같은 출구 표기는 하나로 줄임"),
        ("출구 자료가 있는 역사 / 없는 역사", f"{int(cx_out['has_entrance_data'].sum())} / {int((~cx_out['has_entrance_data']).sum())}", "없으면 역 중심점 기준(distance_basis=station_center_only)"),
        ("이용량 파일 월 수 / 기준일(최신 월)", f"{len(months)} / {last_month}", f"{months[0]}~{months[-1]}. 월별 파일 행 {card_info['rows_raw']:,}"),
        ("이용량 완전 중복 행(제거)", card_info["exact_duplicate_rows"], "원천이 같은 월을 두 번 담은 경우(역·노선·월 키와 값이 전부 같음). 키 충돌(값이 다른 중복) " + str(card_info["same_key_conflicts_kept_first"]) + "건"),
        ("이용량 시간대 결측 행", card_info["rows_with_missing_hours"], "하나라도 비면 그 달 합계를 만들지 않음(0 으로 채우지 않음)"),
        ("이용량 키(역명,노선) 연결 성공 / 전체", f"{int(lk['station_line_id'].notna().sum())} / {len(lk)}", f"연결 방식: exact {int((lk['link_basis'] == 'exact').sum())}, name_unique {int((lk['link_basis'] == 'name_unique').sum())}, 미연결 {int(lk['station_line_id'].isna().sum())}"),
        ("범위 안 마스터 역사×노선 이용량 연결률", f"{linked_sl}/{n_sl_master_scope} = {linked_sl / max(n_sl_master_scope, 1):.1%}", f"미연결(이용량 행 없음) {n_sl_master_scope - linked_sl}행 → 비워 둠"),
        (f"{YEAR}년 12개월 모두 관측된 역사×노선", int((scope_sl[f"months_observed_{YEAR}"] == 12).sum()), f"관측 월이 모자라면 관측된 달의 일수로 나눈 하루 평균(months_observed_{YEAR} 로 확인)"),
        ("역사 이용량 상태 all_linked / partial / none_linked", " / ".join(str(int((cx_out["usage_state"] == s).sum())) for s in ("all_linked", "partial", "none_linked")), "partial 은 일부 노선만 연결된 '관측된 부분 합계'"),
        ("고속철도 별도 표 행 / 역사에 이름으로 연결", f"{len(hs)} / {int((hs['link_basis'] == 'name_only').sum())}", "SR·KTX. 도시철도 이용량에 더하지 않음"),
        ("한국철도공사 광역철도 연 이용량(2021) 역 수", len(kor_rows), f"기준 {kor_meta.get('version')}. 서울 카드 자료와 합치지 않음(수집만)"),
        ("대구교통공사 최신 버전·원천 건수", f"{dg_meta.get('version')} / {dg_meta.get('source_total_count')}", "파일럿 밖이라 이용량은 받지 않음"),
    ]
    pd.DataFrame(rep, columns=["항목", "값", "비고"]).to_csv(config.TABLES_DIR / "rail_transit_report.csv", index=False, encoding="utf-8-sig")
    pd.DataFrame(SURVEY, columns=["자료", "제공처", "최신 기준일", "제공 방식", "이번 수집 상태"]).to_csv(config.TABLES_DIR / "rail_source_survey.csv", index=False, encoding="utf-8-sig")
    meta = {
        "buffer_m": BUFFER_M, "complex_max_m": COMPLEX_MAX_M, "usage_year": YEAR, "usage_latest_month": last_month, "usage_months": [months[0], months[-1]],
        "master_collected_at": str(m_meta.get("collected_at", ""))[:10], "kakao_collected_at": str(k_meta.get("collected_at", ""))[:10],
        "extent": f"파일럿 두 구(양천·영등포) 경계 밖 {BUFFER_M / 1000:g}km 이내의 수도권 전철 역사",
        "stations_scope": len(scope_sl), "complexes_scope": len(cx_out), "entrances": len(en_out),
        "entrance_note": "출구 좌표는 카카오 로컬(공식 철도기관 자료 아님)이며 누락될 수 있다. 출구가 없는 역사는 역 중심점 기준으로만 분석한다.",
        "usage_note": "서울 교통카드 월별 시간대 승하차 합계. 승차·하차만 있고 환승 칸이 없다. 승차와 하차를 더하지 않으며 연결된 노선만의 관측된 부분 합계다.",
        "bus_overlap_policy": "역 이용량과 버스 이용량은 다른 교통수단 측정치라 합치지 않는다. 버스정류장 표(bus_*)와 병합·중복 제거하지 않는다.",
        "high_speed_note": "KTX·SRT 이용량은 rail_hs_usage 로 별도 관리하고 도시철도 이용량에 더하지 않는다.",
        "exact_duplicate_rows_removed": card_info["exact_duplicate_rows"], "usage_links": {"exact": int((lk["link_basis"] == "exact").sum()), "name_unique": int((lk["link_basis"] == "name_unique").sum())},
    }
    (proc / "rail_meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    for name, value, note in rep:
        print(f"  [{name}] {value}  {note}")
    return meta


def main() -> None:
    argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter).parse_args()
    build()


if __name__ == "__main__":
    main()
