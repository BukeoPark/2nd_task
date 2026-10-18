"""권한 미확인(카카오 로컬·네이버 로컬) 저장 좌표가 공개 API 응답·지도용 응답·서버 계산에 남아 있지 않다.

금지 좌표 집합 = 카카오 로컬로 받은 철도 출입구·시설 좌표 + 네이버 지역 검색으로 받은 앵커 좌표(원본 파일 기준).
공개 응답(매장 반경 분석·앵커 지도·상권 유형 등) 어디에도 같은 좌표(소수 6자리, 약 0.1m)가 없어야 한다. 자료가 없는 환경이면 건너뛴다.
공식 자료가 우연히 같은 점을 가리키는 경우(공식 시설·역·앵커의 좌표와 소수 6자리까지 같음)는 출처가 다른 독립 좌표라 금지 집합에서 뺀다.
"""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
import pytest

from app.services import data_store, rail_access

ROOT = Path(__file__).resolve().parents[2]
PROCESSED, RAW = ROOT / "data" / "processed", ROOT / "data" / "raw"


def _r(v) -> tuple[float, float]:
    return round(float(v[0]), 6), round(float(v[1]), 6)


def _forbidden() -> dict[str, set]:
    out: dict[str, set] = {}
    p = PROCESSED / "rail_entrance_links.parquet"
    if p.exists():
        d = pd.read_parquet(p)
        out["kakao_rail_exit"] = {_r(x) for x in zip(d["lon"], d["lat"])}
    p = PROCESSED / "facility_source_rows.parquet"
    if p.exists():
        d = pd.read_parquet(p)
        d = d[(d["source"] == "kakao") & d["lon"].notna()]
        out["kakao_facility"] = {_r(x) for x in zip(d["lon"], d["lat"])}
    nav = set()
    for f in (RAW / "naver_local").glob("*.json"):
        for q in json.loads(f.read_text(encoding="utf-8")).get("queries", []):
            for it in q.get("items", []):
                try:
                    nav.add(_r((float(it["mapx"]) / 1e7, float(it["mapy"]) / 1e7)))
                except (KeyError, ValueError):
                    continue
    if nav:
        out["naver_local_anchor"] = nav
    reb = set()
    for f in (RAW / "kakao").glob("reb_zone_geocode_*.json"):
        for q in json.loads(f.read_text(encoding="utf-8")).get("queries", []):
            for d in q.get("documents", []):
                try:
                    reb.add(_r((float(d["x"]), float(d["y"]))))
                except (KeyError, ValueError):
                    continue
    if reb:
        out["kakao_reb_zone_geocode"] = reb
    official = _official_points()
    return {k: v - official for k, v in out.items() if v - official}


def _official_points() -> set:
    """공식 출처의 좌표 — 공식 역 중심점, 카카오가 아닌 시설 행, 상가정보·인허가 앵커."""
    pts: set = set()
    p = PROCESSED / "rail_official_stations.parquet"
    if p.exists():
        d = pd.read_parquet(p)
        pts |= {_r(x) for x in zip(d["lon"], d["lat"]) if pd.notna(x[0])}
    p = PROCESSED / "facility_source_rows.parquet"
    if p.exists():
        d = pd.read_parquet(p)
        d = d[(d["source"] != "kakao") & d["lon"].notna()]
        pts |= {_r(x) for x in zip(d["lon"], d["lat"])}
    p = PROCESSED / "anchor_stores.parquet"
    if p.exists():
        d = pd.read_parquet(p)
        pts |= {_r(x) for x in zip(d["lon"], d["lat"])}
    return pts


def _pairs(obj, acc: set | None = None) -> set:
    """응답 JSON 안의 (lon, lat) 쌍 — lon/lat 키가 있는 객체와 [경도, 위도] 배열."""
    acc = set() if acc is None else acc
    if isinstance(obj, dict):
        if isinstance(obj.get("lon"), (int, float)) and isinstance(obj.get("lat"), (int, float)):
            acc.add(_r((obj["lon"], obj["lat"])))
        for v in obj.values():
            _pairs(v, acc)
    elif isinstance(obj, list):
        if len(obj) == 2 and all(isinstance(x, (int, float)) for x in obj) and 124 < obj[0] < 132 and 33 < obj[1] < 39:
            acc.add(_r(obj))
        for v in obj:
            _pairs(v, acc)
    return acc


@pytest.fixture(scope="module")
def forbidden():
    f = _forbidden()
    if not f:
        pytest.skip("대조할 금지 좌표 원본이 없음")
    return f


def _stores_near_forbidden(n_each: int = 4) -> list[str]:
    st = data_store.load_parquet("stores.parquet")
    ids = []
    for name, pts in _forbidden().items():
        pts_sorted = sorted(pts)
        for lon, lat in pts_sorted[:: max(1, len(pts_sorted) // n_each)][:n_each]:            # 좌표 전체에 고르게 퍼뜨려 고른다
            d = (st["lon"] - lon).abs() + (st["lat"] - lat).abs()
            ids.append(st.loc[d.idxmin(), "bizesId"])
    return list(dict.fromkeys(ids))


def _assert_clean(body, forbidden, where: str):
    found = _pairs(body)
    for name, pts in forbidden.items():
        hit = found & pts
        assert not hit, f"{where}: {name} 좌표가 응답에 남아 있음 {sorted(hit)[:3]}"


def test_location_influence_responses_contain_none_of_the_unconfirmed_coordinates(client, forbidden):
    for sid in _stores_near_forbidden():
        for radius in (250, 500, 1000):
            r = client.get(f"/api/stores/{sid}/location-influence", params={"radius_m": radius})
            assert r.status_code == 200
            body = r.json()
            _assert_clean(body, forbidden, f"location-influence {sid} {radius}m")
            rail = body["radius_metrics"]["rail"]
            if rail["status"] == "ok":
                assert rail["entrance_data"]["enabled"] is False and rail["nearest_entrance"] is None and rail["selected"]["entrances"] == 0
                assert all(s["entrances"] == [] and s["basis"] == "center" for s in rail["stations"])


def test_anchor_map_and_store_anchor_responses_contain_none_of_the_unconfirmed_coordinates(client, forbidden):
    body = client.get("/api/food/anchors").json()
    _assert_clean(body, forbidden, "food/anchors")
    assert len(body["stores"]) >= 10
    for sid in _stores_near_forbidden(2):
        r = client.get(f"/api/stores/{sid}/anchors")
        if r.status_code == 200:
            _assert_clean(r.json(), forbidden, f"stores/{sid}/anchors")


def test_unit_character_responses_contain_none_of_the_unconfirmed_coordinates(client, forbidden):
    st = data_store.load_parquet("stores.parquet")
    for code in sorted(st["adongCd"].dropna().astype(str).unique())[:6]:
        r = client.get(f"/api/food/units/dong/{code}/character")
        if r.status_code == 200:
            _assert_clean(r.json(), forbidden, f"character dong {code}")


def test_server_side_rail_and_anchor_calculation_inputs_exclude_the_unconfirmed_sources(forbidden):
    assert rail_access.EXIT_COORDINATES_ENABLED is False and rail_access.entrance_links().empty         # 출입구 좌표 표를 읽지 않는다
    anchors = data_store.load_parquet("anchor_stores.parquet")
    assert "naver_local" not in set(anchors["source"])
    pts = {_r(x) for x in zip(anchors["lon"], anchors["lat"])}
    assert not (pts & forbidden.get("naver_local_anchor", set()))                                       # 네이버 좌표가 앵커 계산 입력에 없다(공식 좌표와 같은 점은 금지 집합에서 이미 뺐다)
    store_anchor = data_store.load_parquet("store_anchor.parquet")
    assert len(store_anchor) == len(data_store.load_parquet("stores.parquet"))


def test_facility_responses_never_carry_kakao_coordinates(client, forbidden):
    kakao = {k: v for k, v in forbidden.items() if k == "kakao_facility"}
    if not kakao:
        pytest.skip("카카오 시설 좌표 없음")
    for sid in _stores_near_forbidden(6):
        body = client.get(f"/api/stores/{sid}/location-influence", params={"radius_m": 1000}).json()
        fb = body["radius_metrics"]["facilities"]
        if fb["status"] == "ok":
            assert all(f["coordinate_source"] != "kakao" for f in fb["facilities"])
            _assert_clean(fb, kakao, f"facilities {sid}")


def test_reb_zone_marker_coordinates_come_from_official_stations_not_kakao_geocoding(client, forbidden):
    body = client.get("/api/reb-zones").json()
    assert body["count"] >= 3
    _assert_clean(body, forbidden, "reb-zones")
    assert all(r["coordinate_source"] == "rail_official_stations" for r in body["records"])
