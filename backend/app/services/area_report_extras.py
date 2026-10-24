"""상권분석 보고서의 부가 자료 — ① 외식 업종별 비교표 ② 영업 기간·생존.

① 업종별 비교표: 그 행정동·상권의 서울시 외식 10개 업종을 같은 최근 분기 기준으로 나란히 놓는다(점포 수·점포당 월평균 추정매출·
   객단가·점포당 하루 평균 결제 건수·분기 개·폐업률). 순위·점수·추천은 만들지 않는다.
   점포당 월평균 추정매출 = 분기 추정매출 ÷ 점포 수 ÷ 3, 객단가 = 추정매출 ÷ 결제 건수, 점포당 하루 결제 건수 = 결제 건수 ÷ 점포 수 ÷ 분기 일수.
   점포 3곳 미만은 비율·평균 값을 비우고(자료 없음), 10곳 미만은 '참고용'으로 표시한다.
② 영업 기간·생존:
   - 서울시 상권변화지표(행정동 단위·전 업종): 변화 단계와 운영·폐업 점포의 평균 영업 개월(서울시 평균과 함께). 상권에는 같은 표가 없어
     소속 행정동 값을 '소속 행정동 기준'이라고 밝혀 보여 준다.
   - 인허가 기준(선택 업종 범위, 단위 경계 안): 영업 중인 가게의 업력 분포, 최근 5년 폐업 가게의 평균 영업 기간, 인허가 후 3년 이내 폐업 비율
     (관찰기간을 맞춘 집단, nearby_analysis.cohort_close_rate 와 같은 정의). 원천이 폐업일자를 주지 않거나 표본이 부족하면 '자료 없음'이다.
     인허가일~폐업일이 30일 이하인 건은 백화점 팝업 등 임시 영업 등록이 많아(예: 영등포동 최근 5년 폐업 1,926건 중 1,038건) 영업 기간·폐업 비율을 왜곡하므로
     두 지표에서 빼고 그 건수를 보고한다. 영업 중 업력 분포에는 영향이 없다.
결측은 0 으로 바꾸지 않는다. 이 값들은 과거 통계이며 특정 가게의 폐업 가능성이나 창업 성공 가능성이 아니다.
"""
from __future__ import annotations

from datetime import date
from functools import lru_cache

import numpy as np
import pandas as pd
import shapely
from shapely.geometry import shape

from app.services import data_store, food_map, nearby_analysis, store_churn

LEVELS = ("dong", "trdar")
MIN_RATE_STORES = 3        # 점포가 이보다 적으면 비율·평균을 비교하지 않는다(보고서의 다른 비교와 같은 기준)
MIN_REFERENCE_STORES = 10  # 점포가 이보다 적으면 '참고용'
MIN_SAMPLE = 5             # 업력·영업 기간 중앙값을 말하려면 필요한 최소 인허가 수
RECENT_CLOSE_YEARS = 5
SHORT_LIVED_DAYS = 30      # 인허가일~폐업일이 이 이하면 팝업·임시 영업 등록으로 보고 영업 기간·폐업 비율에서 뺀다(건수는 응답에 기록)
AGE_BANDS = [("1년 미만", 0, 1), ("1~3년", 1, 3), ("3~5년", 3, 5), ("5~10년", 5, 10), ("10년 이상", 10, 1000)]
DAYS_PER_YEAR = 365.25


def _num(v, nd: int = 1) -> float | None:
    return None if v is None or pd.isna(v) else round(float(v), nd)


def _days_in_quarter(q: str) -> int:
    p = pd.Period(f"{q[:4]}Q{q[4:]}", freq="Q")
    return int((p.end_time.normalize() - p.start_time.normalize()).days + 1)


# ── ① 업종별 비교표 ───────────────────────────────────────────────────────────

def industry_comparison(level: str, code: str, svc: str | None = None) -> dict:
    path, key = ("trdar_industry_sales.parquet", "trdar_cd") if level == "trdar" else ("dong_industry_sales.parquet", "adongCd")
    df = data_store.load_parquet(path)
    df = df.loc[df["svc_cd"].str.startswith(food_map.FOOD_SVC_PREFIX) & (df[key] == code)]
    if df.empty:
        return {"status": "unavailable", "quarter": None, "quarter_label": None, "rows": [], "total": None,
                "message": "이 지역의 외식 업종별 매출·점포 자료가 없습니다."}
    latest = str(df["quarter"].max())
    g = df.loc[df["quarter"] == latest].sort_values("svc_cd")
    days = _days_in_quarter(latest)
    rows = []
    for r in g.itertuples():
        stores = _num(r.stores, 0)
        enough = stores is not None and stores >= MIN_RATE_STORES
        sales_ok = enough and pd.notna(r.sales_q) and r.sales_q > 0
        tx_ok = sales_ok and pd.notna(r.tx_count_q) and r.tx_count_q > 0
        note = None
        if stores is not None and stores < MIN_RATE_STORES:
            note = f"점포 {int(stores)}곳 — 3곳 미만이라 비교하지 않음"
        elif stores is not None and stores < MIN_REFERENCE_STORES:
            note = f"점포 {int(stores)}곳 — 참고용(10곳 미만)"
        rows.append({
            "svc_cd": r.svc_cd, "svc_nm": r.svc_nm, "stores": stores,
            "per_store_month": _num(r.sales_q / r.stores / 3, 0) if sales_ok else None,
            "ticket": _num(r.sales_q / r.tx_count_q, 0) if tx_ok else None,
            "daily_tx_per_store": _num(r.tx_count_q / r.stores / days, 1) if tx_ok else None,
            "close_rate": _num(r.close_rate, 1) if enough and pd.notna(r.close_rate) else None,
            "open_rate": _num(r.open_rate, 1) if enough and pd.notna(r.open_rate) else None,
            "selected": svc is not None and r.svc_cd == svc, "note": note,
        })
    both = g.loc[g["sales_q"].notna() & (g["sales_q"] > 0) & g["stores"].notna() & (g["stores"] > 0)]
    total = {"stores": _num(g["stores"].sum(), 0),
             "per_store_month": _num(both["sales_q"].sum() / both["stores"].sum() / 3, 0) if len(both) else None,
             "used": int(len(both)), "of": int(len(g))}
    return {"status": "ok", "quarter": latest, "quarter_label": store_churn.quarter_label(latest), "days": days, "rows": rows, "total": total,
            "source": "서울시 상권분석서비스(추정매출·점포)",
            "basis": "점포당 월평균 추정매출 = 분기 추정매출 ÷ 점포 수 ÷ 3 · 객단가 = 추정매출 ÷ 결제 건수 · 하루 결제 건수 = 결제 건수 ÷ 점포 수 ÷ 분기 일수. "
                     "카드 결제 기반 추정이라 현금·배달 매출이 빠져 있고, 업종별 순위나 추천이 아닙니다."}


# ── ② 영업 기간·생존 ──────────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def _trdar_lonlat() -> dict[str, object]:
    gj = data_store.load_json("trdar_areas.geojson")
    return {str(f["properties"]["trdar_cd"]): shape(f["geometry"]) for f in gj["features"]}


def _boundary(level: str, code: str):
    return _trdar_lonlat().get(code) if level == "trdar" else food_map._dong_shapes().get(code)


def change_index(level: str, code: str) -> dict | None:
    """서울시 상권변화지표(행정동·전 업종). 상권은 소속 행정동 값을 쓰고 그렇다고 밝힌다."""
    ci = data_store.load_parquet("seoul_change_index.parquet")
    dong, scope = code, "행정동"
    if level == "trdar":
        ta = data_store.load_parquet("trdar_areas.parquet").set_index("trdar_cd")
        if code not in ta.index:
            return None
        dong, scope = str(ta.loc[code, "adongCd"]), "소속 행정동"
    sub = ci.loc[ci["ADSTRD_CD"].astype(str) == dong]
    if sub.empty:
        return None
    last = sub.sort_values("STDR_YYQU_CD").iloc[-1]
    q = str(last["STDR_YYQU_CD"])
    return {"scope": scope, "dong_name": str(last["ADSTRD_CD_NM"]), "quarter": q, "quarter_label": store_churn.quarter_label(q),
            "stage": None if pd.isna(last["TRDAR_CHNGE_IX_NM"]) else str(last["TRDAR_CHNGE_IX_NM"]),
            "open_months": _num(last["OPR_SALE_MT_AVRG"], 0), "close_months": _num(last["CLS_SALE_MT_AVRG"], 0),
            "seoul_open_months": _num(last["SU_OPR_SALE_MT_AVRG"], 0), "seoul_close_months": _num(last["SU_CLS_SALE_MT_AVRG"], 0),
            "note": "서울시 상권변화지표 — 행정동 안 전 업종 기준이며, 운영 영업 개월은 영업 중인 점포, 폐업 영업 개월은 폐업한 점포의 평균입니다."}


def _license_scope(svc: str | None, scls: str | None) -> tuple[list[tuple[tuple[str, ...], tuple[str, ...] | None]], str]:
    """선택한 업종 범위 → (인허가 원천 코드, 업태) 묶음. 업종 대응표에서 '인허가 이력 연결' 상태인 소분류만 쓴다."""
    tax = data_store.load_parquet("industry_taxonomy.parquet")
    xw = data_store.load_parquet("sales_industry_crosswalk.parquet")
    if scls:
        rows, label = tax.loc[tax["indsSclsCd"] == scls], "선택한 세부 업종"
    elif svc:
        rows, label = tax.loc[tax["indsSclsCd"].isin(xw.loc[xw["svc_cd"] == svc, "indsSclsCd"])], "선택한 업종"
    else:
        rows, label = tax.loc[tax["indsSclsCd"].isin(xw.loc[xw["svc_cd"].str.startswith(food_map.FOOD_SVC_PREFIX), "indsSclsCd"])], "외식 전체"
    rows = rows.loc[rows["status"] == "connected"]
    seen, out = set(), []
    for r in rows.itertuples():
        codes = tuple(str(c) for c in r.license_codes) if r.license_codes is not None else ()
        uptae = tuple(str(u) for u in r.uptae) if r.uptae is not None else None
        if codes and (codes, uptae) not in seen:
            seen.add((codes, uptae))
            out.append((codes, uptae))
    return out, label


def _bands(ages: pd.Series) -> list[dict]:
    n = len(ages)
    return [{"label": lab, "count": int(((ages >= lo) & (ages < hi)).sum()),
             "pct": _num(((ages >= lo) & (ages < hi)).sum() / n * 100, 1) if n else None} for lab, lo, hi in AGE_BANDS]


def license_survival(level: str, code: str, svc: str | None, scls: str | None) -> dict:
    sh = _boundary(level, code)
    scopes, label = _license_scope(svc, scls)
    base = {"scope_label": label}
    if sh is None or not scopes:
        return {**base, "status": "unavailable", "message": "이 업종 범위는 인허가 이력과 연결되지 않았거나 경계 자료가 없습니다."}
    lic = data_store.load_parquet("licenses.parquet")
    mask = pd.Series(False, index=lic.index)
    for codes, uptae in scopes:
        m = lic["license_code"].isin(codes)
        mask |= (m & lic["uptae"].isin(uptae)) if uptae else m
    scope = lic.loc[mask].drop_duplicates("dup_group")
    no_coord = int(scope["lon"].isna().sum())
    geo = scope.dropna(subset=["lon", "lat"])
    within = geo.loc[shapely.contains_xy(sh, geo["lon"].to_numpy(), geo["lat"].to_numpy())] if len(geo) else geo
    all_codes = sorted({c for codes, _ in scopes for c in codes})
    src = data_store.load_parquet("license_sources.parquet")
    src = src.loc[src["license_code"].isin(all_codes)]
    as_of = date.fromisoformat(src["collected_at"].min()) if len(src) else date.today()
    closures_available = bool(len(src)) and bool(src["has_close_date"].all())
    out = {**base, "status": "ok", "as_of": as_of.isoformat(), "total_records": int(len(within)), "no_coord": no_coord,
           "no_coord_pct": _num(no_coord / len(scope) * 100, 1) if len(scope) else None,
           "source": "서울시 LOCALDATA 인허가", "closures_available": closures_available}
    ts = pd.Timestamp(as_of)
    active = within.loc[within["status_norm"].isin(nearby_analysis.ACTIVE) & within["permit_date"].notna()]
    ages = (ts - active["permit_date"]).dt.days / DAYS_PER_YEAR
    ages = ages[ages >= 0]
    out["active"] = {"count": int(len(ages)), "median_years": _num(ages.median()) if len(ages) >= MIN_SAMPLE else None,
                     "mean_years": _num(ages.mean()) if len(ages) >= MIN_SAMPLE else None, "bands": _bands(ages) if len(ages) else [],
                     "enough": len(ages) >= MIN_SAMPLE}
    if closures_available:
        span = (within["close_date"] - within["permit_date"]).dt.days
        short = (within["status_norm"] == "closed") & within["close_date"].notna() & (span >= 0) & (span <= SHORT_LIVED_DAYS)
        out["short_lived_excluded"] = int(short.sum())
        out["short_lived_days"] = SHORT_LIVED_DAYS
        within = within.loc[~short]
        closed = within.loc[(within["status_norm"] == "closed") & within["close_date"].notna() & within["permit_date"].notna()
                            & (within["close_date"] >= within["permit_date"])]
        recent = closed.loc[closed["close_date"] >= ts - pd.DateOffset(years=RECENT_CLOSE_YEARS)]
        dur = (recent["close_date"] - recent["permit_date"]).dt.days / DAYS_PER_YEAR
        out["closed"] = {"window_years": RECENT_CLOSE_YEARS, "count": int(len(dur)), "enough": len(dur) >= MIN_SAMPLE,
                         "median_years": _num(dur.median()) if len(dur) >= MIN_SAMPLE else None,
                         "mean_years": _num(dur.mean()) if len(dur) >= MIN_SAMPLE else None}
        c = nearby_analysis.cohort_close_rate(within, as_of)
        out["cohort"] = {k: c.get(k) for k in ("status", "rate", "numerator", "denominator", "horizon_years", "cohort_permit_from", "cohort_permit_to", "message")}
    else:
        out["closed"] = None
        out["cohort"] = None
        out["message"] = "이 업종의 인허가 원천은 폐업일자를 제공하지 않아 폐업 가게의 영업 기간과 폐업 비율을 계산할 수 없습니다."
    return out


def extras(level: str, code: str, svc: str | None, scls: str | None) -> dict:
    if level not in LEVELS:
        raise ValueError(f"level 은 {LEVELS} 중 하나여야 합니다")
    food_map.validate_filter(svc, scls)
    if code not in food_map._units()[level].set_index("code").index:
        raise KeyError(code)
    return {"level": level, "code": code,
            "industry": industry_comparison(level, code, svc),
            "change_index": change_index(level, code),
            "license": license_survival(level, code, svc, scls),
            "disclaimer": "과거 통계이며 특정 가게의 폐업 가능성이나 창업 성공 가능성을 뜻하지 않습니다."}
