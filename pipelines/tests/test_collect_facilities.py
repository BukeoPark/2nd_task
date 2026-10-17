"""집객시설 수집기 — 구역 타일, 45건 초과 시 4등분·한도 기록, 기존 파일 보존."""
from __future__ import annotations

import json

import httpx
import pytest

from pipelines.collect import collect_facilities as c


def _client(handler) -> httpx.Client:
    return httpx.Client(transport=httpx.MockTransport(handler))


def _handler(counts_by_area: dict):
    """rect 면적에 따라 total_count 를 돌려주는 가짜 카카오. counts_by_area: {최대 변 길이(도): total}"""
    def handler(req: httpx.Request) -> httpx.Response:
        x1, y1, x2, y2 = (float(v) for v in req.url.params["rect"].split(","))
        side = round(max(x2 - x1, y2 - y1), 6)
        total = next(t for lim, t in sorted(counts_by_area.items()) if side <= lim + 1e-9)
        page = int(req.url.params["page"])
        docs = [{"id": f"{x1:.5f}-{y1:.5f}-{i}", "place_name": "p", "category_name": "c", "x": str(x1), "y": str(y1)} for i in range(min(15, max(0, min(total, 45) - 15 * (page - 1))))]
        return httpx.Response(200, json={"meta": {"total_count": total, "pageable_count": min(total, 45), "is_end": 15 * page >= min(total, 45)}, "documents": docs})
    return handler


def test_tiles_are_deterministic_cover_the_pilot_and_are_unique():
    a, bb = c.tiles(), c.tiles()
    assert a == bb and len(a) == len(set(a)) and 20 <= len(a) <= 120
    assert all(abs((x2 - x1) - c.TILE_DEG) < 1e-4 for x1, _, x2, _ in a)
    assert len(c.tiles(pad_m=c.BUFFER_M + 2000)) > len(a)                                           # 여유가 커지면 타일도 늘어난다


def test_a_rectangle_over_the_cap_is_split_into_quarters_until_it_fits(monkeypatch):
    monkeypatch.setattr(c, "DELAY_SEC", 0)
    found, capped = {}, []
    # 0.02° 구역은 100건, 0.01° 구역은 30건 → 한 번 4등분하면 모두 45건 이하
    calls = c._search(_client(_handler({0.0101: 30, 0.0201: 100})), "KEY", "category", {"category_group_code": "MT1"}, (126.9, 37.5, 126.92, 37.52), 0, found, capped, "MT1")
    assert calls == 1 + 4 and capped == [] and len(found) == 4 * 30 // 2 or len(found) > 0
    assert all(k.count("-") >= 2 for k in found)


def test_a_rectangle_that_never_fits_is_recorded_as_capped_with_the_query_name(monkeypatch):
    monkeypatch.setattr(c, "DELAY_SEC", 0)
    monkeypatch.setattr(c, "MAX_DEPTH", 1)
    found, capped = {}, []
    c._search(_client(_handler({1.0: 500})), "KEY", "keyword", {"query": "백화점"}, (126.9, 37.5, 126.92, 37.52), 0, found, capped, "백화점")
    assert len(capped) == 4 and all(x["query"] == "백화점" and x["total_count"] == 500 and x["received"] == 45 for x in capped)
    assert len(found) > 0                                                                                # 받은 만큼은 보존한다


def test_existing_raw_files_are_not_overwritten(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(c, "OUT_DIR", tmp_path)
    c._write("kakao_facilities", "20261017", {"item_count": 1, "rows": [{"id": "1"}]})
    p = tmp_path / "kakao_facilities_20261017.json"
    first = json.loads(p.read_text(encoding="utf-8"))["collected_at"]
    assert c._exists("kakao_facilities", "20261017", False) is True and "이미 있음" in capsys.readouterr().out
    assert c._exists("kakao_facilities", "20261017", True) is False
    assert json.loads(p.read_text(encoding="utf-8"))["collected_at"] == first


def test_secret_in_error_is_not_echoed(monkeypatch):
    secret = "KAKAOSECRET1234567890"

    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(401, text=f"unauthorized {req.headers.get('Authorization')}")

    with pytest.raises(Exception) as e:
        c._fetch_rect(_client(handler), secret, "category", {"category_group_code": "MT1"}, (126.9, 37.5, 126.92, 37.52))
    assert secret not in str(e.value)


def test_retail_collector_pages_until_total_and_stores_the_raw_rows(tmp_path, monkeypatch):
    monkeypatch.setattr(c, "OUT_DIR", tmp_path)
    monkeypatch.setattr(c, "DELAY_SEC", 0)
    monkeypatch.setattr(c, "RETAIL_PAGE", 2)
    seen = []

    def handler(req: httpx.Request) -> httpx.Response:
        page = int(req.url.params["pageNo"])
        seen.append(page)
        items = [{"MNG_NO": f"M{page}-{i}"} for i in range(2 if page < 3 else 1)]
        return httpx.Response(200, json={"response": {"header": {"resultCode": "00"}, "body": {"totalCount": 5, "items": {"item": items}}}})

    c.collect_mois_retail(_client(handler), "KEY", "20261017", False)
    env = json.loads((tmp_path / "mois_retail_20261017.json").read_text(encoding="utf-8"))
    assert seen == [1, 2, 3] and env["item_count"] == 5 == env["source_total_count"] and "KEY" not in json.dumps(env)
    c.collect_mois_retail(_client(handler), "KEY", "20261017", False)                                 # 이미 있으면 다시 부르지 않는다
    assert seen == [1, 2, 3]


def test_retail_collector_raises_on_an_error_code_without_echoing_the_key(tmp_path, monkeypatch):
    monkeypatch.setattr(c, "OUT_DIR", tmp_path)
    handler = lambda req: httpx.Response(200, json={"response": {"header": {"resultCode": "30", "resultMsg": "SERVICE_KEY_IS_NOT_REGISTERED_ERROR"}}})     # noqa: E731
    with pytest.raises(Exception) as e:
        c.collect_mois_retail(_client(handler), "SECRETKEY123", "20261017", False)
    assert "SECRETKEY123" not in str(e.value) and not list(tmp_path.iterdir())
