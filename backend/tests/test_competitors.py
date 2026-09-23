"""competitors 라우터 테스트."""
from __future__ import annotations

# 여의도역 부근 — 파일럿 데이터에 매장이 확실히 존재하는 좌표
YEOUIDO = {"lon": 126.92453, "lat": 37.521473}


def test_competitors_returns_nearby_stores(client):
    res = client.get("/api/competitors", params={**YEOUIDO, "radius_m": 500, "limit": 5})
    assert res.status_code == 200
    body = res.json()
    assert body["total_in_radius"] > 0
    assert len(body["records"]) == 5
    # 거리순 정렬이고 반경을 벗어나지 않는다
    distances = [r["distance_m"] for r in body["records"]]
    assert distances == sorted(distances)
    assert all(d <= 500 for d in distances)


def test_competitors_category_filter_and_dedup(client):
    res = client.get(
        "/api/competitors",
        params={**YEOUIDO, "radius_m": 500, "category_code": "I20101", "limit": 10},
    )
    body = res.json()
    assert body["total_matched"] <= body["total_in_radius"]
    assert all(r["category"] == "백반/한정식" for r in body["records"])
    # 같은 상호+주소가 중복으로 나오지 않아야 한다
    keys = [(r["name"], r["address"]) for r in body["records"]]
    assert len(keys) == len(set(keys))


def test_competitors_rejects_bad_category_level(client):
    res = client.get("/api/competitors", params={**YEOUIDO, "category_level": "없는단계"})
    assert res.status_code == 400
