"""버스 접근성 — 매장 반경 250·500·1000m 안 버스정류장 수·최근접 직선거리·이용량 연결(관측된 부분).

pipelines/transform/build_bus_stops 의 산출물(bus_stops.parquet·bus_meta.json)만 읽는다(backend 는 pipelines 를 import 하지 않는다).

숫자를 읽는 법(화면과 응답이 같은 말을 한다)
  - 정류장 수는 같은 정류장의 BIS 별 중복을 하나로 줄인 대표 정류장(is_primary)만 센다. 반대 방향(맞은편)은 번호가 달라 따로 센다.
  - '0곳'은 조회가 정상이고 수집 범위가 반경을 덮은 상태에서 정류장이 없다는 뜻이다. 반경의 일부가 수집 범위 밖이면(범위 불완전) 0곳이어도
    '없음'이 아니라 '확인 불가'이고, 0 이 아닌 값도 '관측된 N곳 이상'이다.
  - 이용량은 정류장별 일일 평균 승차·하차 인원(원천 2025년)이다. 위치정보와 연결된 정류장만 값이 있어, 연결 안 된 정류장이 있으면
    합계는 '관측된 부분'이다. 승차와 하차는 따로 두고, 환승은 승차·하차와 겹치는지 확인하지 못해 응답에 넣지도, 더하지도 않는다.
  - 거리는 직선거리다(보행 네트워크 거리가 아님). 이용량은 실시간 유동인구나 매장 방문객 수가 아니다.
"""
from __future__ import annotations

from functools import lru_cache

import numpy as np
import pandas as pd
from shapely.geometry import Point, shape
from shapely.ops import transform as shp_transform
from shapely.ops import unary_union

from app.services import data_store

RADII_M = (250, 500, 1000)
EARTH_M = 6_371_008.8

UNLINKED_LABEL = {
    "usage_not_collected": "서울 밖 정류장이라 이용량 자료 범위 밖",
    "ambiguous": "같은 번호의 이용량 행이 여럿이라 연결하지 않음",
    "name_conflict": "번호는 같지만 정류장명이 달라 연결하지 않음",
    "no_usage": "이용량 자료에 같은 번호가 없음",
    "no_mobile_no": "모바일 번호가 없어 연결할 수 없음",
    "other": "연결하지 못함",
}
UNLINKED_REASON = {
    "outside_seoul": "usage_not_collected", "multi_usage_rows": "ambiguous", "ambiguous_stop_key": "ambiguous",
    "name_conflict": "name_conflict", "no_usage_candidate": "no_usage", "no_mobile_no": "no_mobile_no",
}
CAVEATS = [
    "직선거리 기준입니다. 큰 도로·철도·하천 때문에 실제 도보 거리는 더 길 수 있습니다.",
    "이용량은 정류장별 일일 평균 승차·하차 인원(2025년)이며 실시간 유동인구나 매장 방문객 수가 아닙니다.",
    "위치정보와 연결된 정류장의 이용량만 더한 값입니다. 승차와 하차는 따로 보여주고, 환승은 겹침 여부를 확인하지 못해 합산하지 않았습니다.",
    "같은 정류장이 서울·경기·인천 BIS 에 중복 실려 있어 하나로 줄여 셉니다. 반대 방향 정류장은 번호가 달라 따로 셉니다.",
]


def _haversine_m(lon: float, lat: float, lons: np.ndarray, lats: np.ndarray) -> np.ndarray:
    la1, la2 = np.radians(lat), np.radians(lats)
    a = np.sin((la2 - la1) / 2) ** 2 + np.cos(la1) * np.cos(la2) * np.sin(np.radians(lons - lon) / 2) ** 2
    return 2 * EARTH_M * np.arcsin(np.sqrt(a))


@lru_cache(maxsize=1)
def _pilot_local():
    """파일럿 구역 폴리곤(미터 단위 지역 평면 — 서울 위도 기준 등장방형). 점-폴리곤 거리가 0.5% 안팎으로 맞는다."""
    gj = data_store.load_json("regions.geojson")
    k = np.cos(np.radians(37.52))
    to_m = lambda x, y, z=None: (np.asarray(x) * 111_320 * k, np.asarray(y) * 110_574)  # noqa: E731
    return unary_union([shp_transform(to_m, shape(f["geometry"])) for f in gj["features"]]), k


def distance_to_pilot_m(lon: float, lat: float) -> float | None:
    try:
        poly, k = _pilot_local()
    except data_store.DataNotReady:
        return None
    return float(poly.distance(Point(lon * 111_320 * k, lat * 110_574)))


def _slice(stops: pd.DataFrame, dist: np.ndarray, radius_m: int, pilot_m: float | None, buffer_m: float) -> dict:
    """한 반경의 값. 정류장 수·이용량 연결·관측된 부분 합계·범위 완전성."""
    inside = stops.loc[dist <= radius_m]
    n = len(inside)
    complete = pilot_m is not None and pilot_m + radius_m <= buffer_m
    linked = inside.loc[inside["usage_status"] == "linked"]
    k = len(linked)
    reasons: dict[str, int] = {}
    for status in inside.loc[inside["usage_status"] != "linked", "usage_status"]:
        key = UNLINKED_REASON.get(status, "other")
        reasons[key] = reasons.get(key, 0) + 1
    if n == 0:
        count_state = "zero" if complete else "incomplete_zero"
    else:
        count_state = "ok" if complete else "lower_bound"
    usage_state = "no_stops" if n == 0 else "none_linked" if k == 0 else "all_linked" if k == n else "partial"
    return {
        "radius_m": radius_m, "count": n, "count_state": count_state, "scope_complete": complete,
        "linked": k, "unlinked": n - k, "linked_ratio": None if n == 0 else round(k / n, 4), "usage_state": usage_state,
        # 연결된 정류장만 더한 관측된 부분 합계 — 연결이 하나도 없으면 0 이 아니라 None(자료 없음)
        "boardings_observed": None if k == 0 else int(round(float(linked["avg_daily_boardings"].sum()))),
        "alightings_observed": None if k == 0 else int(round(float(linked["avg_daily_alightings"].sum()))),
        "unlinked_breakdown": [{"reason": r, "label": UNLINKED_LABEL[r], "count": c} for r, c in sorted(reasons.items(), key=lambda x: (-x[1], x[0]))],
    }


def compute(lon: float, lat: float, stops: pd.DataFrame, meta: dict, radius_m: int, pilot_m: float | None) -> dict:
    """순수 계산 — stops 는 대표 정류장(is_primary)만 담은 표(lon·lat·usage_status·avg_daily_*)."""
    if radius_m not in RADII_M:
        raise ValueError(f"radius_m 은 {list(RADII_M)} 중 하나여야 합니다")
    buffer_m = float(meta["buffer_m"])
    dist = _haversine_m(lon, lat, stops["lon"].to_numpy(), stops["lat"].to_numpy()) if len(stops) else np.array([])
    by_radius = {str(r): _slice(stops, dist, r, pilot_m, buffer_m) for r in RADII_M}
    nearest = None
    if len(stops):
        i = int(np.argmin(dist))
        reach = None if pilot_m is None else buffer_m - pilot_m          # 수집 범위가 덮는 반경
        nearest = {"distance_m": int(round(float(dist[i]))), "name": str(stops["name"].iloc[i]),
                   "reliable": reach is not None and float(dist[i]) <= reach}
    reach = None if pilot_m is None else max(buffer_m - pilot_m, 0.0)
    complete = pilot_m is not None and pilot_m + radius_m <= buffer_m
    return {
        "status": "ok", "radius_m": radius_m, "selected": by_radius[str(radius_m)], "by_radius": by_radius, "nearest": nearest,
        "scope": {"complete": complete, "covered_radius_m": None if reach is None else int(reach), "distance_to_pilot_m": None if pilot_m is None else round(pilot_m, 1),
                  "extent": meta.get("extent"),
                  "reason": None if complete else ("수집 범위를 확인할 수 없습니다." if pilot_m is None else
                                                   f"이 반경(최대 {radius_m}m)의 일부가 수집 범위 밖이라 정류장 수가 실제보다 적을 수 있습니다.")},
        "usage_basis": {"year": meta.get("usage_year"), "text": f"정류장별 일일 평균 승차·하차 인원({meta.get('usage_year')}년), 연결된 정류장만 더한 값"},
        "caveats": CAVEATS,
        "source": {"title": "국토교통부 전국 버스정류장 위치정보 · 시군구별 정류장평균이용량",
                   "reference": f"위치정보 {meta.get('loc_collected_at')} 기준 · 이용량 {meta.get('usage_year')}년"},
    }


def unavailable(message: str) -> dict:
    """자료가 아직 없을 때 — 0곳이 아니라 '준비 중/확인 불가'로 보이게 한다."""
    return {"status": "unavailable", "message": message, "caveats": CAVEATS}


def metrics(store: dict, radius_m: int) -> dict:
    """매장 한 곳의 버스 접근성. 산출물이 없으면 오류 대신 unavailable 을 돌려줘 같은 응답의 다른 블록이 그대로 나가게 한다."""
    try:
        stops = data_store.load_parquet("bus_stops.parquet")
        meta = data_store.load_json("bus_meta.json")
    except data_store.DataNotReady:
        return unavailable("버스 정류장 자료가 아직 준비되지 않았습니다(파이프라인 실행 필요). 0곳이 아니라 확인 불가입니다.")
    primary = stops.loc[stops["is_primary"] & stops["lon"].notna() & stops["lat"].notna()].reset_index(drop=True)
    return compute(float(store["lon"]), float(store["lat"]), primary, meta, radius_m, distance_to_pilot_m(float(store["lon"]), float(store["lat"])))
