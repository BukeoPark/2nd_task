"""외식(요식업·카페) 지도 — 지도 배율에 따라 자치구·행정동·상권 단위로 묶은 버블과 개별 매장 점.

업종은 두 단계다.
  - 서울시 외식 10개 업종(CS100001~CS100010): 매출·증감·유동인구·개폐업·프랜차이즈 지표가 있는 단위
  - 소상공인 세부 업종(음식 소분류): 점포 수와 매장 점만 거를 수 있다(매출 자료는 서울시 업종 단위뿐)
버블의 점포 수(크기)는 소상공인 상가정보 매장을 단위 경계(행정동 코드·상권 소속)로 센다. 버블을 눌렀을 때의
매장 목록도 같은 기준이라 두 숫자가 항상 일치한다. 매출·개폐업 지표는 서울시 상권분석서비스 값이다.
값이 없는 단위는 None('자료 없음') — 0 과 구분한다.
"""
from __future__ import annotations

from functools import lru_cache

import numpy as np
import pandas as pd
from shapely.geometry import shape
from shapely.ops import unary_union

from app.services import data_store, taxonomy

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
    "starbucks_zone_share": {"label": "스세권 매장 비율(스타벅스 250m)", "kind": "rate", "unit": "%"},
    "daiso_zone_share": {"label": "다세권 매장 비율(다이소 250m)", "kind": "rate", "unit": "%"},
    "stores_change_2y": {"label": "점포 수 증감률(2년)", "kind": "growth", "unit": "%"},
    "stores_volatility": {"label": "점포수 변동성(분기 평균 변동폭)", "kind": "rate", "unit": "%"},
}
MIN_STORES_FOR_RATE = 3
DYNAMICS_QUARTERS = 8            # 상권 시계열이 8개 분기라 두 단위 모두 같은 창(최근 2년)을 쓴다
MIN_STORES_FOR_VOLATILITY = 10   # 평균 10곳 미만은 1~2곳 증감만으로 변동폭이 크게 튀어 '자료 없음'으로 둔다
DYNAMICS_METRICS = {"stores_change_2y", "stores_volatility"}
ANCHOR_METRICS = {"starbucks_zone_share": "starbucks", "daiso_zone_share": "daiso"}  # 소상공인 매장 기준(세부 업종 필터 반영)
ANCHOR_LABELS = {"starbucks": "스타벅스", "daiso": "다이소"}


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


def _sbiz_month() -> str:
    ym = taxonomy.sources()["sbiz_store"]["reference"].get("stdrYm", "")
    return f"{ym[:4]}-{ym[4:]}" if len(ym) == 6 else "기준월 미상"


def _food_stores(svc: str | None, scls: str | None) -> pd.DataFrame:
    """소상공인 외식 매장(I2) — 세부 업종이 있으면 그것만, 없으면 서울시 업종 대응표로 거른다."""
    stores = data_store.load_parquet("stores.parquet")
    s = stores.loc[stores["indsLclsCd"] == "I2"]
    if scls:
        return s.loc[s["indsSclsCd"] == scls]
    if svc:
        cw = data_store.load_parquet("sales_industry_crosswalk.parquet")
        return s.loc[s["indsSclsCd"].isin(cw.loc[cw["svc_cd"] == svc, "indsSclsCd"])]
    return s


def _with_unit(s: pd.DataFrame, level: str) -> pd.DataFrame:
    """매장에 단위 코드(_unit) 를 붙인다. 상권은 경계 안 매장만 남는다(상권 밖 매장은 어느 상권에도 안 셈)."""
    if level == "dong":
        return s.assign(_unit=s["adongCd"])
    if level == "gu":
        return s.assign(_unit=s["signguNm"])
    st = data_store.load_parquet("store_trdar.parquet")[["bizesId", "trdar_cd"]]
    return s.merge(st, on="bizesId").assign(_unit=lambda d: d["trdar_cd"])


def _aggregate(df: pd.DataFrame, key: str) -> pd.DataFrame:
    sums = df.groupby(key)[["sales_q", "stores", "frc_stores", "open_stores", "close_stores"]].sum(min_count=1)
    # 유동인구는 업종과 무관한 단위 값이라 업종별 행을 더하지 않는다.
    flpop = df.drop_duplicates([key, "_unit_raw"]).groupby(key)["flpop"].sum(min_count=1)
    return sums.join(flpop)


def _store_dynamics(df: pd.DataFrame, latest: str) -> tuple[pd.DataFrame, str | None]:
    """최근 8개 분기 서울시 점포 수(유사업종 점포수)로 단위별 2년 증감률과 분기 평균 변동폭.

    8개 분기 모두 있는 (원 단위·업종)만 합산한다 — 어떤 분기에 업종 행이 빠지면(점포 3곳 미만 비공개 등)
    합계가 가짜로 출렁이기 때문이다.
    """
    qs = [_shift(latest, n) for n in range(DYNAMICS_QUARTERS - 1, -1, -1)]
    win = df.loc[df["quarter"].isin(qs)]
    full = win.groupby(["_unit_raw", "svc_cd"])["quarter"].transform("nunique") == DYNAMICS_QUARTERS
    tot = win.loc[full].groupby(["_unit", "quarter"])["stores"].sum().unstack().reindex(columns=qs)
    if tot.empty:
        return pd.DataFrame(columns=list(DYNAMICS_METRICS)), None
    change = (tot[qs[-1]] / tot[qs[0]].replace(0, np.nan) - 1) * 100
    vol = (tot.pct_change(axis=1).abs().iloc[:, 1:].mean(axis=1) * 100).where(tot.mean(axis=1) >= MIN_STORES_FOR_VOLATILITY)
    period = f"{qs[0][:4]}년 {qs[0][4]}분기~{qs[-1][:4]}년 {qs[-1][4]}분기"
    return pd.DataFrame({"stores_change_2y": change, "stores_volatility": vol}), period


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

    period = None
    if metric in DYNAMICS_METRICS:
        dyn, period = _store_dynamics(df, latest)
        cur = cur.join(dyn, how="outer")

    units = _units()[level].set_index("code")
    food = _with_unit(_food_stores(svc, scls), level)
    counts = food.groupby("_unit").size()
    if metric in ANCHOR_METRICS:
        brand = ANCHOR_METRICS[metric]
        za = data_store.load_parquet("store_anchor.parquet")[["bizesId", f"{brand}_zone"]]
        z = food.merge(za, on="bizesId", how="left").groupby("_unit")[f"{brand}_zone"].mean() * 100
        cur = cur.reindex(cur.index.union(z.index))
        cur[metric] = z.where(counts.reindex(z.index) >= MIN_STORES_FOR_RATE)
    out = []
    for code, u in units.iterrows():
        row = cur.loc[code] if code in cur.index else None
        size = int(counts.get(code, 0))
        if metric == "stores":
            value = size
        else:
            value = None if row is None or pd.isna(row[metric]) else round(float(row[metric]), 2)
        out.append({"code": code, "name": u["name"], "type": u.get("type"), "lon": round(float(u["lon"]), 6),
                    "lat": round(float(u["lat"]), 6), "size": size, "value": value})
    return {"level": level, "quarter": latest, "metric": metric, **METRICS[metric], "svc": svc, "scls": scls,
            "size_source": f"소상공인 상가(상권)정보 {_sbiz_month()} 기준 · 경계 안 매장 수",
            "metric_source": (None if metric == "stores"
                              else "소상공인 상가(상권)정보 매장 좌표" if metric in ANCHOR_METRICS
                              else "서울시 상권분석서비스(추정매출·점포)"),
            "period": period,
            # 지표 값의 기준 — 여러 분기 지표는 기간, 앵커 지표는 상가정보 기준월, 나머지는 서울시 분기
            "as_of": period or (_sbiz_month() if metric in ANCHOR_METRICS else f"{latest[:4]}년 {latest[4]}분기"),
            "bubbles": out}


def stores_in_bbox(min_lon: float, min_lat: float, max_lon: float, max_lat: float,
                   svc: str | None, scls: str | None, limit: int) -> dict:
    s = _food_stores(svc, scls)
    s = s.loc[s["lon"].between(min_lon, max_lon) & s["lat"].between(min_lat, max_lat)]
    total = len(s)
    s = s.sort_values("bizesId").head(limit)
    return {"total": total, "truncated": total > limit,
            "stores": [{"store_id": r.bizesId, "name": r.bizesNm, "branch": r.brchNm or None, "category": r.indsSclsNm,
                        "lon": float(r.lon), "lat": float(r.lat)} for r in s.itertuples()]}


def stores_in_unit(level: str, code: str, svc: str | None, scls: str | None, limit: int) -> dict:
    """버블 하나(자치구·행정동·상권)에 속한 매장 — 버블 점포 수와 같은 기준. 버블 중심에서 가까운 순."""
    if level not in LEVELS:
        raise ValueError(f"level 은 {LEVELS} 중 하나여야 합니다")
    units = _units()[level].set_index("code")
    if code not in units.index:
        raise KeyError(code)
    u = units.loc[code]
    s = _with_unit(_food_stores(svc, scls), level)
    s = s.loc[s["_unit"] == code]
    # 좁은 범위라 위경도 차를 미터로 바로 환산(위도 37.5° 기준 근사)
    dist = np.hypot((s["lon"] - u["lon"]) * 111_320 * np.cos(np.radians(u["lat"])), (s["lat"] - u["lat"]) * 110_950)
    total = len(s)
    s = s.assign(dist_m=dist).sort_values(["dist_m", "bizesId"]).head(limit)
    return {"level": level, "code": code, "name": u["name"], "total": total, "truncated": total > limit,
            "records": [{"store_id": r.bizesId, "name": r.bizesNm, "branch": r.brchNm or None, "category_detail": r.indsSclsNm,
                         "distance_m": round(float(r.dist_m))} for r in s.itertuples()]}


def anchors() -> dict:
    """앵커 브랜드 매장 위치(지도 표시용). 파일럿 두 구 안 매장만 — 경계 밖 매장은 없어 경계 인근 거리는 크게 나올 수 있다."""
    a = data_store.load_parquet("anchor_stores.parquet").sort_values(["brand", "bizesId"])
    return {"walk_m": 250, "brands": ANCHOR_LABELS,
            "stores": [{"brand": r.brand, "name": r.bizesNm, "branch": r.brchNm or None, "lon": round(float(r.lon), 6),
                        "lat": round(float(r.lat), 6)} for r in a.itertuples()],
            "note": "스타벅스는 상가정보 상호, 다이소는 상가정보 상호 + 네이버 지역 검색으로 보강한 매장입니다. 파일럿 두 구 밖 매장은 포함하지 않습니다."}


def store_anchor(bizes_id: str) -> dict | None:
    """매장 한 곳의 브랜드별 최근접 거리·반경 500m 매장 수·도보권(250m) 여부."""
    sa = data_store.load_parquet("store_anchor.parquet")
    hit = sa.loc[sa["bizesId"] == bizes_id]
    if hit.empty:
        return None
    r = hit.iloc[0]
    return {"walk_m": 250, "brands": [
        {"brand": b, "label": label, "nearest_m": None if pd.isna(r[f"{b}_nearest_m"]) else round(float(r[f"{b}_nearest_m"])),
         "count_500m": int(r[f"{b}_cnt_500m"]), "in_zone": bool(r[f"{b}_zone"])}
        for b, label in ANCHOR_LABELS.items()],
        "note": "직선거리입니다. 파일럿 두 구 밖 매장은 포함하지 않아 구 경계 근처는 실제보다 멀게 나올 수 있습니다."}
