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

from app.services import data_store, store_churn, taxonomy, unit_metrics
from app.services.reb import reb_quarters

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
DYNAMICS_METRICS = {"stores_change_2y", "stores_volatility"}
SBIZ_METRICS = {"stores", "stores_sbiz", "starbucks_zone_share", "daiso_zone_share"}  # 소상공인 상가정보 매장 기준(세부 업종 필터 반영)
ANCHOR_METRICS = {"starbucks_zone_share": "starbucks", "daiso_zone_share": "daiso"}  # 소상공인 매장 기준(세부 업종 필터 반영)
ANCHOR_LABELS = {"starbucks": "스타벅스", "daiso": "다이소"}


_shift = store_churn.shift_quarter


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


def validate_filter(svc: str | None, scls: str | None) -> None:
    """업종(svc)·세부 업종(scls) 코드가 외식 분류에 있고 서로 맞는지 확인한다. 어긋나면 ValueError(→ 400).

    잘못된 코드를 그대로 두면 0곳으로 조용히 계산되거나(scls), 빈 표에서 오류가 난다(svc).
    세부 업종은 소상공인 분류라 서울시 업종과 따로 오므로, 둘을 함께 주면 같은 업종에 속하는지도 본다.
    """
    cw = data_store.load_parquet("sales_industry_crosswalk.parquet")
    food = cw.loc[cw["indsSclsCd"].str.startswith("I2")]
    if svc and svc not in set(food["svc_cd"].dropna()):
        raise ValueError(f"외식 업종 코드 '{svc}' 를 찾을 수 없습니다. /api/food/categories 의 svc_cd 를 쓰세요")
    if scls:
        hit = food.loc[food["indsSclsCd"] == scls]
        if hit.empty:
            raise ValueError(f"세부 업종 코드 '{scls}' 가 외식 분류에 없습니다. /api/food/categories 의 details.code 를 쓰세요")
        if svc and hit.iloc[0]["svc_cd"] != svc:
            raise ValueError(f"세부 업종 '{scls}' 는 업종 '{svc}' 에 속하지 않습니다")


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


METRIC_BASIS = {  # 지표별 계산 기준 — 범례·요약 패널·비교표에 그대로 보인다
    "stores": "소상공인 상가정보에서 단위 경계 안 매장을 센 값",
    "per_store_month": "Σ분기 매출 ÷ Σ점포 수 ÷ 3 — 매출과 점포 수가 모두 확인된 업종 행만 합산",
    "sales_yoy_pct": "이번 분기와 전년 동기 매출이 모두 있는 업종 행만 양쪽에서 합산해 비교",
    "sales_per_10k_flpop": "Σ분기 매출 ÷ 유동인구 × 1만 — 매출과 유동인구가 모두 있는 단위·업종만",
    "open_rate": "Σ개업 점포 ÷ Σ점포 수 — 필요한 값이 모두 있는 업종 행만, 점포 3곳 미만은 계산 안 함",
    "close_rate": "Σ폐업 점포 ÷ Σ점포 수 — 필요한 값이 모두 있는 업종 행만, 점포 3곳 미만은 계산 안 함",
    "frc_share": "Σ프랜차이즈 점포 ÷ Σ점포 수 — 필요한 값이 모두 있는 업종 행만, 점포 3곳 미만은 계산 안 함",
    "starbucks_zone_share": "선택한 업종 매장 중 스타벅스 250m 안 매장의 비율(상가정보 좌표)",
    "daiso_zone_share": "선택한 업종 매장 중 다이소 250m 안 매장의 비율(상가정보 좌표)",
    "stores_change_2y": "8개 분기 모두 점포 수가 있는 업종 행만 합산해 처음·마지막 분기를 비교",
    "stores_volatility": "8개 분기 모두 점포 수가 있는 업종 행의 분기별 변화율 평균(평균 10곳 미만은 계산 안 함)",
    "open_rate_y": "최근 4개 분기 개업 합 ÷ 평균 점포 수 — 4개 분기 값이 모두 있는 업종 행만(빠진 분기를 0 으로 더하지 않음)",
    "close_rate_y": "최근 4개 분기 폐업 합 ÷ 평균 점포 수 — 4개 분기 값이 모두 있는 업종 행만(빠진 분기를 0 으로 더하지 않음)",
}
NO_STORES = "no_stores"
REASON_TEXT = {**unit_metrics.REASON_TEXT, NO_STORES: "조건에 맞는 매장이 0곳이라 비율을 계산할 수 없음"}


def scope_of(svc: str | None, scls: str | None) -> dict:
    """지표별로 실제 적용되는 업종 범위 — 점포 수·앵커 비율은 선택한 세부 업종, 매출·개폐업 등은 서울시 업종 전체.

    서울시 상권분석서비스는 10개 외식 업종 단위로만 매출을 주므로 세부 업종의 매출은 원천에 없다(추정·배분하지 않는다).
    """
    cw = data_store.load_parquet("sales_industry_crosswalk.parquet")
    svc_nm = None
    if svc:
        svc_nm = str(cw.loc[cw["svc_cd"] == svc, "svc_nm"].iloc[0])
    sales_label = f"{svc_nm} 전체" if svc_nm else "외식 전체"
    stores_label = str(cw.loc[cw["indsSclsCd"] == scls, "indsSclsNm"].iloc[0]) if scls else sales_label
    differs = stores_label != sales_label
    return {"sales_label": sales_label, "stores_label": stores_label, "differs": differs,
            "notice": (f"점포 수·스세권 비율은 '{stores_label}' 기준이지만, 매출·개폐업·변동성은 원천(서울시)에 세부 업종 값이 없어 "
                       f"'{sales_label}' 기준입니다.") if differs else None}


def metric_scope(metric: str, scope: dict) -> str:
    """이 지표가 어느 업종 범위의 값인지(숫자 옆에 그대로 쓰는 문구)."""
    return f"{scope['stores_label'] if metric in SBIZ_METRICS else scope['sales_label']} 기준"


def _num(v) -> float | None:
    return None if v is None or pd.isna(v) else round(float(v), 2)


def _unit_table(level: str, svc: str | None, scls: str | None):
    """단위별 모든 지표 — (값 표, 사용 범위 dict[지표→표], 최신 분기, 2년 기간 라벨, 단위 목록). bubbles·compare 가 같은 계산을 쓴다."""
    if level not in LEVELS:
        raise ValueError(f"level 은 {LEVELS} 중 하나여야 합니다")
    validate_filter(svc, scls)
    table = "trdar_industry_sales.parquet" if level == "trdar" else "dong_industry_sales.parquet"
    raw_key = "trdar_cd" if level == "trdar" else "adongCd"
    df = data_store.load_parquet(table)
    df = df.loc[df["svc_cd"].str.startswith(FOOD_SVC_PREFIX)]
    latest = df["quarter"].max()  # 이 업종에 이 단위 매출 행이 하나도 없어도 기준 분기는 정해진다
    if svc:
        df = df.loc[df["svc_cd"] == svc]
    df = df.assign(_unit_raw=df[raw_key])
    if level == "gu":
        cw = data_store.load_parquet("dong_crosswalk.parquet").set_index("adongCd")["sggnm"]
        df = df.assign(_unit=df["adongCd"].map(cw))
    else:
        df = df.assign(_unit=df[raw_key])

    cov, period = unit_metrics.latest_metrics(df, latest)

    units = _units()[level].set_index("code")
    food = _with_unit(_food_stores(svc, scls), level)
    counts = food.groupby("_unit").size().reindex(units.index).fillna(0).astype(int)
    za = data_store.load_parquet("store_anchor.parquet")[["bizesId", *(f"{b}_zone" for b in ANCHOR_LABELS)]]
    zones = food.merge(za, on="bizesId", how="left").groupby("_unit")[[f"{b}_zone" for b in ANCHOR_LABELS]].mean() * 100
    for metric, brand in ANCHOR_METRICS.items():
        value = zones[f"{brand}_zone"].reindex(units.index).where(counts >= unit_metrics.MIN_STORES_FOR_RATE)
        reason = pd.Series(None, index=units.index, dtype=object)
        reason[value.isna() & (counts == 0)] = NO_STORES
        reason[value.isna() & (counts > 0)] = unit_metrics.TOO_FEW_STORES
        cov[metric] = pd.DataFrame({"value": value, "used": counts, "total": counts, "excluded_sales_share": np.nan, "reason": reason})
    values = pd.DataFrame({m: f["value"] for m, f in cov.items()}).reindex(units.index)
    values["stores_sbiz"] = counts
    return values, cov, latest, period, units


def _reason(row) -> str | None:
    """표의 사유 칸 — 비어 있으면(NaN) None. NaN 은 참으로 평가돼 'or' 기본값을 건너뛰므로 꼭 이 함수로 읽는다."""
    r = row["reason"]
    return None if pd.isna(r) else str(r)


def _coverage(row) -> dict | None:
    """사용한 집단/전체 집단과 제외된 매출 비중 — 일부만 썼으면 전체 평균으로 오해하지 않게 화면이 보여준다."""
    if row is None:
        return None
    share = None if pd.isna(row["excluded_sales_share"]) else round(float(row["excluded_sales_share"]), 4)
    return {"used": int(row["used"]), "total": int(row["total"]), "excluded_sales_share": share}


def bubbles(level: str, svc: str | None, scls: str | None, metric: str) -> dict:
    if metric not in METRICS:
        raise ValueError(f"metric 은 {sorted(METRICS)} 중 하나여야 합니다")
    values, cov, latest, period, units = _unit_table(level, svc, scls)
    period = period if metric in DYNAMICS_METRICS else None
    scope = scope_of(svc, scls)
    out = []
    for code, u in units.iterrows():
        size = int(values.loc[code, "stores_sbiz"])
        coverage = reason = None
        if metric == "stores":
            value = size
        else:
            f = cov[metric]
            row = f.loc[code] if code in f.index else None
            value = None if row is None else _num(row["value"])
            coverage = _coverage(row)
            if value is None:
                reason = unit_metrics.NO_ROWS if row is None else (_reason(row) or unit_metrics.MISSING_INPUTS)
        out.append({"code": code, "name": u["name"], "type": u.get("type"), "lon": round(float(u["lon"]), 6),
                    "lat": round(float(u["lat"]), 6), "size": size, "value": value, "coverage": coverage, "reason": reason})
    return {"level": level, "quarter": latest, "metric": metric, **METRICS[metric], "svc": svc, "scls": scls,
            "size_source": f"소상공인 상가(상권)정보 {_sbiz_month()} 기준 · 경계 안 매장 수",
            "metric_source": (None if metric == "stores"
                              else "소상공인 상가(상권)정보 매장 좌표" if metric in ANCHOR_METRICS
                              else "서울시 상권분석서비스(추정매출·점포)"),
            "period": period,
            # 지표 값의 기준 — 여러 분기 지표는 기간, 앵커 지표는 상가정보 기준월, 나머지는 서울시 분기
            "as_of": period or (_sbiz_month() if metric in ANCHOR_METRICS else f"{latest[:4]}년 {latest[4]}분기"),
            "basis": METRIC_BASIS[metric],
            "scope": {**scope, "metric_scope": metric_scope(metric, scope)},
            "reasons": REASON_TEXT,
            "bubbles": out}


def stores_in_bbox(min_lon: float, min_lat: float, max_lon: float, max_lat: float,
                   svc: str | None, scls: str | None, limit: int) -> dict:
    validate_filter(svc, scls)
    s = _food_stores(svc, scls)
    s = s.loc[s["lon"].between(min_lon, max_lon) & s["lat"].between(min_lat, max_lat)]
    total = len(s)
    s = s.sort_values("bizesId").head(limit)
    return {"svc": svc, "scls": scls, "total": total, "truncated": total > limit,
            "stores": [{"store_id": r.bizesId, "name": r.bizesNm, "branch": r.brchNm or None, "category": r.indsSclsNm,
                        "lon": float(r.lon), "lat": float(r.lat)} for r in s.itertuples()]}


UNIT_STORE_SORTS = ("distance", "name")


def stores_in_unit(level: str, code: str, svc: str | None, scls: str | None, limit: int, offset: int = 0, sort: str = "distance") -> dict:
    """버블 하나(자치구·행정동·상권)에 속한 매장 — 버블 점포 수와 같은 기준.

    정렬은 distance(버블 중심에서 가까운 순, 기본) 또는 name(상호 가나다순)이며 동점은 bizesId 로 깨서 항상 같은 순서다.
    그래서 offset 으로 이어 받아도 같은 조건이면 중복·누락이 없다(조건이 바뀌면 클라이언트가 처음부터 다시 받는다).
    """
    if level not in LEVELS:
        raise ValueError(f"level 은 {LEVELS} 중 하나여야 합니다")
    if sort not in UNIT_STORE_SORTS:
        raise ValueError(f"sort 는 {UNIT_STORE_SORTS} 중 하나여야 합니다")
    if offset < 0:
        raise ValueError("offset 은 0 이상이어야 합니다")
    validate_filter(svc, scls)
    units = _units()[level].set_index("code")
    if code not in units.index:
        raise KeyError(code)
    u = units.loc[code]
    s = _with_unit(_food_stores(svc, scls), level)
    s = s.loc[s["_unit"] == code]
    # 좁은 범위라 위경도 차를 미터로 바로 환산(위도 37.5° 기준 근사)
    dist = np.hypot((s["lon"] - u["lon"]) * 111_320 * np.cos(np.radians(u["lat"])), (s["lat"] - u["lat"]) * 110_950)
    total = len(s)
    order = ["dist_m", "bizesId"] if sort == "distance" else ["bizesNm", "brchNm", "bizesId"]
    page = s.assign(dist_m=dist).sort_values(order, kind="stable").iloc[offset: offset + limit]
    end = offset + len(page)
    return {"level": level, "code": code, "name": u["name"], "sort": sort, "total": total, "offset": offset, "returned": len(page),
            "has_more": end < total, "next_offset": end if end < total else None,
            "records": [{"store_id": r.bizesId, "name": r.bizesNm, "branch": r.brchNm or None, "category_detail": r.indsSclsNm,
                         "distance_m": round(float(r.dist_m))} for r in page.itertuples()]}


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


MAX_COMPARE = 4
HINTERLAND_QUARTER = {"wrc_total": "wrc_quarter", "repop_total": "repop_quarter", "fac_total": "fac_quarter"}
REB_NEAR_M = 1000  # R-ONE 조사 상권 중심에서 이 거리 안이면 그 상권 임대료를 참고값으로 붙인다
COMPARE_ROWS = [  # (그룹, key, 라벨, kind, 출처 구분)
    ("매출", "per_store_month", "점포당 월평균 매출", "money", "seoul"),
    ("매출", "sales_yoy_pct", "매출 증감률(전년 동기)", "growth", "seoul"),
    ("매출", "sales_per_10k_flpop", "유동인구 1만 명당 분기 매출", "money", "seoul"),
    ("점포", "stores_sbiz", "점포 수(현재)", "count", "sbiz"),
    ("점포", "stores_change_2y", "점포 수 증감률(2년)", "growth", "dynamics"),
    ("점포", "stores_volatility", "점포수 변동성(분기 평균 변동폭)", "rate", "dynamics"),
    ("점포", "open_rate_y", "연 개업률(최근 1년)", "rate", "churn"),
    ("점포", "close_rate_y", "연 폐업률(최근 1년)", "rate", "churn"),
    ("점포", "frc_share", "프랜차이즈 비율", "rate", "seoul"),
    ("수요 기반", "wrc_total", "직장인구", "people", "hinterland"),
    ("수요 기반", "repop_total", "상주인구", "people", "hinterland"),
    ("수요 기반", "fac_total", "집객시설", "count", "hinterland"),
    ("앵커", "starbucks_zone_share", "스세권 매장 비율(스타벅스 250m)", "rate", "anchor"),
    ("앵커", "daiso_zone_share", "다세권 매장 비율(다이소 250m)", "rate", "anchor"),
    ("임대", "rent_small_shop", "소규모 상가 임대료(R-ONE)", "rent", "reb"),
    ("임대", "vacancy_small_shop_pct", "소규모 상가 공실률(R-ONE)", "rate", "reb"),
]


def _quarter_span(first: str, last: str) -> str:
    return store_churn.quarter_label(first) if first == last else f"{store_churn.quarter_label(first)}~{store_churn.quarter_label(last)}"


def _haversine_m(lon1, lat1, lon2, lat2) -> float:
    lon1, lat1, lon2, lat2 = map(np.radians, (lon1, lat1, lon2, lat2))
    a = np.sin((lat2 - lat1) / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin((lon2 - lon1) / 2) ** 2
    return float(2 * 6_371_008.8 * np.arcsin(np.sqrt(a)))


def _nearest_reb(lon: float, lat: float) -> dict | None:
    """가장 가까운 R-ONE 조사 상권(1km 이내)의 소규모 상가 임대료·공실률. 없으면 None."""
    try:
        reb = data_store.load_parquet("reb_zone_metrics.parquet")
    except data_store.DataNotReady:
        return None
    reb = reb.assign(d=[_haversine_m(lon, lat, r.lon, r.lat) for r in reb.itertuples()]).sort_values("d")
    r = reb.iloc[0]
    if r["d"] > REB_NEAR_M:
        return None
    return {"zone": r["reb_zone_nm"], "distance_m": round(float(r["d"])),
            "rent_small_shop": None if pd.isna(r["rent_small_shop"]) else round(float(r["rent_small_shop"]), 1),
            "vacancy_small_shop_pct": None if pd.isna(r["vacancy_small_shop_pct"]) else round(float(r["vacancy_small_shop_pct"]), 1)}


def _reb_quarter_label(col: str) -> str | None:
    """이 지표의 기준 분기('2026년 2분기'). 산출물에 기록돼 있지 않으면 None — 추측하지 않는다."""
    try:
        reb = data_store.load_parquet("reb_zone_metrics.parquet")
    except data_store.DataNotReady:
        return None
    return reb_quarters(reb.to_dict("records")).get(col)


def _cell(row) -> dict:
    """비교표 칸 하나 — 값이 없으면 사유를, 일부 업종만 썼으면 그 범위를 note 로 붙인다(전체 값으로 오해하지 않게)."""
    if row is None:
        return {"value": None, "note": REASON_TEXT[unit_metrics.NO_ROWS]}
    value = _num(row["value"])
    if value is None:
        return {"value": None, "note": REASON_TEXT.get(_reason(row) or unit_metrics.MISSING_INPUTS)}
    cell: dict = {"value": value}
    if row["total"] and row["used"] < row["total"]:
        share = row["excluded_sales_share"]
        cell["note"] = f"업종 {int(row['total'])}개 중 {int(row['used'])}개만 반영" + ("" if pd.isna(share) else f"(제외된 업종 매출 {share * 100:.0f}%)")
        cell["partial"] = True
    return cell


def compare(level: str, codes: list[str], svc: str | None, scls: str | None) -> dict:
    """같은 지도 단위 2~4곳을 지표별로 나란히. 종합 점수는 만들지 않고 값만 보여준다(무엇이 중요한지는 창업자가 정한다)."""
    codes = list(dict.fromkeys(codes))
    if not 1 <= len(codes) <= MAX_COMPARE:
        raise ValueError(f"비교할 단위는 1~{MAX_COMPARE}곳이어야 합니다")
    values, cov, latest, period, units = _unit_table(level, svc, scls)
    scope = scope_of(svc, scls)
    missing = [c for c in codes if c not in units.index]
    if missing:
        raise KeyError(", ".join(missing))
    # 자치구는 직장·상주인구·집객시설 표와 R-ONE 조사 상권에 대응하는 단위가 없어(행정동·상권만 있음) 그 행을 싣지 않는다.
    skipped = {"hinterland", "reb"} if level == "gu" else set()
    hl = None
    if "hinterland" not in skipped:
        cd = "trdar_cd" if level == "trdar" else "adongCd"
        hl = data_store.load_parquet(f"{level}_hinterland.parquet").set_index(cd)
    reb_asof = {} if "reb" in skipped else {k: _reb_quarter_label(k) for k in ("rent_small_shop", "vacancy_small_shop_pct")}
    rebs = {} if "reb" in skipped else {c: _nearest_reb(float(units.loc[c, "lon"]), float(units.loc[c, "lat"])) for c in codes}
    as_of = {"seoul": store_churn.quarter_label(latest), "sbiz": _sbiz_month(), "dynamics": period,
             "churn": f"{store_churn.quarter_label(_shift(latest, 3))}~{store_churn.quarter_label(latest)}",
             "anchor": _sbiz_month()}
    source = {"seoul": "서울시 상권분석서비스(추정매출·점포)", "sbiz": "소상공인 상가(상권)정보", "dynamics": "서울시 상권분석서비스(점포)",
              "churn": "서울시 상권분석서비스(개업·폐업)", "hinterland": "서울시 상권분석서비스(직장·상주인구·집객시설)",
              "anchor": "소상공인 상가(상권)정보 매장 좌표", "reb": "한국부동산원 R-ONE 임대동향(천원/㎡)"}
    rows = []
    for group, key, label, kind, src in COMPARE_ROWS:
        if src in skipped:
            continue
        cells = []
        for c in codes:
            if src == "hinterland":
                v = None if hl is None or c not in hl.index or pd.isna(hl.loc[c, key]) else round(float(hl.loc[c, key]))
                cells.append({"value": v})
            elif src == "reb":
                r = rebs[c]
                q = reb_asof[key]
                if r is None:
                    note = f"{REB_NEAR_M:,}m 안에 R-ONE 조사 상권 없음"
                elif r[key] is None:
                    note = f"가까운 '{r['zone']}'({r['distance_m']:,}m)은 {q or '해당 분기'} 소규모 상가 조사값이 없음(이전 분기 값으로 대체하지 않음)"
                else:
                    note = f"'{r['zone']}' 조사값 · {r['distance_m']:,}m"
                cells.append({"value": None if r is None else r[key], "note": note})
            elif key == "stores_sbiz":
                cells.append({"value": int(values.loc[c, "stores_sbiz"])})
            else:
                f = cov[key]
                row = f.loc[c] if c in f.index else None
                cells.append(_cell(row))
        if src == "hinterland":  # 수요 기반 표는 원천마다 최신 분기가 달라질 수 있어 행마다 그 표의 분기를 쓴다
            quarters = sorted({str(hl.loc[c, HINTERLAND_QUARTER[key]]) for c in codes if c in hl.index and pd.notna(hl.loc[c, HINTERLAND_QUARTER[key]])})
            row_as_of = _quarter_span(quarters[0], quarters[-1]) if quarters else None
        elif src == "reb":
            row_as_of = reb_asof[key] or "기준 분기 기록 없음"
        else:
            row_as_of = as_of[src]
        rows.append({"group": group, "key": key, "label": label, "kind": kind, "source": source[src], "as_of": row_as_of,
                     "scope": None if src in ("hinterland", "reb") else metric_scope(key, scope),
                     "basis": METRIC_BASIS.get(key), "cells": cells})
    notes = ["점수나 순위로 합치지 않았습니다. 어떤 지표가 중요한지는 업종·자금·운영 방식에 따라 다릅니다.",
             "R-ONE 임대료는 5개 조사 상권 값만 있어, 가까운 조사 상권 값을 참고로 붙였습니다(해당 상권 실제 임대료 아님)."]
    if skipped:
        notes = [notes[0], "자치구 단위에서는 직장·상주인구·집객시설과 임대료를 비교하지 않습니다(행정동·상권 단위에서 비교하세요)."]
    if scope["notice"]:
        notes.insert(1, scope["notice"])
    return {"level": level, "svc": svc, "scls": scls, "scope": scope,
            "units": [{"code": c, "name": units.loc[c, "name"], "type": units.loc[c].get("type") if "type" in units else None} for c in codes],
            "rows": rows, "notes": notes}
