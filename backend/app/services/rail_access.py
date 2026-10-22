"""철도(지하철·도시철도) 접근성 — 매장 반경 250·500·1000m 안 고유 역사 수·출입구 수·최근접 역사/출입구·2025 일평균 승하차(연결된 역사만).

pipelines/transform/build_rail_national 의 산출물(rail_official_stations·rail_usage_complex_2025·rail_entrance_links·rail_national_meta)만 읽는다(backend 는 pipelines 를 import 하지 않는다).

숫자를 읽는 법(화면과 응답이 같은 말을 한다)
  - 역 수는 환승 노선을 겹쳐 세지 않는 '역사(complex)' 단위다. 같은 이름이 400m 안에 있는 노선별 행은 한 역사로 묶여 있다.
  - 포함 기준(역사마다 하나의 접근 거리): 출입구 좌표가 있는 역사는 가장 가까운 출입구까지의 거리를, 없는 역사는 공식 역사 중심점까지의 거리를 쓴다
    (출입구와 중심점을 둘 다 세지 않는다). 그래서 한 반경 안에 두 기준이 섞일 수 있고, 응답이 기준별 역사 수를 따로 알려 준다.
    출입구 좌표는 카카오 로컬 보조 자료(비공식, 누락 가능)이고 공식 역사 좌표(국가철도공단 표준데이터)와 구분한다.
  - 출입구 수는 반경 안에 좌표가 확인된 출입구 수다. 출입구 자료는 파일럿 구역 + 수집 버퍼 안에만 있어 그 밖의 반경 경계에서는 '확인된 수'일 뿐 전체 수가 아니다(entrance_scope_complete).
  - 이용량은 역사별 2025 달력 연도 하루 평균 승차·하차 인원(연결된 노선만의 관측된 부분 합계 — lines_with_usage/lines_total)이다. 연결된 역사만 값이 있고,
    없는 역사는 0명이 아니라 '자료 없음'이다. 승차와 하차는 따로 두고, 반경 밖 역의 이용량은 더하지 않는다. 실시간 유동인구나 매장 방문객 수가 아니다.
  - 거리는 직선거리다(보행 네트워크 거리가 아님).

출입구 좌표 사용 중단(EXIT_COORDINATES_ENABLED = False)
  - 지금까지의 출입구 좌표는 카카오 로컬 API 결과였고, 카카오 공식 계정은 로컬 API 결과를 '어떠한 형태로든 저장하여 사용할 수 없다'고 답했다(2026-08-20).
    서울교통빅데이터플랫폼 tnSubwayEntrc.csv(공식)는 좌표가 출입구가 아니라 연결된 버스정류장의 위치라 대체할 수 없었다.
  - 그래서 출입구 좌표를 읽지도(rail_entrance_links.parquet 를 열지 않는다) 응답에 싣지도 않으며, 모든 역사는 공식 역사 중심점까지의 거리로 판단한다.
    이 거리는 '역 중심점까지의 직선거리'이고 출입구까지의 거리가 아니다. 공식 출입구 좌표 자료가 생기면 이 값을 켜고 출처를 바꾼다.
"""
from __future__ import annotations

import logging
import re

import numpy as np
import pandas as pd

from app.services import bus_access, data_store

log = logging.getLogger(__name__)
EXIT_COORDINATES_ENABLED = False         # 카카오 로컬 출입구 좌표는 저장 이용 조건이 확인되지 않아 쓰지 않는다(위 docstring)
RADII_M = (250, 500, 1000)
DEFAULT_BUFFER_M = 1_100
SOURCE_LABEL = {"seoul_card": "서울 교통카드(월별)", "seoul_daily": "서울교통공사(일별)", "busan": "부산교통공사", "incheon": "인천교통공사"}
CAVEATS_WITH_EXITS = [
    "직선거리 기준입니다. 환승 노선은 한 역사로 묶어 한 번만 셉니다.",
    "출입구 좌표가 있는 역사는 가장 가까운 출입구까지의 거리로, 없는 역사는 공식 역사 중심점까지의 거리로 판단합니다(두 기준이 섞일 수 있음).",
    "이용량은 연결된 역사의 2025년 하루 평균 승차·하차 인원(이용량이 확인된 역만 더한 값)이며 실시간 유동인구나 매장 방문객 수가 아닙니다. 승차와 하차는 합치지 않았고, 이용량이 없는 역은 0명이 아니라 '자료 없음'입니다.",
    "반경 안에 중심점·출입구가 들어온 역사의 이용량만 더했고, 반경 밖 역의 이용량은 포함하지 않았습니다.",
]
CAVEATS_CENTER_ONLY = [
    "직선거리 기준입니다. 환승 노선은 한 역사로 묶어 한 번만 셉니다.",
    "거리는 공식 역사 중심점까지의 직선거리이며 출입구까지의 거리가 아닙니다. 이용 조건이 확인된 공식 출입구 좌표 자료가 없어 출입구 위치는 쓰지 않습니다.",
    CAVEATS_WITH_EXITS[2],
    "반경 안에 중심점이 들어온 역사의 이용량만 더했고, 반경 밖 역의 이용량은 포함하지 않았습니다.",
]
CAVEATS = CAVEATS_WITH_EXITS if EXIT_COORDINATES_ENABLED else CAVEATS_CENTER_ONLY
ENTRANCE_COLUMNS = ["exit_id", "station_line_id", "exit_label", "lon", "lat", "x_5179", "y_5179", "official_station_id", "national_complex_id", "dist_to_official_m"]


def entrance_links() -> pd.DataFrame:
    """출입구 좌표 표. 사용 중단 상태에서는 파일을 열지 않고 빈 표를 돌려준다 — 권한 미확인 좌표가 서버 계산에 들어오지 않는다."""
    if not EXIT_COORDINATES_ENABLED:
        return pd.DataFrame(columns=ENTRANCE_COLUMNS)
    return data_store.load_parquet("rail_entrance_links.parquet")


def _exit_no(label: str) -> str | None:
    m = re.search(r"(\d+(?:-\d+)?)", str(label))
    return m.group(1) if m else None


def build_complexes(official: pd.DataFrame, usage: pd.DataFrame, entrances: pd.DataFrame) -> pd.DataFrame:
    """역사 표 — 공식 노선별 행을 national_complex_id 로 묶는다(중심점은 소속 행 좌표 평균). 출입구·이용량을 붙인다."""
    ok = official[official["coord_ok"]]
    g = ok.groupby("national_complex_id", sort=True)
    cx = pd.DataFrame({
        "complex_id": list(g.groups),
        "name": g["name"].first().to_numpy(),
        "lines": g["line_std"].agg(lambda s: "·".join(sorted(set(s)))).to_numpy(),
        "operators": g["operator_std"].agg(lambda s: "·".join(sorted(set(s)))).to_numpy(),
        "region": g["region"].first().to_numpy(),
        "lon": g["lon"].mean().to_numpy(), "lat": g["lat"].mean().to_numpy(),
    })
    ex = entrances.dropna(subset=["national_complex_id"])
    cx["n_exits_known"] = cx["complex_id"].map(ex.groupby("national_complex_id").size()).fillna(0).astype(int)
    u = usage.set_index("national_complex_id")
    for col in ("usage_state", "avg_daily_boardings_2025", "avg_daily_alightings_2025", "months_observed_min", "complete_2025", "lines_total", "lines_with_usage", "sources"):
        cx[col] = cx["complex_id"].map(u[col]) if col in u.columns else None
    cx["usage_state"] = cx["usage_state"].fillna("none_linked")
    return cx


def _usage_regions(cx: pd.DataFrame) -> list[str]:
    return sorted(cx.loc[cx["usage_state"].isin(["all_linked", "partial"]), "region"].unique())


def _station_usage(row, usage_regions: set[str]) -> dict:
    state = row["usage_state"]
    linked = state in ("all_linked", "partial")
    return {
        "state": state,
        "boardings": float(row["avg_daily_boardings_2025"]) if linked and pd.notna(row["avg_daily_boardings_2025"]) else None,
        "alightings": float(row["avg_daily_alightings_2025"]) if linked and pd.notna(row["avg_daily_alightings_2025"]) else None,
        "lines_with_usage": int(row["lines_with_usage"]) if pd.notna(row["lines_with_usage"]) else 0,
        "lines_total": int(row["lines_total"]) if pd.notna(row["lines_total"]) else None,
        "months_observed": int(row["months_observed_min"]) if linked and pd.notna(row["months_observed_min"]) else None,
        "complete_2025": bool(row["complete_2025"]) if linked and pd.notna(row["complete_2025"]) else False,
        "sources": [SOURCE_LABEL.get(s, s) for s in str(row["sources"] or "").split("·") if s] if linked else [],
        "reason": None if linked else ("no_source_for_region" if row["region"] not in usage_regions else "no_usage_row"),
    }


def _slice(cx: pd.DataFrame, eff: np.ndarray, ent_d: np.ndarray, radius_m: int, entrance_complete: bool, usage_regions: set[str]) -> dict:
    inc = eff <= radius_m
    sel = cx[inc]
    n = len(sel)
    by_entrance = int((sel["n_exits_known"] > 0).sum())
    states = sel["usage_state"]
    linked = sel[states.isin(["all_linked", "partial"])]
    no_source = int(((states == "none_linked") & ~sel["region"].isin(usage_regions)).sum())
    out = {
        "radius_m": radius_m, "count": n, "count_state": "zero" if n == 0 else "ok",
        "stations_by_basis": {"entrance": by_entrance, "center": n - by_entrance},
        "mixed_basis": 0 < by_entrance < n,
        "entrances": int((ent_d <= radius_m).sum()), "entrance_scope_complete": entrance_complete,
        "center_inside_but_entrance_outside": int(((cx["n_exits_known"] > 0) & (eff > radius_m) & (cx["_center_d"] <= radius_m)).sum()),
        "linked": int(len(linked)), "unlinked": int(n - len(linked)), "linked_ratio": round(len(linked) / n, 4) if n else None,
        "usage_state": "no_stations" if n == 0 else ("none_linked" if len(linked) == 0 else ("all_linked" if (states == "all_linked").all() else "partial")),
        "boardings_observed": round(float(linked["avg_daily_boardings_2025"].sum()), 1) if len(linked) else None,
        "alightings_observed": round(float(linked["avg_daily_alightings_2025"].sum()), 1) if len(linked) else None,
        "complete_2025_stations": int(linked["complete_2025"].astype(bool).sum()), "partial_line_stations": int((linked["lines_with_usage"] < linked["lines_total"]).sum()),
        "no_source_region_stations": no_source,
    }
    return out


def compute(lon: float, lat: float, cx: pd.DataFrame, ent: pd.DataFrame, meta: dict, radius_m: int, pilot_m: float | None, buffer_m: float = DEFAULT_BUFFER_M) -> dict:
    """한 지점의 철도 접근성. cx = build_complexes 결과, ent = 출입구(national_complex_id·exit_label·lon·lat)."""
    if radius_m not in RADII_M:
        raise ValueError(f"radius_m 은 {list(RADII_M)} 중 하나여야 합니다")
    cx = cx.reset_index(drop=True).copy()
    cx["_center_d"] = bus_access._haversine_m(lon, lat, cx["lon"].to_numpy(), cx["lat"].to_numpy())
    ent = ent.dropna(subset=["national_complex_id"]).reset_index(drop=True).copy()
    ent["_d"] = bus_access._haversine_m(lon, lat, ent["lon"].to_numpy(), ent["lat"].to_numpy()) if len(ent) else np.array([])
    cx["n_exits_known"] = cx["complex_id"].map(ent.groupby("national_complex_id").size()).fillna(0).astype(int)      # 출입구 표와 항상 같은 값
    emin = ent.groupby("national_complex_id")["_d"].min() if len(ent) else pd.Series(dtype=float)
    cx["_entrance_d"] = cx["complex_id"].map(emin)
    has_ent = cx["_entrance_d"].notna()
    # 역사마다 접근 거리 하나: 출입구가 있으면 가장 가까운 출입구, 없으면 공식 중심점
    eff = np.where(has_ent, cx["_entrance_d"], cx["_center_d"]).astype(float)
    cx["_eff"] = eff
    cx["_basis"] = np.where(has_ent, "entrance", "center")
    usage_regions = set(_usage_regions(cx))
    ent_d = ent["_d"].to_numpy() if len(ent) else np.array([])
    complete = lambda r: pilot_m is not None and pilot_m + r <= buffer_m  # noqa: E731
    by_radius = {str(r): _slice(cx, eff, ent_d, r, complete(r), usage_regions) for r in RADII_M}
    selected = by_radius[str(radius_m)]

    order = np.argsort(eff, kind="stable")
    nearest = None
    if len(cx):
        row = cx.iloc[int(order[0])]
        nearest = {"name": row["name"], "lines": row["lines"], "distance_m": int(round(float(row["_eff"]))), "basis": row["_basis"], "center_distance_m": int(round(float(row["_center_d"]))),
                   "in_radius": bool(row["_eff"] <= radius_m)}
    near_exit = None
    if len(ent):
        e = ent.iloc[int(ent["_d"].to_numpy().argmin())]
        st = cx[cx["complex_id"] == e["national_complex_id"]]
        near_exit = {"station_name": st["name"].iloc[0] if len(st) else None, "exit_label": e["exit_label"], "exit_no": _exit_no(e["exit_label"]), "distance_m": int(round(float(e["_d"]))),
                     "source": "카카오 로컬(보조·비공식)", "in_radius": bool(e["_d"] <= radius_m)}

    stations = []
    for i in order:
        row = cx.iloc[int(i)]
        if row["_eff"] > radius_m:
            break
        ex = ent[ent["national_complex_id"] == row["complex_id"]].sort_values("_d")
        stations.append({
            "complex_id": row["complex_id"], "name": row["name"], "lines": row["lines"], "operators": row["operators"], "region": row["region"],
            "lon": round(float(row["lon"]), 6), "lat": round(float(row["lat"]), 6), "distance_m": int(round(float(row["_eff"]))), "basis": row["_basis"],
            "center_distance_m": int(round(float(row["_center_d"]))), "has_entrances": bool(row["n_exits_known"] > 0),
            "entrances": [{"exit_label": r_["exit_label"], "exit_no": _exit_no(r_["exit_label"]), "lon": round(float(r_["lon"]), 6), "lat": round(float(r_["lat"]), 6), "distance_m": int(round(float(r_["_d"])))}
                          for _, r_ in ex.iterrows()],
            "usage": _station_usage(row, usage_regions),
        })
    om = meta.get("official_file", {})
    bd = meta.get("official_base_dates", {})
    srcs = meta.get("usage_sources", {})
    regions_loc = [{"region": r_["region"], "stations": r_["complexes"]} for r_ in meta.get("regions", [])]
    return {
        "status": "ok", "radius_m": radius_m, "selected": selected, "by_radius": by_radius, "stations": stations,
        "nearest_station": nearest, "nearest_entrance": near_exit,
        "inclusion_rule": ("역사마다 접근 거리 하나를 씁니다: 확인된 출입구가 있으면 가장 가까운 출입구까지, 없으면 공식 역사 중심점까지. 접근 거리가 반경 이내인 역사만 셉니다." if EXIT_COORDINATES_ENABLED
                           else "역사마다 공식 역사 중심점까지의 직선거리를 씁니다(출입구까지의 거리가 아님). 중심점이 반경 이내인 역사만 셉니다."),
        "entrance_data": {"enabled": EXIT_COORDINATES_ENABLED, "reason": None if EXIT_COORDINATES_ENABLED else "이용 조건이 확인된 공식 출입구 좌표 자료가 없어 출입구 위치를 쓰지 않습니다."},
        "scope": {"entrance_scope_complete": selected["entrance_scope_complete"], "distance_to_pilot_m": None if pilot_m is None else round(float(pilot_m), 1),
                  "entrance_extent": "파일럿 구역(양천·영등포) 경계 밖 약 1.1km 안(카카오 로컬 보조 자료)" if EXIT_COORDINATES_ENABLED else "사용하지 않음(공식 출입구 좌표 자료 없음)", "location_extent": "전국 도시철도 역사(공식 표준데이터)",
                  "location_regions": regions_loc, "usage_regions": sorted(usage_regions)},
        "usage_basis": {"year": meta.get("usage_year"), "text": f"역사별 {meta.get('usage_year')}년 하루 평균 승차·하차 인원, 연결된 노선만 더한 값",
                        "sources": sorted({SOURCE_LABEL.get(k, k) for k in srcs}), "periods": {SOURCE_LABEL.get(k, k): [v["versions"][0].get("period_first"), v["versions"][-1].get("period_last")] for k, v in srcs.items() if v.get("versions")}},
        "caveats": CAVEATS,
        "source": {"title": "국가철도공단 도시철도 역사정보(공식 좌표) · 서울·부산·인천 승하차" if not EXIT_COORDINATES_ENABLED else "국가철도공단 도시철도 역사정보(공식 좌표) · 카카오 로컬(출입구, 보조) · 서울·부산·인천 승하차",
                   "reference": f"역사 {om.get('file', '')} (행별 기준일 {bd.get('min')}~{bd.get('max')}) · 이용량 {meta.get('usage_year')}년"},
    }


def unavailable(message: str) -> dict:
    """자료가 아직 없을 때 — 0개가 아니라 '준비 중/확인 불가'로 보이게 한다."""
    return {"status": "unavailable", "message": message, "caveats": CAVEATS}


def metrics(store: dict, radius_m: int) -> dict:
    """매장 한 곳의 철도 접근성. 산출물이 없으면 오류 대신 unavailable 을 돌려줘 같은 응답의 다른 블록이 그대로 나가게 한다."""
    try:
        official = data_store.load_parquet("rail_official_stations.parquet")
        usage = data_store.load_parquet("rail_usage_complex_2025.parquet")
        links = entrance_links()
        meta = data_store.load_json("rail_national_meta.json")
    except data_store.DataNotReady:
        return unavailable("철도 역사 자료가 아직 준비되지 않았습니다(파이프라인 실행 필요). 0개가 아니라 확인 불가입니다.")
    try:
        buffer_m = float(data_store.load_json("rail_meta.json").get("buffer_m", DEFAULT_BUFFER_M))
    except data_store.DataNotReady:
        buffer_m = float(DEFAULT_BUFFER_M)
    lon, lat = float(store["lon"]), float(store["lat"])
    try:
        cx = build_complexes(official, usage, links)
        return compute(lon, lat, cx, links, meta, radius_m, bus_access.distance_to_pilot_m(lon, lat), buffer_m)
    except Exception:  # noqa: BLE001 — 새 블록의 오류가 같은 응답의 버스·앵커·경쟁 분석까지 막지 않게 격리한다(원인은 로그에 남긴다)
        log.exception("철도 접근성 계산 실패")
        return unavailable("철도 접근성을 계산하지 못했습니다(자료 형식 확인 필요). 0개가 아니라 확인 불가입니다.")
