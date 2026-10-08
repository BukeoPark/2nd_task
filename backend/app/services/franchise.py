"""프랜차이즈 참고 정보 — 공정위 가맹정보(브랜드 전국 평균·가맹점 증감, 시도별 업종 평균).

전국·시도 평균이라 상권 값이 아니다. 매장↔브랜드 연결은 상호·업종으로 추정한 것이며
(pipelines/transform/build_franchise.py 규칙), 실제 가맹 여부는 확인되지 않았다.
금액 단위: 원천 천원 → 응답은 원 단위 연·월 환산값을 함께 준다.
"""
from __future__ import annotations

import pandas as pd

from app.services import data_store, store_profile

TREND_YEARS = 5
CAVEATS = [
    "공정거래위원회 가맹사업 정보공개서 기반 전국 평균입니다. 이 상권·이 매장의 매출이 아닙니다.",
    "매장과 브랜드 연결은 상호·업종으로 추정했습니다. 같은 이름의 개인 가게일 수 있습니다.",
    "자료 연도(yr)는 공정위 제공 기준이며 실적 연도와 1년 차이 날 수 있습니다.",
]


def _num(v):
    return None if v is None or pd.isna(v) else float(v)


def brand_info(bizes_id: str) -> dict | None:
    links = data_store.load_parquet("store_brand.parquet")
    hit = links.loc[links["bizesId"] == bizes_id]
    if hit.empty:
        return None
    link = hit.iloc[0]
    stats = data_store.load_parquet("ftc_brand_stats.parquet")
    rows = stats.loc[(stats["corpNm"] == link["corpNm"]) & (stats["brandNm"] == link["brandNm"])].sort_values("yr")
    if rows.empty:
        return None
    last = rows.iloc[-1]
    sales_rows = rows.dropna(subset=["avg_sales_k"])
    s = sales_rows.iloc[-1] if len(sales_rows) else None
    out_cnt = (last["end_cnt"] or 0) + (last["cancel_cnt"] or 0)
    churn = out_cnt / last["frcs_cnt"] if last["frcs_cnt"] else None
    return {
        "brand": link["brandNm"], "corp": link["corpNm"], "match_type": link["match_type"],
        "industry": f"{last['lcls']} > {last['mlsfc']}", "mlsfc": last["mlsfc"],
        "year": int(last["yr"]), "frcs_cnt": _num(last["frcs_cnt"]), "new_cnt": _num(last["new_cnt"]),
        "end_cnt": _num(last["end_cnt"]), "cancel_cnt": _num(last["cancel_cnt"]),
        "churn_rate": None if churn is None else round(churn, 4),
        "avg_sales_year": None if s is None else float(s["avg_sales_k"]) * 1000,
        "avg_sales_month": None if s is None else float(s["avg_sales_k"]) * 1000 / 12,
        "avg_sales_year_label": None if s is None else int(s["yr"]),
        "trend": [{"year": int(r.yr), "frcs_cnt": _num(r.frcs_cnt), "new_cnt": _num(r.new_cnt),
                   "out_cnt": _num((r.end_cnt or 0) + (r.cancel_cnt or 0))} for r in rows.tail(TREND_YEARS).itertuples()],
    }


def seoul_avg(mlsfc: str) -> dict | None:
    df = data_store.load_parquet("ftc_area_avg.parquet")
    rows = df.loc[(df["areaNm"] == "서울") & (df["mlsfc"] == mlsfc)].sort_values("yr")
    if rows.empty or pd.isna(rows.iloc[-1]["avg_sales_k"]):
        return None
    r = rows.iloc[-1]
    return {"mlsfc": mlsfc, "year": int(r["yr"]), "avg_sales_year": float(r["avg_sales_k"]) * 1000,
            "avg_sales_month": float(r["avg_sales_k"]) * 1000 / 12}


def franchise(bizes_id: str) -> dict:
    store_profile.get_store(bizes_id)
    brand = brand_info(bizes_id)
    return {
        "brand": brand,
        "seoul_avg": seoul_avg(brand["mlsfc"]) if brand else None,
        "message": None if brand else "공정위 정보공개 브랜드와 연결되지 않은 매장입니다(개인 가게이거나 상호로 확인되지 않음).",
        "caveats": CAVEATS,
        "source": {"title": "공정거래위원회 가맹정보(브랜드별 가맹점 현황·지역별 업종별 평균매출)",
                   "reference": f"{brand['year']}년 자료" if brand else "-"},
    }
