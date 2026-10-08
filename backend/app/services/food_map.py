"""외식(요식업·카페) 지도 — 지도 배율에 따라 자치구·행정동·상권 단위로 묶은 버블과 개별 매장 점.

업종은 두 단계다.
  - 서울시 외식 10개 업종(CS100001~CS100010): 매출·증감·유동인구·개폐업·프랜차이즈 지표가 있는 단위
  - 소상공인 세부 업종(음식 소분류): 점포 수와 매장 점만 거를 수 있다(매출 자료는 서울시 업종 단위뿐)
값이 없는 단위는 None('자료 없음') — 0 과 구분한다.
"""
from __future__ import annotations

from functools import lru_cache

import numpy as np
import pandas as pd
from shapely.geometry import shape
from shapely.ops import unary_union

from app.services import data_store

FOOD_SVC_PREFIX = "CS1"
LEVELS = ("gu", "dong", "trdar")
METRICS = {
    "stores": {"label": "점포 수", "kind": "count", "unit": "곳"},
    "per_store_month": {"label": "점포당 월평균 매출", "kind": "money", "unit": "원"},
    "sales_yoy_pct": {"label": "매출 증감률(전년 동기)", "kind": "growth", "unit": "%"},
    "sales_per_10k_flpop": {"label": "유동인구 1만 명당 분기 매출", "kind": "money", "unit": "원"},
    "open_rate": {"label": "개업률(분기)", "kind": "rate", "unit": "%"},
    "close_rate": {"label": "폐업률(분기)", "kind": "rate", "unit": "%"},
    "frc_share": {"label": "프랜차이즈 비율", "kind": "rate", "unit": "%"},
}
MIN_STORES_FOR_RATE = 3


def _shift(q: str, n: int) -> str:
    idx = int(q[:4]) * 4 + int(q[4]) - 1 - n
    return f"{idx // 4}{idx % 4 + 1}"


@lru_cache(maxsize=1)
def _dong_shapes() -> dict[str, object]:
    gj = data_store.load_json("regions.geojson")
    cw = data_store.load_parquet("dong_crosswalk.parquet").set_index("region_id")["adongCd"]
    return {cw[f["properties"]["region_id"]]: shape(f["geometry"]) for f in gj["features"]}


@lru_cache(maxsize=1)
def _units() -> dict[str, pd.DataFrame]:
    """단위별 (code, name, lon, lat). 자치구 중심은 소속 행정동 경계를 합친 대표점."""
    cw = data_store.load_parquet("dong_crosswalk.parquet")
    shapes = _dong_shapes()
    dong = pd.DataFrame([{"code": r.adongCd, "name": r.dong_nm, "gu": r.sggnm,
                          "lon": shapes[r.adongCd].representative_point().x, "lat": shapes[r.adongCd].representative_point().y}
                         for r in cw.itertuples() if r.adongCd in shapes])
    gu_rows = []
    for gu, g in cw.groupby("sggnm"):
        p = unary_union([shapes[c] for c in g["adongCd"] if c in shapes]).representative_point()
        gu_rows.append({"code": gu, "name": gu, "lon": p.x, "lat": p.y})
    tr = data_store.load_parquet("trdar_areas.parquet")
    trdar = pd.DataFrame({"code": tr["trdar_cd"], "name": tr["trdar_nm"], "type": tr["trdar_type"], "lon": tr["lon"], "lat": tr["lat"]})
    return {"gu": pd.DataFrame(gu_rows), "dong": dong, "trdar": trdar}


def categories() -> dict:
    cw = data_store.load_parquet("sales_industry_crosswalk.parquet")
    food = cw.loc[cw["indsSclsCd"].str.startswith("I2")]
    groups = []
    for (svc, svc_nm), g in food.dropna(subset=["svc_cd"]).groupby(["svc_cd", "svc_nm"], sort=True):
        groups.append({"svc_cd": svc, "svc_nm": svc_nm, "has_sales": bool((g["status"] == "sales").any()),
                       "store_count": int(g["store_count"].sum()),
                       "details": [{"code": r.indsSclsCd, "name": r.indsSclsNm, "store_count": int(r.store_count)}
                                   for r in g.sort_values("store_count", ascending=False).itertuples()]})
    other = food.loc[food["svc_cd"].isna()]
    return {"groups": groups,
            "other": [{"code": r.indsSclsCd, "name": r.indsSclsNm, "store_count": int(r.store_count)} for r in other.itertuples()],
            "note": "매출 지표는 서울시 외식 10개 업종 단위로만 계산됩니다. 세부 업종은 점포 수·매장 위치만 거릅니다."}


def _sbiz_counts(level: str, sclss: set[str]) -> pd.Series:
    stores = data_store.load_parquet("stores.parquet")
    s = stores.loc[stores["indsSclsCd"].isin(sclss)]
    if level == "dong":
        return s.groupby("adongCd").size()
    if level == "gu":
        return s.groupby("signguNm").size()
    st = data_store.load_parquet("store_trdar.parquet")
    return s.merge(st, on="bizesId").groupby("trdar_cd").size()


def _aggregate(df: pd.DataFrame, key: str) -> pd.DataFrame:
    sums = df.groupby(key)[["sales_q", "stores", "frc_stores", "open_stores", "close_stores"]].sum(min_count=1)
    # 유동인구는 업종과 무관한 단위 값이라 업종별 행을 더하지 않는다.
    flpop = df.drop_duplicates([key, "_unit_raw"]).groupby(key)["flpop"].sum(min_count=1)
    return sums.join(flpop)


def bubbles(level: str, svc: str | None, scls: str | None, metric: str) -> dict:
    if level not in LEVELS:
        raise ValueError(f"level 은 {LEVELS} 중 하나여야 합니다")
    if metric not in METRICS:
        raise ValueError(f"metric 은 {sorted(METRICS)} 중 하나여야 합니다")
    table = "trdar_industry_sales.parquet" if level == "trdar" else "dong_industry_sales.parquet"
    raw_key = "trdar_cd" if level == "trdar" else "adongCd"
    df = data_store.load_parquet(table)
    df = df.loc[df["svc_cd"].str.startswith(FOOD_SVC_PREFIX)]
    if svc:
        df = df.loc[df["svc_cd"] == svc]
    df = df.assign(_unit_raw=df[raw_key])
    if level == "gu":
        cw = data_store.load_parquet("dong_crosswalk.parquet").set_index("adongCd")["sggnm"]
        df = df.assign(_unit=df["adongCd"].map(cw))
    else:
        df = df.assign(_unit=df[raw_key])

    latest = df["quarter"].max()
    now, ago = df.loc[df["quarter"] == latest], df.loc[df["quarter"] == _shift(latest, 4)]
    cur = _aggregate(now, "_unit")
    # 전년 동기 대비: 두 분기에 모두 있는 (단위·업종)만 합산
    both = now.merge(ago[["_unit_raw", "svc_cd"]], on=["_unit_raw", "svc_cd"])
    base = ago.merge(now[["_unit_raw", "svc_cd"]], on=["_unit_raw", "svc_cd"])
    yoy = (both.groupby("_unit")["sales_q"].sum() / base.groupby("_unit")["sales_q"].sum() - 1) * 100

    cur["per_store_month"] = cur["sales_q"] / cur["stores"].replace(0, np.nan) / 3
    cur["sales_yoy_pct"] = yoy
    cur["sales_per_10k_flpop"] = cur["sales_q"] / cur["flpop"].replace(0, np.nan) * 1e4
    small = cur["stores"] < MIN_STORES_FOR_RATE
    cur["open_rate"] = (cur["open_stores"] / cur["stores"] * 100).where(~small)
    cur["close_rate"] = (cur["close_stores"] / cur["stores"] * 100).where(~small)
    cur["frc_share"] = (cur["frc_stores"] / cur["stores"] * 100).where(~small)

    units = _units()[level].set_index("code")
    detail_counts = None
    if scls:
        detail_counts = _sbiz_counts(level, {scls})
    out = []
    for code, u in units.iterrows():
        row = cur.loc[code] if code in cur.index else None
        size = (int(detail_counts.get(code, 0)) if detail_counts is not None
                else (None if row is None or pd.isna(row["stores"]) else int(row["stores"])))
        if metric == "stores":
            value = size
        else:
            value = None if row is None or pd.isna(row[metric]) else round(float(row[metric]), 2)
        out.append({"code": code, "name": u["name"], "type": u.get("type"), "lon": round(float(u["lon"]), 6),
                    "lat": round(float(u["lat"]), 6), "size": size, "value": value})
    return {"level": level, "quarter": latest, "metric": metric, **METRICS[metric], "svc": svc, "scls": scls,
            "size_source": "소상공인 상가정보(세부 업종)" if scls else "서울시 상권분석서비스(유사업종 점포수)",
            "bubbles": out}


def stores_in_bbox(min_lon: float, min_lat: float, max_lon: float, max_lat: float,
                   svc: str | None, scls: str | None, limit: int) -> dict:
    stores = data_store.load_parquet("stores.parquet")
    s = stores.loc[stores["indsLclsCd"] == "I2"]
    if scls:
        s = s.loc[s["indsSclsCd"] == scls]
    elif svc:
        cw = data_store.load_parquet("sales_industry_crosswalk.parquet")
        s = s.loc[s["indsSclsCd"].isin(cw.loc[cw["svc_cd"] == svc, "indsSclsCd"])]
    s = s.loc[s["lon"].between(min_lon, max_lon) & s["lat"].between(min_lat, max_lat)]
    total = len(s)
    s = s.sort_values("bizesId").head(limit)
    return {"total": total, "truncated": total > limit,
            "stores": [{"store_id": r.bizesId, "name": r.bizesNm, "branch": r.brchNm or None, "category": r.indsSclsNm,
                        "lon": float(r.lon), "lat": float(r.lat)} for r in s.itertuples()]}
