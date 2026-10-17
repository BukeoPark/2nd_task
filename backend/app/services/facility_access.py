"""집객시설 접근성 계산(준비 단계) — 매장 반경 250·500·1000m 안 시설 종류별 개수·최근접 직선거리·시설 목록. 아직 공개 API 에 연결하지 않았다.

pipelines/transform/build_facilities 의 산출물(facilities.parquet·facilities_meta.json)만 읽는다(backend 는 pipelines 를 import 하지 않는다).

원칙
  - 서비스용 분석 대상은 `analysis_eligible` 시설뿐이다: 공식 원천 좌표 + 공개 이용 권한 확인(confirmed) + 좌표 있음 + 폐업·취소 아님 + 독립 시설(단과대학 건물은 캠퍼스로 세지 않음).
    권한이 확인되지 않은 카카오 보조 시설은 기본으로 쓰지 않는다. 진단(공식만 vs 전체 비교)에서만 include_unconfirmed=True 로 켠다 — 그 결과를 서비스에 내보내지 않는다.
  - 공식 원천이 없는 종류(대학교·아울렛)는 '0곳'이 아니라 no_official_source(자료 없음)로 돌려준다. 공식 목록 자체가 일부 시설만 담을 수 있어(문화시설: 서울시 등재 목록, 영화관: 좌표가 등록된 상영관)
    개수는 '공식 목록 기준'이다.
  - 수집 범위가 반경을 덮지 못하거나(구역+1.1km), 공식 원천이 파일럿 두 구뿐인 종류(pilot_gus_only, 지금은 해당 종류 없음)에서 반경이 구 경계를 넘거나, 카카오 검색 한도에 닿은 구역(진단용)과 겹치면
    0곳이어도 '없음'이 아니라 확인 불가이고, 0 이 아닌 값도 '관측된 N곳 이상'이다. 최근접 거리는 reliable 플래그로 신뢰 여부를 알린다.
  - 거리는 직선거리다. 이용객·방문객 수는 자료가 없어 어디에도 없다. 종합 점수는 만들지 않는다.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from shapely.geometry import Point

from app.services import bus_access, data_store

RADII_M = (250, 500, 1000)
DEFAULT_BUFFER_M = 1_100
TYPES = ("general_hospital", "university", "department_store", "shopping_mall", "outlet", "hypermarket", "cinema", "cultural_facility")
TYPE_LABEL = {"general_hospital": "종합병원", "university": "대학교", "department_store": "백화점", "shopping_mall": "복합쇼핑몰", "outlet": "아울렛", "hypermarket": "대형마트",
              "cinema": "영화관", "cultural_facility": "문화시설"}
OFFICIAL_COVERAGE = {"general_hospital": "national", "cinema": "national", "cultural_facility": "seoul_wide", "department_store": "national", "shopping_mall": "national", "hypermarket": "national"}   # 공식 원천이 있는 종류와 범위(없는 종류는 공식 원천 없음)
CAVEATS = [
    "직선거리 기준입니다. 시설 이용객·방문객 수 자료는 없어 규모나 수요를 추정하지 않았습니다.",
    "공식 자료(건강보험심사평가원 병원정보·서울시 LOCALDATA 병원 인허가·행정안전부 대규모점포·영화상영관·소상공인 상가정보·서울시 문화공간)와 이용 권한이 확인된 시설만 셉니다. 공식 원천이 없는 종류는 '자료 없음'이며 0곳이 아닙니다.",
    "공식 목록은 일부 시설만 담을 수 있습니다(문화시설은 서울시 등재 목록, 영화관은 좌표가 등록된 상영관만). 개수는 공식 목록 기준입니다.",
]


def _lv_independent(df: pd.DataFrame) -> pd.Series:
    return df["counts_as_independent"].astype(bool) if "counts_as_independent" in df.columns else pd.Series(True, index=df.index)


def _s(v):
    """parquet 의 빈 문자열 칸(NaN)을 None 으로."""
    return v if isinstance(v, str) else None


def eligible(fac: pd.DataFrame, include_unconfirmed: bool = False) -> pd.DataFrame:
    """분석에 쓸 시설. 기본은 analysis_eligible(공식·권한 확인). include_unconfirmed=True 는 진단 전용이다."""
    if not include_unconfirmed:
        return fac[fac["analysis_eligible"].astype(bool)]
    return fac[fac["coord_ok"].astype(bool) & fac["usable"].astype(bool) & _lv_independent(fac)]


def pilot_boundary_distance_m(lon: float, lat: float) -> float | None:
    """파일럿 두 구 안에 있는 점에서 구 경계까지의 거리(m). 구 밖이면 None — 공식 병원 원천은 이 두 구뿐이라 반경이 경계를 넘으면 완전하지 않다."""
    poly, k = bus_access._pilot_local()
    pt = Point(lon * 111_320 * k, lat * 110_574)
    return float(poly.boundary.distance(pt)) if poly.contains(pt) else None


def _intersects_zone(lon: float, lat: float, radius_m: float, zone: dict) -> bool:
    """반경 원(위경도 평면 근사의 사각형 경계)이 검색 한도 구역과 겹치는가."""
    x1, y1, x2, y2 = zone["rect"]
    dlat = radius_m / 110_574
    dlon = radius_m / (111_320 * np.cos(np.radians(lat)))
    return not (lon + dlon < x1 or lon - dlon > x2 or lat + dlat < y1 or lat - dlat > y2)


def compute(lon: float, lat: float, fac: pd.DataFrame, meta: dict, radius_m: int, pilot_m: float | None, boundary_m: float | None, include_unconfirmed: bool = False) -> dict:
    """한 지점의 반경별 시설 접근성. fac = facilities.parquet 전체(이 함수가 분석 대상을 거른다)."""
    if radius_m not in RADII_M:
        raise ValueError(f"radius_m 은 {list(RADII_M)} 중 하나여야 합니다")
    buffer_m = float(meta.get("buffer_m", DEFAULT_BUFFER_M))
    pool = eligible(fac, include_unconfirmed)
    pool = pool[pool["in_scope"].astype(bool)]
    zones = meta.get("incomplete_zones", []) if include_unconfirmed else []     # 한도 구역은 카카오 시설에만 해당 — 공식만 쓸 때는 영향이 없다
    by_radius, listing = {}, []
    d_all = bus_access._haversine_m(lon, lat, pool["lon"].to_numpy(), pool["lat"].to_numpy()) if len(pool) else np.array([])
    pool = pool.assign(d_store_m=d_all)
    for r in RADII_M:
        extent_ok = pilot_m is not None and pilot_m + r <= buffer_m
        per_type = {}
        for t in TYPES:
            ft_all = fac[(fac["facility_type"] == t)]
            has_official = bool(((ft_all["analysis_eligible"].astype(bool)) & ft_all["in_scope"].astype(bool)).any()) or (include_unconfirmed and len(pool[pool["facility_type"] == t]) > 0)
            cov = OFFICIAL_COVERAGE.get(t)
            partial = (cov == "pilot_gus_only" and not include_unconfirmed and (boundary_m is None or boundary_m < r))
            zone_hit = any(t in z.get("types", []) and _intersects_zone(lon, lat, r, z) for z in zones)
            if not has_official:
                per_type[t] = {"type": t, "label": TYPE_LABEL[t], "count": None, "count_state": "no_official_source", "nearest": None, "reliable": False, "incomplete": True,
                               "reason": "이 종류는 공식 좌표 자료가 없어(승인·확인된 원천 없음) 분석하지 않았습니다. 0곳이 아니라 자료 없음입니다."}
                continue
            sub = pool[pool["facility_type"] == t]
            within = sub[sub["d_store_m"] <= r]
            reasons = []
            if not extent_ok:
                reasons.append("반경 일부가 수집 범위(파일럿 구역+1.1km) 밖")
            if partial:
                reasons.append("공식 원천이 양천·영등포 구 안 시설뿐인데 반경이 구 경계를 넘음")
            if zone_hit:
                reasons.append("카카오 검색 한도에 닿은 불완전 수집 구역과 겹침")
            incomplete = bool(reasons)
            n = len(within)
            state = ("lower_bound" if n else "incomplete_zero") if incomplete else ("ok" if n else "zero")
            nearest = None
            if len(sub):
                row = sub.loc[sub["d_store_m"].idxmin()]
                nearest = {"distance_m": int(round(float(row["d_store_m"]))), "name": row["name"]}
            per_type[t] = {"type": t, "label": TYPE_LABEL[t], "count": int(n), "count_state": state, "nearest": nearest, "reliable": not incomplete, "incomplete": incomplete,
                           "reason": " · ".join(reasons) if reasons else None}
        by_radius[str(r)] = {"radius_m": r, "extent_complete": extent_ok, "by_type": per_type}
    sel = pool[pool["d_store_m"] <= radius_m].sort_values(["d_store_m", "facility_id"])
    for row in sel.itertuples():
        listing.append({"facility_id": row.facility_id, "name": row.name, "type": row.facility_type, "subtype": _s(row.subtype), "lon": round(float(row.lon), 6), "lat": round(float(row.lat), 6),
                        "distance_m": int(round(float(row.d_store_m))), "source_name": _s(row.source_name), "source_type": row.source_type, "coordinate_source": _s(row.coordinate_source),
                        "reference_date": _s(row.reference_date), "usage_permission_status": row.usage_permission_status, "coverage_status": row.coverage_status, "attribution": _s(row.attribution)})
    attributions = sorted({x["attribution"] for x in listing if x["attribution"]})
    return {"status": "ok", "radius_m": radius_m, "selected": by_radius[str(radius_m)], "by_radius": by_radius, "facilities": listing, "includes_unconfirmed": include_unconfirmed,
            "official_only": not include_unconfirmed, "attributions": attributions, "caveats": CAVEATS,
            "scope": {"distance_to_pilot_m": None if pilot_m is None else round(float(pilot_m), 1), "boundary_distance_m": None if boundary_m is None else round(float(boundary_m), 1), "buffer_m": buffer_m}}


def unavailable(message: str) -> dict:
    return {"status": "unavailable", "message": message, "caveats": CAVEATS}


def metrics(store: dict, radius_m: int, *, include_unconfirmed: bool = False) -> dict:
    """매장 한 곳의 시설 접근성(공식·권한 확인 시설만이 기본). 산출물이 없으면 오류 대신 unavailable."""
    try:
        fac = data_store.load_parquet("facilities.parquet")
        meta = data_store.load_json("facilities_meta.json")
    except data_store.DataNotReady:
        return unavailable("집객시설 자료가 아직 준비되지 않았습니다(파이프라인 실행 필요). 0곳이 아니라 확인 불가입니다.")
    lon, lat = float(store["lon"]), float(store["lat"])
    return compute(lon, lat, fac, meta, radius_m, bus_access.distance_to_pilot_m(lon, lat), pilot_boundary_distance_m(lon, lat), include_unconfirmed)


def source_difference(store: dict, radius_m: int) -> dict:
    """진단: 공식·권한 확인 시설만 vs 권한 미확인 카카오 보조까지 — 종류별 개수 차이. 서비스 응답으로 내보내지 않는다."""
    a = metrics(store, radius_m)
    b = metrics(store, radius_m, include_unconfirmed=True)
    if a["status"] != "ok" or b["status"] != "ok":
        return {"status": "unavailable"}
    out = {}
    for t in TYPES:
        x, y = a["selected"]["by_type"][t], b["selected"]["by_type"][t]
        out[t] = {"official_only": x["count"], "with_unconfirmed": y["count"], "official_state": x["count_state"],
                  "difference": None if x["count"] is None else (y["count"] or 0) - x["count"]}
    return {"status": "ok", "radius_m": radius_m, "by_type": out}
