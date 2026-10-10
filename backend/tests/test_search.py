"""위치·매장 검색 — 역·상권·행정동·주소·매장이 각자 위치와 연결되는지."""
from __future__ import annotations

from app.services import data_store, search


def test_too_short_query_returns_nothing_instead_of_matching_everything(client):
    body = client.get("/api/search", params={"q": "역"}).json()
    assert body["too_short"] and body["results"] == []
    assert client.get("/api/search", params={"q": " "}).json()["too_short"]


def test_station_name_finds_the_station_and_its_nearby_trade_areas(client):
    body = client.get("/api/search", params={"q": "영등포역"}).json()
    kinds = [r["kind"] for r in body["results"]]
    assert kinds[0] == "station"                               # 역 이름 검색은 역이 가장 먼저
    st = body["results"][0]
    assert st["name"] == "영등포역" and 126.8 < st["lon"] < 127.1 and 37.4 < st["lat"] < 37.6
    assert "공식 역 좌표가 아닙니다" in body["note"]
    assert "trdar" in kinds                                    # 같은 이름의 상권도 함께 나온다


def test_trade_area_and_dong_results_carry_the_codes_the_map_needs(client):
    body = client.get("/api/search", params={"q": "여의도"}).json()
    trdar = next(r for r in body["results"] if r["kind"] == "trdar")
    assert trdar["level"] == "trdar" and trdar["code"].isdigit() and trdar["lon"] and trdar["lat"]
    dong = next(r for r in client.get("/api/search", params={"q": "신정"}).json()["results"] if r["kind"] == "dong")
    assert dong["level"] == "dong" and dong["code"].startswith("114")


def test_address_search_ignores_spaces_and_finds_the_registered_location(client):
    stores = data_store.load_parquet("stores.parquet")
    r = stores.loc[(stores["indsLclsCd"] == "I2") & stores["rdnmAdr"].str.contains("국회대로")].sort_values("bizesId").iloc[0]
    for q in (r["rdnmAdr"], r["rdnmAdr"].replace(" ", ""), "국회대로 " + r["rdnmAdr"].split("국회대로")[1].strip()):
        res = client.get("/api/search", params={"q": q, "limit": 50}).json()["results"]
        hit = [x for x in res if x["kind"] == "address" and x["name"] == r["rdnmAdr"]]
        assert hit and abs(hit[0]["lon"] - r["lon"]) < 1e-5, q


def test_store_name_search_returns_the_store_id_for_the_detail_panel(client):
    stores = data_store.load_parquet("stores.parquet")
    name = stores.loc[stores["indsLclsCd"] == "I2", "bizesNm"].value_counts().index[-1]  # 흔하지 않은 상호
    res = client.get("/api/search", params={"q": name, "limit": 50}).json()["results"]
    hit = [x for x in res if x["kind"] == "store" and x["store_id"]]
    assert hit and all(name.replace(" ", "") in x["name"].replace(" ", "") for x in hit)
    assert client.get(f"/api/stores/{hit[0]['store_id']}").status_code == 200


def test_prefix_matches_come_before_substring_matches():
    ix = search._index()["trdar"]
    ranks = search._rank(ix["key"], search.normalize("영등포"))
    ordered = search._pick(ix, ranks, ["name"])["_rank"].tolist()
    assert ordered == sorted(ordered)


def test_search_never_matches_non_food_stores():
    stores = search._index()["stores"]
    assert (stores["indsLclsCd"] == "I2").all()
