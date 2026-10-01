"""동네 같은 업종 매출 비교 — 서울시 추정매출(행정동 × 업종 × 분기) 기준.

개별 매장 매출은 공개 데이터에 없다. 여기서 주는 값은 '이 행정동·이 업종 점포들의 평균'이고,
사장님이 입력한 자기 매출과의 비교는 브라우저에서만 계산한다(서버로 보내거나 저장하지 않음).
"""
from __future__ import annotations

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
    "점포당 평균은 (분기 추정매출 ÷ 유사업종 점포수 ÷ 3)으로 계산한 월평균입니다. 매출이 큰 매장이 평균을 끌어올릴 수 있습니다.",
    "서울시 원천 칼럼명은 '당월_매출_금액'이지만 안내 문구(분기 매출 금액)에 따라 분기 합계로 해석했습니다.",
]


def quarter_label(q: str) -> str:
    return f"{q[:4]}년 {q[4]}분기"


def _num(v):
    return None if v is None or pd.isna(v) else round(float(v), 4)


def benchmark(bizes_id: str) -> dict:
    store = store_profile.get_store(bizes_id)
    cw = data_store.load_parquet("sales_industry_crosswalk.parquet")
    row = cw.loc[cw["indsSclsCd"] == store["indsSclsCd"]].iloc[0]
    base = {"source": {"title": "서울시 상권분석서비스(추정매출·점포-행정동)"}, "caveats": CAVEATS}
    if row["status"] == "no_match":
        return {**base, "status": "no_match",
                "message": f"'{store['indsSclsNm']}' 업종은 서울시 추정매출 업종 분류에 대응하는 항목이 없습니다."}
    svc, svc_nm = row["svc_cd"], row["svc_nm"]
    if row["status"] == "no_sales":
        return {**base, "status": "no_sales", "svc_nm": svc_nm,
                "message": f"서울시가 '{svc_nm}' 업종의 추정매출을 제공하지 않습니다."}

    df = data_store.load_parquet("dong_industry_sales.parquet")
    latest = df["quarter"].max()
    base["source"]["reference"] = f"{quarter_label(latest)} 기준"
    sel = df.loc[df["svc_cd"] == svc]
    mine = sel.loc[sel["adongCd"] == store["adongCd"]].sort_values("quarter")
    cur = mine.loc[mine["quarter"] == latest]
    if cur.empty or pd.isna(cur.iloc[0]["per_store_q"]):
        return {**base, "status": "no_data_in_dong", "svc_nm": svc_nm, "quarter": latest,
                "message": f"{store['adongNm']}에는 {quarter_label(latest)} 기준 '{svc_nm}' 추정매출이 없습니다(점포가 적거나 비공개)."}
    cur = cur.iloc[0]

    peers = sel.loc[(sel["quarter"] == latest) & sel["per_store_q"].notna()].sort_values("per_store_month", ascending=False)
    rank = int((peers["adongCd"] == store["adongCd"]).to_numpy().argmax()) + 1
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
                                 "text": f"{it['label']} 매출 비중이 파일럿 평균보다 {abs(gap):.1f}%p {'높음' if gap > 0 else '낮음'}"})
    insights.sort(key=lambda x: -abs(x["gap_pctp"]))

    warnings = []
    if cur["stores"] < MIN_STORES:
        warnings.append(f"이 동네 '{svc_nm}' 점포가 {int(cur['stores'])}곳뿐이라 평균이 불안정합니다.")

    return {
        **base,
        "status": "ok",
        "svc_cd": svc, "svc_nm": svc_nm, "crosswalk_note": row["note"] or None,
        "dong": store["adongNm"], "quarter": latest, "quarter_label": quarter_label(latest),
        "per_store_month": _num(cur["per_store_month"]), "stores": int(cur["stores"]), "sales_q": _num(cur["sales_q"]),
        "per_store_qoq_pct": _num(cur["per_store_qoq_pct"]), "per_store_yoy_pct": _num(cur["per_store_yoy_pct"]),
        "rank": rank, "peer_count": len(peers),
        "peers": [{"dong": r.adongNm, "per_store_month": _num(r.per_store_month), "stores": int(r.stores)} for r in peers.itertuples()],
        "trend": [{"quarter": r.quarter, "label": quarter_label(r.quarter), "per_store_month": _num(r.per_store_month),
                   "stores": None if pd.isna(r.stores) else int(r.stores)}
                  for r in mine.tail(TREND_QUARTERS).itertuples()],
        "composition": composition,
        "insights": insights[:4],
        "warnings": warnings,
    }
