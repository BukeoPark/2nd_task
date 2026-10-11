"""행정동·상권 종합분석의 보조 자료 — 분기별 시계열, 시간대별 소비, 유동인구, 행정동과 겹치는 세부 상권.

지표 값(점포당 매출·증감률·개폐업·변동성·프랜차이즈·앵커·임대)은 기존 `food_map.compare` 가 이미 단위별로 계산한다.
여기서는 그 계산에 없는 것만 더한다. 상권은 상권 자신의 매출·유동인구 표(trdar_*)로 계산하고, 행정동 통계를 가져다 쓰지 않는다.
결측은 0 으로 바꾸지 않는다: 점포당 매출은 매출·점포 수가 모두 있는 업종 행만 합산하고, 몇 행 중 몇 행을 썼는지 돌려준다.
"""
from __future__ import annotations

from functools import lru_cache

import numpy as np
import pandas as pd
from pyproj import Transformer
from shapely.geometry import shape
from shapely.ops import transform

from app.services import data_store, food_map, store_churn

LEVELS = ("dong", "trdar")
MIN_OVERLAP = 0.10  # 상권 면적의 10% 미만만 걸친 상권은 목록에서 뺀다(제외 건수는 응답에 기록)
TIME_COLS = [("share_t00_06", "00~06시"), ("share_t06_11", "06~11시"), ("share_t11_14", "11~14시"),
             ("share_t14_17", "14~17시"), ("share_t17_21", "17~21시"), ("share_t21_24", "21~24시")]
_to_m = Transformer.from_crs("EPSG:4326", "EPSG:5179", always_xy=True).transform  # 면적 계산용 투영(m)


def _num(v, nd: int = 2) -> float | None:
    return None if v is None or pd.isna(v) else round(float(v), nd)


@lru_cache(maxsize=1)
def _trdar_shapes() -> dict[str, object]:
    gj = data_store.load_json("trdar_areas.geojson")
    return {f["properties"]["trdar_cd"]: transform(_to_m, shape(f["geometry"])) for f in gj["features"]}


@lru_cache(maxsize=1)
def _overlaps() -> dict[str, list[dict]]:
    """행정동 코드 → 경계가 겹치는 상권(겹침 비율 큰 순). 겹침 = 교집합 면적 ÷ 상권 면적(경계 기준, 중심점 소속 아님)."""
    dongs = {c: transform(_to_m, s) for c, s in food_map._dong_shapes().items()}
    ta = data_store.load_parquet("trdar_areas.parquet").set_index("trdar_cd")
    shapes = _trdar_shapes()
    out: dict[str, list[dict]] = {c: [] for c in dongs}
    for cd, ts in shapes.items():
        if cd not in ta.index or ts.area <= 0:
            continue
        for dc, ds in dongs.items():
            if not ts.intersects(ds):
                continue
            ratio = ts.intersection(ds).area / ts.area
            out[dc].append({"code": cd, "name": ta.loc[cd, "trdar_nm"], "type": ta.loc[cd, "trdar_type"],
                            "area_m2": _num(ta.loc[cd, "area_m2"], 0),
                            "lon": _num(ta.loc[cd, "lon"], 6), "lat": _num(ta.loc[cd, "lat"], 6), "overlap_pct": round(float(ratio) * 100, 1)})
    for v in out.values():
        v.sort(key=lambda r: (-r["overlap_pct"], r["code"]))
    return out


def _sales_rows(level: str, code: str, svc: str | None) -> pd.DataFrame:
    table, key = ("trdar_industry_sales.parquet", "trdar_cd") if level == "trdar" else ("dong_industry_sales.parquet", "adongCd")
    df = data_store.load_parquet(table)
    df = df.loc[df["svc_cd"].str.startswith(food_map.FOOD_SVC_PREFIX) & (df[key] == code)]
    return df.loc[df["svc_cd"] == svc] if svc else df


def _trend(df: pd.DataFrame) -> list[dict]:
    out = []
    for q, g in df.groupby("quarter"):
        both = g.loc[g["sales_q"].notna() & g["stores"].notna()]
        stores_sum = both["stores"].sum()
        per_store = both["sales_q"].sum() / stores_sum / 3 if len(both) and stores_sum > 0 else np.nan
        out.append({"quarter": q, "label": store_churn.quarter_label(q),
                    "sales_q": _num(g["sales_q"].sum()) if g["sales_q"].notna().any() else None,
                    "stores": int(g["stores"].sum()) if g["stores"].notna().any() else None,
                    "per_store_month": _num(per_store), "used": int(len(both)), "total": int(len(g))})
    return sorted(out, key=lambda r: r["quarter"])


def _consumption_hours(df: pd.DataFrame, latest: str) -> dict:
    """매출 시간대 비중 — 업종별 비중을 매출액으로 가중 평균. 여섯 칸이 모두 값인 업종 행만 쓴다."""
    g = df.loc[df["quarter"] == latest]
    cols = [c for c, _ in TIME_COLS]
    ok = g.loc[g["sales_q"].notna() & (g["sales_q"] > 0) & g[cols].notna().all(axis=1)]
    shares = None
    if len(ok):
        w = ok["sales_q"].to_numpy()
        shares = [_num((ok[c].to_numpy() * w).sum() / w.sum() * 100, 1) for c in cols]
    return {"quarter": latest, "label": store_churn.quarter_label(latest), "used": int(len(ok)), "total": int(len(g)),
            "slots": [{"label": lb, "pct": None if shares is None else shares[i]} for i, (_, lb) in enumerate(TIME_COLS)]}


def _floating(level: str, code: str) -> dict | None:
    key = "trdar_cd" if level == "trdar" else "adongCd"
    fp = data_store.load_parquet(f"{level}_floating_pop.parquet")
    fp = fp.loc[fp[key] == code].sort_values("quarter")
    if fp.empty:
        return None
    r = fp.iloc[-1]
    return {"quarter": r["quarter"], "label": store_churn.quarter_label(r["quarter"]), "flpop": _num(r["flpop"], 0),
            "yoy_pct": _num(r["flpop_yoy_pct"]), "weekend_pct": _num(r["share_weekend"] * 100, 1) if pd.notna(r["share_weekend"]) else None,
            "slots": [{"label": lb, "pct": _num(r[c] * 100, 1) if pd.notna(r[c]) else None} for c, lb in TIME_COLS],
            "trend": [{"quarter": q, "label": store_churn.quarter_label(q), "flpop": _num(v, 0)} for q, v in zip(fp["quarter"], fp["flpop"])]}


def overview(level: str, code: str, svc: str | None, scls: str | None) -> dict:
    if level not in LEVELS:
        raise ValueError(f"level 은 {LEVELS} 중 하나여야 합니다")
    food_map.validate_filter(svc, scls)
    units = food_map._units()[level].set_index("code")
    if code not in units.index:
        raise KeyError(code)
    df = _sales_rows(level, code, svc)
    latest = str(data_store.load_parquet("trdar_industry_sales.parquet" if level == "trdar" else "dong_industry_sales.parquet")["quarter"].max())
    scope = food_map.scope_of(svc, scls)
    body = {"level": level, "code": code, "name": units.loc[code, "name"], "type": units.loc[code].get("type") if "type" in units else None,
            "scope": scope, "latest_quarter": latest,
            "trend": _trend(df), "trend_source": "서울시 상권분석서비스(추정매출·점포)", "trend_scope": scope["sales_label"] + " 기준",
            "hours": _consumption_hours(df, latest), "floating": _floating(level, code)}
    if level == "dong":
        found = _overlaps().get(code, [])
        keep = [r for r in found if r["overlap_pct"] >= MIN_OVERLAP * 100]
        body["trdars"] = keep
        body["trdars_excluded"] = len(found) - len(keep)
        body["trdars_basis"] = f"행정동 경계와 상권 경계가 겹치는 면적이 상권 면적의 {int(MIN_OVERLAP * 100)}% 이상인 상권(경계 교집합 기준)"
    else:
        ta = data_store.load_parquet("trdar_areas.parquet").set_index("trdar_cd").loc[code]
        body["area_m2"] = _num(ta["area_m2"], 0)
        body["adong_cd"] = ta["adongCd"]
    return body
