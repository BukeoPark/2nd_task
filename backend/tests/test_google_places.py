"""매장 ↔ Google 장소 연결: 판정 규칙(동명·지점·위치)과 비용 보호(캐시·상한·오류 처리).

실제 Google 호출은 하지 않는다(키 없음). httpx.MockTransport 로 응답을 흉내낸다.
"""
from __future__ import annotations

import httpx
import pytest

from app.config import settings
from app.services import google_places

STORE = {"bizesId": "T1", "bizesNm": "행복분식", "brchNm": "당산점", "rdnmAdr": "서울특별시 영등포구 당산로 123",
         "lon": 126.9000, "lat": 37.5300}


def _place(pid: str, name: str, addr: str, dlat: float = 0.0) -> dict:
    return {"id": pid, "displayName": {"text": name}, "formattedAddress": addr,
            "location": {"latitude": STORE["lat"] + dlat, "longitude": STORE["lon"]}}


def test_exact_branch_and_address_match():
    status, pid, _ = google_places.evaluate(STORE, [_place("P1", "행복분식 당산점", "대한민국 서울특별시 영등포구 당산로 123")])
    assert (status, pid) == ("matched", "P1")


def test_same_name_other_branch_is_not_linked():
    # 이름이 같다는 이유만으로 다른 지점의 평가를 붙이지 않는다
    status, pid, _ = google_places.evaluate(STORE, [_place("P2", "행복분식 영등포점", "대한민국 서울특별시 영등포구 당산로 123")])
    assert status == "no_candidate" and pid is None


def test_same_name_far_away_needs_confirmation():
    status, pid, _ = google_places.evaluate(STORE, [_place("P3", "행복분식 당산점", "대한민국 서울특별시 영등포구 양평로 9", dlat=0.01)])
    assert status == "needs_confirmation" and pid is None


def test_two_confident_candidates_need_confirmation():
    addr = "대한민국 서울특별시 영등포구 당산로 123"
    status, _, reason = google_places.evaluate(STORE, [_place("A", "행복분식", addr), _place("B", "행복분식 당산점", addr)])
    assert status == "needs_confirmation" and "2곳" in reason


def test_close_location_without_address_still_requires_name():
    status, _, _ = google_places.evaluate(STORE, [_place("P4", "다른가게", "대한민국 서울특별시 영등포구 당산로 123")])
    assert status == "no_candidate"


@pytest.fixture
def google_env(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "cache_dir", tmp_path)
    monkeypatch.setattr(settings, "google_maps_server_key", "test-key")
    monkeypatch.setattr(settings, "google_textsearch_per_minute", 20)
    monkeypatch.setattr(settings, "google_textsearch_daily_cap", 150)
    monkeypatch.setattr(google_places.store_profile, "get_store", lambda bid: {**STORE, "bizesId": bid})
    google_places._minute_calls.clear()
    google_places._recent_errors.clear()
    return tmp_path


def _client(handler) -> tuple[httpx.Client, list]:
    calls = []

    def wrapped(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return handler(request)

    return httpx.Client(transport=httpx.MockTransport(wrapped)), calls


def test_not_configured_without_key(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "cache_dir", tmp_path)
    monkeypatch.setattr(settings, "google_maps_server_key", "")
    monkeypatch.setattr(google_places.store_profile, "get_store", lambda bid: STORE)
    assert google_places.link_store("T1")["status"] == "not_configured"


def test_match_is_cached_and_only_place_id_is_stored(google_env):
    body = {"places": [_place("P1", "행복분식 당산점", "대한민국 서울특별시 영등포구 당산로 123")]}
    client, calls = _client(lambda r: httpx.Response(200, json=body))
    first = google_places.link_store("S1", client=client)
    second = google_places.link_store("S1", client=client)
    assert first["status"] == "matched" and first["place_id"] == "P1" and not first["cached"]
    assert second["cached"] and len(calls) == 1  # 중복 호출 없음
    assert calls[0].headers["X-Goog-FieldMask"] == google_places.FIELD_MASK
    saved = (google_env / "google_place_links.json").read_text(encoding="utf-8")
    assert "P1" in saved and "행복분식" not in saved and "당산로" not in saved  # Google 콘텐츠 비저장


def test_api_error_is_distinct_and_not_cached(google_env):
    client, calls = _client(lambda r: httpx.Response(500, json={"error": "x"}))
    r = google_places.link_store("S2", client=client)
    assert r["status"] == "api_error" and r["http_status"] == 500
    again = google_places.link_store("S2", client=client)
    assert again["status"] == "api_error" and len(calls) == 1  # 오류 직후 재시도 억제
    assert "S2" not in (google_env / "google_place_links.json").read_text(encoding="utf-8")


def test_no_candidates_is_not_an_error(google_env):
    client, _ = _client(lambda r: httpx.Response(200, json={}))
    r = google_places.link_store("S3", client=client)
    assert r["status"] == "no_candidate" and "매장 연결 확인 필요" in r["message"]


def test_rate_limit(google_env, monkeypatch):
    monkeypatch.setattr(settings, "google_textsearch_per_minute", 1)
    client, calls = _client(lambda r: httpx.Response(200, json={}))
    assert google_places.link_store("S4", client=client)["status"] == "rate_limited"
    assert google_places.link_store("S5", client=client)["status"] == "rate_limited"
    assert len(calls) == 1


def _matched(google_env, bid: str) -> None:
    body = {"places": [_place("P1", "행복분식 당산점", "대한민국 서울특별시 영등포구 당산로 123")]}
    client, _ = _client(lambda r: httpx.Response(200, json=body))
    assert google_places.link_store(bid, client=client)["status"] == "matched"


def test_ui_kit_view_only_for_matched_store(google_env):
    assert google_places.reserve_ui_kit_view("S6")["allowed"] is False
    _matched(google_env, "S6")
    r = google_places.reserve_ui_kit_view("S6")
    assert r["allowed"] and r["place_id"] == "P1"


def test_ui_kit_daily_and_monthly_free_caps(google_env, monkeypatch):
    _matched(google_env, "S7")
    monkeypatch.setattr(settings, "google_ui_kit_daily_cap", 2)
    assert google_places.reserve_ui_kit_view("S7")["allowed"]
    assert google_places.reserve_ui_kit_view("S7")["allowed"]
    blocked = google_places.reserve_ui_kit_view("S7")
    assert blocked["allowed"] is False and blocked["reason"] == "quota" and "무료" in blocked["message"]
    monkeypatch.setattr(settings, "google_ui_kit_daily_cap", 100)
    monkeypatch.setattr(settings, "google_ui_kit_monthly_cap", 2)
    assert google_places.reserve_ui_kit_view("S7")["allowed"] is False  # 이번 달 누적 2건으로 월 상한
    usage = google_places.usage_summary()
    assert usage["ui_kit"]["this_month"] == 2 and usage["text_search"]["this_month"] == 1


def test_text_search_monthly_free_cap(google_env, monkeypatch):
    monkeypatch.setattr(settings, "google_textsearch_monthly_cap", 1)
    client, calls = _client(lambda r: httpx.Response(200, json={}))
    assert google_places.link_store("S8", client=client)["status"] == "rate_limited"
    assert google_places.link_store("S9", client=client)["status"] == "rate_limited"
    assert len(calls) == 1


def test_view_endpoint(client):
    assert client.post("/api/stores/NOPE0000/google-place/view").status_code == 404
    assert set(client.get("/api/google-usage").json()) == {"text_search", "ui_kit"}


def test_short_name_variant_requires_matching_road_address():
    store = {**STORE, "bizesNm": "본죽", "brchNm": ""}
    addr = STORE["rdnmAdr"]
    assert google_places.evaluate(store, [_place("P1", "본죽&비빔밥 당산점", addr)])[0] == "matched"
    # 좌표만 가깝거나 상호 중간에 두 글자가 있는 다른 가게는 자동 연결하지 않는다.
    assert google_places.evaluate(store, [_place("P2", "본죽 당산점", "서울특별시 영등포구 양평로 9")])[0] == "needs_confirmation"
    assert google_places.evaluate(store, [_place("P3", "일본죽집", addr)])[0] == "no_candidate"
    assert google_places.evaluate(store, [_place("P4", "본죽 당산점", addr, dlat=0.01)])[0] != "matched"


def test_short_name_other_branch_is_not_linked():
    store = {**STORE, "bizesNm": "본죽"}
    assert google_places.evaluate(store, [_place("P1", "본죽 영등포점", STORE["rdnmAdr"])])[0] == "no_candidate"


def test_address_query_then_one_budgeted_fallback(google_env):
    import json
    def response(request):
        body = json.loads(request.content)
        if STORE["rdnmAdr"] in body["textQuery"]:
            return httpx.Response(200, json={})
        return httpx.Response(200, json={"places": [_place("P1", "행복분식 당산점", STORE["rdnmAdr"])]})
    client, calls = _client(response)
    assert google_places.link_store("F1", client=client)["status"] == "matched"
    assert len(calls) == 2
    assert STORE["rdnmAdr"] in json.loads(calls[0].content)["textQuery"]
    assert google_places.usage_summary()["text_search"]["today"] == 2


def test_old_failed_cache_is_rechecked_without_deleting_other_links(google_env):
    from datetime import datetime, timezone
    google_places._save_cache({"links": {
        "OLD": {"status": "no_candidate", "place_id": None, "checked_at": datetime.now(timezone.utc).isoformat()},
        "KEEP": {"status": "matched", "place_id": "existing"},
    }, "usage": {}})
    client, calls = _client(lambda r: httpx.Response(200, json={"places": [_place("P1", "행복분식 당산점", STORE["rdnmAdr"])]}))
    assert google_places.link_store("OLD", client=client)["status"] == "matched"
    assert len(calls) == 1
    assert google_places._load_cache()["links"]["KEEP"]["place_id"] == "existing"


def test_manual_negative_recheck_has_cooldown_and_uses_quota(google_env):
    from datetime import datetime, timedelta, timezone
    entry = {"status": "no_candidate", "place_id": None, "reason": "후보 없음",
             "matcher_version": google_places.MATCHER_VERSION,
             "checked_at": datetime.now(timezone.utc).isoformat()}
    google_places._save_cache({"links": {"RETRY": entry}, "usage": {}})
    client, calls = _client(lambda r: httpx.Response(200, json={"places": [_place("P1", "행복분식 당산점", STORE["rdnmAdr"])]}))
    assert google_places.link_store("RETRY", client=client, refresh=True)["cached"]
    assert len(calls) == 0
    entry["checked_at"] = (datetime.now(timezone.utc) - timedelta(minutes=2)).isoformat()
    google_places._save_cache({"links": {"RETRY": entry}, "usage": {}})
    assert google_places.link_store("RETRY", client=client, refresh=True)["status"] == "matched"
    assert len(calls) == 1


def test_no_candidate_is_cached_for_one_day(google_env):
    client, calls = _client(lambda r: httpx.Response(200, json={}))
    assert google_places.link_store("EMPTY", client=client)["status"] == "no_candidate"
    assert google_places.link_store("EMPTY", client=client)["cached"]
    assert len(calls) == 2


def test_fallback_api_error_is_not_saved_as_no_candidate(google_env):
    client, calls = _client(lambda r: httpx.Response(200, json={}) if not len(calls) > 1 else httpx.Response(503))
    assert google_places.link_store("ERROR", client=client)["status"] == "api_error"
    assert "ERROR" not in google_places._load_cache()["links"]


def test_nearby_uncertain_result_can_be_resolved_by_fallback(google_env):
    client, calls = _client(lambda r: httpx.Response(200, json={"places": [
        _place("FAR", "행복분식 당산점", "서울특별시 영등포구 양평로 9", dlat=0.01)
    ]}) if len(calls) == 1 else httpx.Response(200, json={"places": [
        _place("RIGHT", "행복분식 당산점", STORE["rdnmAdr"])
    ]}))
    result = google_places.link_store("FALLBACK", client=client)
    assert result["status"] == "matched" and result["place_id"] == "RIGHT"
    assert len(calls) == 2


def test_refresh_query_is_forwarded_by_endpoint(client, monkeypatch):
    received = []
    def fake(bid, *, refresh=False):
        received.append((bid, refresh))
        return {"status": "no_candidate", "place_id": None, "message": "연결 안 됨", "cached": False}
    monkeypatch.setattr(google_places, "link_store", fake)
    assert client.get("/api/stores/RETRY/google-place?refresh=true").status_code == 200
    assert received == [("RETRY", True)]
