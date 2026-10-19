"""지도 히트맵 — 유동인구·상주인구 밀도·직장인구 밀도를 상권 단위 점(중심점 + 값)으로 준다.

화면은 이 점들을 번지게 그려 열 지도처럼 보여 주지만, 값은 상권 단위 집계다(도로·건물 단위가 아님).
- 유동인구: 서울시 상권분석서비스 길단위인구-상권의 최신 분기 값(실제 행인 수가 아니라 동네끼리 견주는 상대 지수).
- 상주인구·직장인구 밀도: 상권 영역 안 인구 ÷ 상권 면적(km²). 상권 밖 배후지는 포함하지 않는다.
값이 없는 상권은 0 으로 채우지 않고 빼며(건수를 응답에 기록), 색의 세기(weight)는 상위 5% 값(p95)을 1 로 둔 비율이다.
"""
from __future__ import annotations

import pandas as pd

from app.services import data_store

METRICS = {
    "flpop": {
        "label": "유동인구", "unit": "명(분기 합 추정)",
        "source": "서울시 상권분석서비스(길단위인구-상권)",
        "basis": "상권 영역 안 길 위 유동인구의 분기 합(서울시·KT 생활인구를 길 단위로 배분한 추정). 실제 행인 수가 아니라 동네끼리 견주는 상대 지수입니다.",
    },
    "resident": {
        "label": "인구밀도(상주인구)", "unit": "명/㎢",
        "source": "서울시 상권분석서비스(상주인구-상권)",
        "basis": "상권 영역 안 상주인구 ÷ 상권 면적. 상권 밖 배후지는 포함하지 않습니다.",
    },
    "worker": {
        "label": "직장인구 밀도", "unit": "명/㎢",
        "source": "서울시 상권분석서비스(직장인구-상권)",
        "basis": "상권 영역 안 직장인구 ÷ 상권 면적. 상권 밖 배후지는 포함하지 않습니다.",
    },
}


def _round(v: float, nd: int) -> float:
    return round(float(v), nd)


def heat(metric: str) -> dict:
    if metric not in METRICS:
        raise ValueError(f"metric 은 {'|'.join(METRICS)} 중 하나여야 합니다")
    areas = data_store.load_parquet("trdar_areas.parquet").set_index("trdar_cd")
    if metric == "flpop":
        fp = data_store.load_parquet("trdar_floating_pop.parquet")
        quarter = str(fp["quarter"].max())
        vals = fp.loc[fp["quarter"] == quarter].set_index("trdar_cd")["flpop"]
    else:
        hint = data_store.load_parquet("trdar_hinterland.parquet").set_index("trdar_cd")
        col, qcol = ("repop_total", "repop_quarter") if metric == "resident" else ("wrc_total", "wrc_quarter")
        quarter = str(hint[qcol].dropna().max())
        km2 = (areas["area_m2"] / 1e6).reindex(hint.index)
        vals = hint[col] / km2.where(km2 > 0)
    vals = vals.astype(float)
    total = len(areas)
    valid = vals[vals.notna() & (vals > 0)]
    if valid.empty:
        raise data_store.DataNotReady("히트맵을 만들 값이 없습니다")
    p95 = float(valid.quantile(0.95))
    rows = []
    for code in sorted(valid.index):
        if code not in areas.index:
            continue
        a = areas.loc[code]
        v = float(valid.loc[code])
        rows.append({
            "code": code, "name": a["trdar_nm"], "type": a["trdar_type"],
            "lon": _round(a["lon"], 6), "lat": _round(a["lat"], 6),
            "value": _round(v, 1), "weight": _round(min(1.0, v / p95), 4),
        })
    meta = METRICS[metric]
    return {
        "metric": metric, "level": "trdar", "label": meta["label"], "unit": meta["unit"], "quarter": quarter,
        "source": meta["source"], "basis": meta["basis"],
        "caveats": [
            "상권(서울시 지정 상권 영역) 단위 집계를 점으로 번지게 그린 것이라, 도로·건물 단위의 분포가 아닙니다.",
            "색은 상위 5% 값을 가장 진하게 둔 상대적인 세기입니다. 값이 없는 상권은 0이 아니라 표시하지 않았습니다.",
        ],
        "count": len(rows), "missing": int(total - len(rows)), "total_trdars": int(total),
        "scale": {"p50": _round(valid.quantile(0.5), 1), "p95": _round(p95, 1), "max": _round(valid.max(), 1)},
        "points": rows,
    }
