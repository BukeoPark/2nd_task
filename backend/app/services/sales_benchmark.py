"""동네 같은 업종 매출 비교 — 서울시 추정매출(행정동 × 업종 × 분기) 기준.

개별 매장 매출은 공개 데이터에 없다. 여기서 주는 값은 '이 행정동·이 업종 점포들의 평균'이고,
사장님이 입력한 자기 매출과의 비교는 브라우저에서만 계산한다(서버로 보내거나 저장하지 않음).
"""
from __future__ import annotations

import math

import pandas as pd

from app.services import data_store, store_profile

TREND_QUARTERS = 8
MIN_STORES = 3
INSIGHT_GAP_PCTP = 5.0

SHARE_LABELS = {
    "share_weekend": "주말", "share_female": "여성",
    "share_t00_06": "0~6시", "share_t06_11": "6~11시", "share_t11_14": "11~14시",
    "share_t14_17": "14~17시", "share_t17_21": "17~21시", "share_t21_24": "21~24시",
    "share_age10": "10대", "share_age20": "20대", "share_age30": "30대",
    "share_age40": "40대", "share_age50": "50대", "share_age60": "60대 이상",
}
GROUPS = {
    "요일별": ["share_weekend"], "성별": ["share_female"],
    "시간대별": ["share_t00_06", "share_t06_11", "share_t11_14", "share_t14_17", "share_t17_21", "share_t21_24"],
    "연령대별": ["share_age10", "share_age20", "share_age30", "share_age40", "share_age50", "share_age60"],
}
CAVEATS = [
    "카드 결제 기반 서울시 추정치이며 개별 매장 매출이 아닙니다.",
    "매장이 서울시 지정 상권(골목·발달·전통시장) 안에 있으면 그 상권, 아니면 행정동 단위로 비교합니다.",
    "점포당 평균은 (분기 추정매출 ÷ 유사업종 점포수 ÷ 3)으로 계산한 월평균입니다. 매출이 큰 매장이 평균을 끌어올릴 수 있습니다.",
    "서울시 원천 칼럼명은 '당월_매출_금액'이지만 안내 문구(분기 매출 금액)에 따라 분기 합계로 해석했습니다.",
]


# 0~6시 유동인구는 생활인구 기반이라 대부분 집에 있는 주민이다 → 비중 비교 안내 문장에서는 뺀다(막대에는 표시).
GAP_EXCLUDED = {"share_t00_06"}

FLOATING_CAVEATS = [
    "유동인구는 서울시·KT 생활인구를 길 단위로 배분한 추정치로, 실제 행인 수가 아니라 동네끼리 비교하는 상대 지수입니다.",
    "길 위의 인구라 오피스·대형 건물 안 인구는 적게 잡혀, 오피스 상권은 '유동인구 대비 매출'이 높게 나올 수 있습니다.",
    "유동인구와 매출의 관계는 상관이지 인과가 아닙니다.",
]


UNITS = {
    "trdar": {"table": "trdar_industry_sales.parquet", "floating": "trdar_floating_pop.parquet", "hinterland": "trdar_hinterland.parquet",
              "cd": "trdar_cd",
              "nm": "trdar_nm", "label": "상권", "peer_label": "파일럿 구 상권",
              "source": "서울시 상권분석서비스(추정매출·점포·길단위인구-상권)"},
    "dong": {"table": "dong_industry_sales.parquet", "floating": "dong_floating_pop.parquet", "hinterland": "dong_hinterland.parquet",
             "cd": "adongCd",
             "nm": "adongNm", "label": "행정동", "peer_label": "파일럿 행정동",
             "source": "서울시 상권분석서비스(추정매출·점포·길단위인구-행정동)"},
}


def _floating(unit: dict, code: str, cur, peers: pd.DataFrame, latest: str) -> dict | None:
    fl = data_store.load_parquet(unit["floating"])
    row = fl.loc[(fl["quarter"] == latest) & (fl[unit["cd"]] == code)]
    if row.empty or pd.isna(cur["sales_per_10k_flpop"]):
        return None
    f = row.iloc[0]
    conv = peers.dropna(subset=["sales_per_10k_flpop"]).sort_values("sales_per_10k_flpop", ascending=False)
    mix, gaps = [], []
    for group, cols in GROUPS.items():
        items = []
        for c in cols:
            fs, ss = _num(f[c]), _num(cur[c])
            items.append({"key": c, "label": SHARE_LABELS[c], "flpop": fs, "sales": ss})
            if c not in GAP_EXCLUDED and fs is not None and ss is not None and abs(fs - ss) * 100 >= INSIGHT_GAP_PCTP:
                gap = (fs - ss) * 100
                gaps.append({"label": SHARE_LABELS[c], "gap_pctp": round(gap, 1),
                             "text": (f"{SHARE_LABELS[c]}: 유동인구 비중 {fs * 100:.0f}% · 매출 비중 {ss * 100:.0f}% — "
                                      + ("사람은 많은데 매출로 덜 이어짐" if gap > 0 else "유동인구 비중보다 매출 비중이 큼"))})
        mix.append({"group": group, "items": items})
    gaps.sort(key=lambda g: -abs(g["gap_pctp"]))
    return {
        "flpop": _num(f["flpop"]), "flpop_yoy_pct": _num(f["flpop_yoy_pct"]),
        "sales_per_10k": _num(cur["sales_per_10k_flpop"]),
        "rank": int((conv[unit["cd"]] == code).to_numpy().argmax()) + 1, "peer_count": len(conv),
        "pilot_median_per_10k": _num(conv["sales_per_10k_flpop"].median()),
        "mix": mix, "gaps": gaps[:4], "caveats": FLOATING_CAVEATS,
        "source": {"title": unit["source"], "reference": f"{quarter_label(latest)} 기준"},
    }


CHURN_QUARTERS = 4
MIN_CHURN_STORES = 5
CHURN_CAVEAT = ("서울시 상권분석서비스의 분기별 개업·폐업 점포 수를 최근 4개 분기 합산한 값입니다. "
                "연 개업률·폐업률 = 4개 분기 합 ÷ 같은 기간 평균 점포 수. 업종 변경·이전도 개폐업으로 잡힐 수 있습니다.")


def _churn(unit: dict, code: str, sel: pd.DataFrame, latest: str) -> dict | None:
    """최근 1년(4개 분기) 개업·폐업 — 분기 값은 작아서 흔들리므로 1년 합으로 보고, 같은 업종 비교 단위 분포와 견준다."""
    qs = sorted(q for q in sel["quarter"].unique() if q <= latest)[-CHURN_QUARTERS:]
    if len(qs) < CHURN_QUARTERS:
        return None
    agg = (sel.loc[sel["quarter"].isin(qs)].groupby(unit["cd"])
           .agg(n=("quarter", "nunique"), opened=("open_stores", "sum"), closed=("close_stores", "sum"), avg_stores=("stores", "mean")))
    agg = agg.loc[(agg["n"] == CHURN_QUARTERS) & (agg["avg_stores"] >= MIN_CHURN_STORES)]
    if code not in agg.index:
        return None
    agg = agg.assign(open_rate=agg["opened"] / agg["avg_stores"], close_rate=agg["closed"] / agg["avg_stores"])
    me = agg.loc[code]
    return {
        "period": f"{quarter_label(qs[0])}~{quarter_label(qs[-1])}",
        "opened": int(me["opened"]), "closed": int(me["closed"]), "avg_stores": round(float(me["avg_stores"]), 1),
        "open_rate": _num(me["open_rate"]), "close_rate": _num(me["close_rate"]),
        "peer_count": len(agg),
        "peer_median_open": _num(agg["open_rate"].median()), "peer_p75_open": _num(agg["open_rate"].quantile(0.75)),
        "peer_median_close": _num(agg["close_rate"].median()), "peer_p75_close": _num(agg["close_rate"].quantile(0.75)),
        "caveat": CHURN_CAVEAT,
    }


HINTERLAND_AGES = ["age10", "age20", "age30", "age40", "age50", "age60"]
FACILITY_LABELS = {  # 화면에 보여줄 집객시설(많이 쓰는 것만, 순서 고정)
    "fac_subway": "지하철역", "fac_bus_stop": "버스정류장", "fac_university": "대학교", "fac_school": "초·중·고",
    "fac_hospital_all": "병원", "fac_public_office": "관공서", "fac_bank": "은행", "fac_department_store": "백화점",
    "fac_supermarket": "슈퍼마켓", "fac_theater": "극장", "fac_lodging": "숙박시설",
}
HINTERLAND_CAVEAT = ("서울시 상권분석서비스의 직장인구·상주인구·집객시설입니다. 상권(행정동) 영역 안의 값이며 상권 밖 배후지는 포함하지 않습니다. "
                     "소득·소비 자료는 서울시가 공급·갱신을 중단해 싣지 않았습니다.")


def _int_half_up(v) -> int | None:
    """인원·개수 중앙값은 정수로(.5 는 올림) — 화면과 리포트 문장이 같은 숫자를 쓰도록 서버에서 한 번만 반올림한다."""
    return None if v is None or pd.isna(v) else int(math.floor(float(v) + 0.5))


def _pop_block(row, prefix: str) -> dict | None:
    total = _num(row[f"{prefix}_total"])
    if not total:
        return None
    ages = {a: _num(row[f"{prefix}_{a}"] / total) for a in HINTERLAND_AGES}
    return {"total": int(total), "female_share": _num(row[f"{prefix}_female"] / total), "age_share": ages,
            "quarter": row[f"{prefix}_quarter"]}


def hinterland(level: str, code: str) -> dict | None:
    """단위의 직장·상주인구·집객시설 + 같은 단위(파일럿) 중앙값. 표가 없거나 단위가 없으면 None."""
    unit = UNITS[level]
    try:
        df = data_store.load_parquet(unit["hinterland"])
    except data_store.DataNotReady:
        return None
    df = df.assign(fac_school=df[["fac_elementary", "fac_middle", "fac_high"]].sum(axis=1, min_count=1),
                   fac_hospital_all=df[["fac_general_hospital", "fac_hospital"]].sum(axis=1, min_count=1))
    hit = df.loc[df[unit["cd"]] == code]
    if hit.empty:
        return None
    r = hit.iloc[0]
    fac = None if pd.isna(r["fac_total"]) else {
        "total": int(r["fac_total"]), "quarter": r["fac_quarter"],
        "items": [{"key": k, "label": v, "count": int(r[k]), "peer_median": _num(df[k].median())}
                  for k, v in FACILITY_LABELS.items() if not pd.isna(r[k]) and r[k] > 0],
    }
    return {
        "workplace": _pop_block(r, "wrc"),
        "resident": None if (b := _pop_block(r, "repop")) is None else {
            **b, "households": _num(r["households"]),
            "apt_share": _num(r["apt_households"] / r["households"]) if r["households"] else None},
        "facility": fac,
        "peer_median": {"workplace": _int_half_up(df["wrc_total"].median()), "resident": _int_half_up(df["repop_total"].median()),
                        "facility": _int_half_up(df["fac_total"].median())},
        "peer_label": unit["peer_label"],
        "caveat": HINTERLAND_CAVEAT,
        "source": {"title": "서울시 상권분석서비스(직장인구·상주인구·집객시설)",
                   "reference": f"{quarter_label(q)} 기준" if (q := next((r[c] for c in ("wrc_quarter", "repop_quarter", "fac_quarter")
                                                                       if isinstance(r[c], str)), None)) else None},
    }


def quarter_label(q: str) -> str:
    return f"{q[:4]}년 {q[4]}분기"


def _num(v):
    return None if v is None or pd.isna(v) else round(float(v), 4)


def _pick_unit(store: dict, svc: str) -> tuple[str, str, str | None, str | None]:
    """(단위, 코드, 상권유형, 행정동 대체 사유). 매장이 속한 상권에 이 업종 최신 분기 자료가 있으면 상권, 아니면 행정동."""
    st = data_store.load_parquet("store_trdar.parquet")
    hit = st.loc[st["bizesId"] == store["bizesId"]]
    if hit.empty:
        return "dong", store["adongCd"], None, "매장이 서울시 지정 상권(골목·발달·전통시장) 밖에 있어 행정동 기준으로 비교합니다."
    t = hit.iloc[0]
    df = data_store.load_parquet(UNITS["trdar"]["table"])
    cur = df.loc[(df["quarter"] == df["quarter"].max()) & (df["trdar_cd"] == t["trdar_cd"]) & (df["svc_cd"] == svc)]
    if cur.empty or pd.isna(cur.iloc[0]["per_store_q"]):
        return "dong", store["adongCd"], None, f"상권 '{t['trdar_nm']}'에는 이 업종 추정매출이 없어 행정동 기준으로 비교합니다."
    return "trdar", t["trdar_cd"], t["trdar_type"], None


def benchmark(bizes_id: str) -> dict:
    store = store_profile.get_store(bizes_id)
    cw = data_store.load_parquet("sales_industry_crosswalk.parquet")
    row = cw.loc[cw["indsSclsCd"] == store["indsSclsCd"]].iloc[0]
    base = {"source": {"title": UNITS["dong"]["source"]}, "caveats": CAVEATS}
    if row["status"] == "no_match":
        return {**base, "status": "no_match",
                "message": f"'{store['indsSclsNm']}' 업종은 서울시 추정매출 업종 분류에 대응하는 항목이 없습니다."}
    svc, svc_nm = row["svc_cd"], row["svc_nm"]
    if row["status"] == "no_sales":
        return {**base, "status": "no_sales", "svc_nm": svc_nm,
                "message": f"서울시가 '{svc_nm}' 업종의 추정매출을 제공하지 않습니다."}

    level, code, trdar_type, fallback = _pick_unit(store, svc)
    unit = UNITS[level]
    df = data_store.load_parquet(unit["table"])
    latest = df["quarter"].max()
    base["source"] = {"title": unit["source"], "reference": f"{quarter_label(latest)} 기준"}
    sel = df.loc[df["svc_cd"] == svc]
    mine = sel.loc[sel[unit["cd"]] == code].sort_values("quarter")
    cur = mine.loc[mine["quarter"] == latest]
    if cur.empty or pd.isna(cur.iloc[0]["per_store_q"]):
        return {**base, "status": "no_data_in_dong", "svc_nm": svc_nm, "quarter": latest,
                "message": f"{store['adongNm']}에는 {quarter_label(latest)} 기준 '{svc_nm}' 추정매출이 없습니다(점포가 적거나 비공개)."}
    cur = cur.iloc[0]

    peers = sel.loc[(sel["quarter"] == latest) & sel["per_store_q"].notna()].sort_values("per_store_month", ascending=False)
    rank = int((peers[unit["cd"]] == code).to_numpy().argmax()) + 1
    w = peers["sales_q"]
    composition = []
    for group, cols in GROUPS.items():
        items = []
        for c in cols:
            pilot = (peers[c] * w).sum() / w[peers[c].notna()].sum() if peers[c].notna().any() else None
            items.append({"key": c, "label": SHARE_LABELS[c], "dong": _num(cur[c]), "pilot": _num(pilot)})
        composition.append({"group": group, "items": items})

    insights = []
    for g in composition:
        for it in g["items"]:
            if it["dong"] is None or it["pilot"] is None:
                continue
            gap = (it["dong"] - it["pilot"]) * 100
            if abs(gap) >= INSIGHT_GAP_PCTP:
                insights.append({"group": g["group"], "label": it["label"], "gap_pctp": round(gap, 1),
                                 "text": f"{it['label']} 매출 비중이 {unit['peer_label']} 평균보다 {abs(gap):.1f}%p {'높음' if gap > 0 else '낮음'}"})
    insights.sort(key=lambda x: -abs(x["gap_pctp"]))

    warnings = []
    if cur["stores"] < MIN_STORES:
        warnings.append(f"이 {unit['label']}의 '{svc_nm}' 점포가 {int(cur['stores'])}곳뿐이라 평균이 불안정합니다.")

    return {
        **base,
        "status": "ok",
        "svc_cd": svc, "svc_nm": svc_nm, "crosswalk_note": row["note"] or None,
        "unit": {"level": level, "label": unit["label"], "name": cur[unit["nm"]], "type": trdar_type,
                 "peer_label": unit["peer_label"], "fallback_reason": fallback},
        "dong": store["adongNm"], "quarter": latest, "quarter_label": quarter_label(latest),
        "per_store_month": _num(cur["per_store_month"]), "stores": int(cur["stores"]), "sales_q": _num(cur["sales_q"]),
        "per_store_qoq_pct": _num(cur["per_store_qoq_pct"]), "per_store_yoy_pct": _num(cur["per_store_yoy_pct"]),
        "rank": rank, "peer_count": len(peers),
        "peers": [{"name": getattr(r, unit["nm"]), "per_store_month": _num(r.per_store_month), "stores": int(r.stores)}
                  for r in peers.itertuples()],
        "trend": [{"quarter": r.quarter, "label": quarter_label(r.quarter), "per_store_month": _num(r.per_store_month),
                   "stores": None if pd.isna(r.stores) else int(r.stores)}
                  for r in mine.tail(TREND_QUARTERS).itertuples()],
        "composition": composition,
        "insights": insights[:4],
        "warnings": warnings,
        "floating": _floating(unit, code, cur, peers, latest),
        "churn": _churn(unit, code, sel, latest),
        "hinterland": hinterland(level, code),
        "franchise_share": None if pd.isna(cur.get("frc_share")) else {
            "share": _num(cur["frc_share"]), "frc_stores": int(cur["frc_stores"]), "stores": int(cur["stores"]),
            "peer_median": _num(peers["frc_share"].median()),
        },
    }
