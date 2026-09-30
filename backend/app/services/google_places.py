"""매장 ↔ Google 장소 연결 (Places API (New) Text Search, 서버 전용 키).

- 사용자가 'Google 고객평가'를 열 때 그 매장 1곳만 조회한다. 목록 단위 선조회 없음.
- 저장하는 것은 Place ID(캐싱 제한 예외)와 우리 쪽 연결 판정뿐이다. 이름·주소·좌표 등 Google 콘텐츠는
  판정에만 쓰고 저장·로그하지 않는다. 평점·리뷰는 서버가 받지 않는다(브라우저의 UI Kit 컴포넌트가 직접 렌더링).
- 상호만 같다고 연결하지 않는다: 상호(지점 포함) + 위치(반경) + 도로명주소를 함께 확인한다.
- 비용 보호(무료 한도 안에서만): 매장당 결과 캐시, 매장별 동시요청 합치기, 분당·일일·월간 호출 상한,
  오류 직후 짧은 재시도 금지. UI Kit 표시도 reserve_ui_kit_view() 로 서버가 일·월 상한 안에서만 허락한다.
"""
from __future__ import annotations

import json
import os
import threading
import time
from collections import deque
from datetime import date, datetime, timedelta, timezone

import httpx

from app.config import settings
from app.services import place_matching, store_profile

TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
# id 외 필드는 Text Search Pro SKU. 연결 판정에 이름·주소·좌표가 꼭 필요하다.
FIELD_MASK = "places.id,places.displayName,places.formattedAddress,places.location"
SEARCH_BIAS_RADIUS_M = 300.0
MATCH_RADIUS_M = 100.0
CLOSE_RADIUS_M = 30.0
NO_CANDIDATE_RECHECK_DAYS = 30
ERROR_COOLDOWN_SEC = 60

MESSAGES = {
    "not_configured": "연동 준비 중 — Google 연동 키가 설정되지 않았습니다",
    "matched": "Google 장소와 연결됨",
    "needs_confirmation": "매장 연결 확인 필요 — 이름이 비슷한 Google 장소가 있지만 주소·위치·지점이 확실히 일치하지 않습니다",
    "no_candidate": "매장 연결 확인 필요 — Google 에서 같은 상호·위치의 장소를 찾지 못했습니다",
    "rate_limited": "Google 무료 사용 한도에 도달해 조회를 멈췄습니다 — 한도가 초기화된 뒤 다시 이용할 수 있습니다",
    "api_error": "Google 조회 실패 — 잠시 후 다시 시도해 주세요",
}

_lock = threading.Lock()
_store_locks: dict[str, threading.Lock] = {}
_minute_calls: deque[float] = deque()
_recent_errors: dict[str, float] = {}


def _cache_path():
    return settings.cache_dir / "google_place_links.json"


def _load_cache() -> dict:
    p = _cache_path()
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {"links": {}, "usage": {}}


def _save_cache(cache: dict) -> None:
    p = _cache_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, p)


def _fresh(entry: dict) -> bool:
    if entry["status"] in ("matched", "needs_confirmation"):
        return True
    checked = datetime.fromisoformat(entry["checked_at"])
    return datetime.now(timezone.utc) - checked < timedelta(days=NO_CANDIDATE_RECHECK_DAYS)


def _usage_counts(cache: dict, kind: str) -> tuple[int, int]:
    """(오늘, 이번 달) 사용 건수."""
    usage = cache.setdefault("usage", {}).setdefault(kind, {})
    today = date.today().isoformat()
    return usage.get(today, 0), sum(v for d, v in usage.items() if d[:7] == today[:7])


def _record_usage(cache: dict, kind: str) -> None:
    usage = cache["usage"][kind]
    today = date.today().isoformat()
    usage[today] = usage.get(today, 0) + 1


def _consume_quota(cache: dict) -> bool:
    now = time.monotonic()
    while _minute_calls and now - _minute_calls[0] > 60:
        _minute_calls.popleft()
    day, month = _usage_counts(cache, "text_search")
    if (len(_minute_calls) >= settings.google_textsearch_per_minute or day >= settings.google_textsearch_daily_cap
            or month >= settings.google_textsearch_monthly_cap):
        return False
    _minute_calls.append(now)
    _record_usage(cache, "text_search")
    return True


def reserve_ui_kit_view(bizes_id: str) -> dict:
    """브라우저가 UI Kit 컴포넌트를 만들기 직전에 호출한다. 컴포넌트 1회 생성 = 과금 1건이므로 여기서 상한을 건다."""
    store_profile.get_store(bizes_id)
    with _lock:
        cache = _load_cache()
        entry = cache["links"].get(bizes_id)
        if not entry or entry["status"] != "matched":
            return {"allowed": False, "reason": "not_matched", "message": "Google 장소와 연결된 매장이 아닙니다"}
        day, month = _usage_counts(cache, "ui_kit")
        if day >= settings.google_ui_kit_daily_cap or month >= settings.google_ui_kit_monthly_cap:
            _save_cache(cache)
            return {"allowed": False, "reason": "quota", "message": MESSAGES["rate_limited"]}
        _record_usage(cache, "ui_kit")
        _save_cache(cache)
    return {"allowed": True, "place_id": entry["place_id"],
            "remaining_today": settings.google_ui_kit_daily_cap - day - 1,
            "remaining_month": settings.google_ui_kit_monthly_cap - month - 1}


def usage_summary() -> dict:
    with _lock:
        cache = _load_cache()
    out = {}
    for kind, (dcap, mcap) in {"text_search": (settings.google_textsearch_daily_cap, settings.google_textsearch_monthly_cap),
                               "ui_kit": (settings.google_ui_kit_daily_cap, settings.google_ui_kit_monthly_cap)}.items():
        day, month = _usage_counts(cache, kind)
        out[kind] = {"today": day, "daily_cap": dcap, "this_month": month, "monthly_cap": mcap}
    return out


def evaluate(store: dict, places: list[dict]) -> tuple[str, str | None, str]:
    """Text Search 후보를 매장과 대조해 (status, place_id, reason) 을 돌려준다. 순수 함수."""
    core = place_matching.norm_name(store["bizesNm"])
    full = core + place_matching.norm_name(store.get("brchNm"))
    s_road = place_matching.road_key(store.get("rdnmAdr"))
    confident, similar = [], []
    for p in places:
        pname = place_matching.norm_name((p.get("displayName") or {}).get("text"))
        rel = place_matching.name_relation(full, core, pname)
        if rel == "none" or place_matching.branch_conflict(store.get("brchNm"), pname, core):
            continue
        loc = p.get("location") or {}
        dist = (place_matching.haversine_m(store["lon"], store["lat"], loc["longitude"], loc["latitude"])
                if "latitude" in loc else None)
        addr = s_road is not None and s_road == place_matching.road_key(p.get("formattedAddress"))
        if dist is not None and dist <= MATCH_RADIUS_M and (addr or dist <= CLOSE_RADIUS_M):
            confident.append(p)
        else:
            similar.append(p)
    if len(confident) == 1:
        return "matched", confident[0]["id"], "상호·위치·주소 일치"
    if len(confident) > 1:
        return "needs_confirmation", None, f"조건을 만족하는 Google 장소가 {len(confident)}곳"
    if similar:
        return "needs_confirmation", None, "상호는 비슷하나 위치·주소·지점 불일치"
    return "no_candidate", None, "상호가 일치하는 후보 없음"


def _text_search(client: httpx.Client, store: dict) -> list[dict]:
    query = " ".join(x for x in (store["bizesNm"], store.get("brchNm")) if x)
    resp = client.post(
        TEXT_SEARCH_URL,
        headers={"X-Goog-Api-Key": settings.google_maps_server_key, "X-Goog-FieldMask": FIELD_MASK},
        json={"textQuery": query, "languageCode": "ko", "regionCode": "KR", "pageSize": 5,
              "locationBias": {"circle": {"center": {"latitude": store["lat"], "longitude": store["lon"]},
                                          "radius": SEARCH_BIAS_RADIUS_M}}},
        timeout=10.0,
    )
    resp.raise_for_status()
    return resp.json().get("places", [])


def _response(entry: dict, cached: bool) -> dict:
    return {"status": entry["status"], "place_id": entry.get("place_id") if entry["status"] == "matched" else None,
            "checked_at": entry.get("checked_at"), "reason": entry.get("reason"),
            "message": MESSAGES[entry["status"]], "cached": cached}


def link_store(bizes_id: str, client: httpx.Client | None = None) -> dict:
    store = store_profile.get_store(bizes_id)  # 없는 매장이면 StoreNotFound
    with _lock:
        entry = _load_cache()["links"].get(bizes_id)
    if entry and _fresh(entry):
        return _response(entry, cached=True)
    if not settings.google_maps_server_key:
        return {"status": "not_configured", "place_id": None, "message": MESSAGES["not_configured"], "cached": False}
    if time.monotonic() - _recent_errors.get(bizes_id, -1e9) < ERROR_COOLDOWN_SEC:
        return {"status": "api_error", "place_id": None, "message": MESSAGES["api_error"], "cached": False}

    with _lock:
        store_lock = _store_locks.setdefault(bizes_id, threading.Lock())
    with store_lock:  # 같은 매장 동시 요청은 한 번만 호출
        with _lock:
            cache = _load_cache()
            entry = cache["links"].get(bizes_id)
            if entry and _fresh(entry):
                return _response(entry, cached=True)
            allowed = _consume_quota(cache)
            _save_cache(cache)
        if not allowed:
            return {"status": "rate_limited", "place_id": None, "message": MESSAGES["rate_limited"], "cached": False}
        try:
            own = client is None
            client = client or httpx.Client()
            try:
                places = _text_search(client, store)
            finally:
                if own:
                    client.close()
        except httpx.HTTPStatusError as e:
            _recent_errors[bizes_id] = time.monotonic()
            return {"status": "api_error", "place_id": None, "http_status": e.response.status_code,
                    "message": MESSAGES["api_error"], "cached": False}
        except httpx.HTTPError:
            _recent_errors[bizes_id] = time.monotonic()
            return {"status": "api_error", "place_id": None, "message": MESSAGES["api_error"], "cached": False}

        status, place_id, reason = evaluate(store, places)
        entry = {"status": status, "place_id": place_id, "reason": reason,
                 "checked_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
        with _lock:
            cache = _load_cache()
            cache["links"][bizes_id] = entry
            _save_cache(cache)
        return _response(entry, cached=False)
