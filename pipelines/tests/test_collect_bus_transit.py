"""버스 교통 수집기 — 키가 코드·원본·오류에 남지 않는지, 페이지·버전·빈 응답 처리가 맞는지 모의 서버로 확인한다(실제 호출 없음)."""
from __future__ import annotations

import json
import os

import httpx
import pytest
from tenacity import stop_after_attempt, wait_none

from pipelines.collect import collect_bus_transit as c
from pipelines.common import config
from pipelines.common.env import redact

KEY = "TESTKEY/abc+123=="  # 인코딩이 필요한 문자를 일부러 넣는다


def _client(handler) -> httpx.Client:
    return httpx.Client(transport=httpx.MockTransport(handler))


def test_redact_removes_the_key_in_every_encoding():
    text = f"https://x/api?serviceKey={KEY}&b=1 and %s and %s" % (KEY.replace("/", "%2F").replace("+", "%2B").replace("=", "%3D"), KEY)
    assert KEY not in redact(text, KEY) and "%2F" not in redact(text, KEY) and "***" in redact(text, KEY)
    assert redact("그대로", "") == "그대로"


def test_http_errors_never_echo_the_key():
    get = c._get.retry_with(wait=wait_none(), stop=stop_after_attempt(1))
    client = _client(lambda req: httpx.Response(403, text=f"invalid serviceKey={KEY}"))
    with pytest.raises(c.ApiError) as e:
        get(client, "https://api.odcloud.kr/api/x", {"page": 1}, KEY)
    assert KEY not in str(e.value) and "403" in str(e.value)


def test_transport_errors_never_echo_the_key():
    def boom(req):
        raise httpx.ConnectError(f"cannot reach {req.url}")   # 요청 URL(serviceKey 쿼리 포함)이 메시지에 섞이는 경우
    get = c._get.retry_with(wait=wait_none(), stop=stop_after_attempt(1))
    with pytest.raises(httpx.TransportError) as e:
        get(_client(boom), "https://api.odcloud.kr/api/x", {}, KEY)
    assert KEY not in str(e.value) and "serviceKey=***" in str(e.value)       # 키 값만 지워지고 오류 내용은 남는다


def test_server_errors_are_retried_then_succeed():
    calls = []

    def handler(req):
        calls.append(1)
        return httpx.Response(503) if len(calls) < 3 else httpx.Response(200, json={"ok": True})
    get = c._get.retry_with(wait=wait_none(), stop=stop_after_attempt(4))
    assert get(_client(handler), "https://x", {}, KEY) == {"ok": True} and len(calls) == 3


def test_tago_empty_result_error_header_and_single_item():
    def serve(body):
        return _client(lambda req: httpx.Response(200, json={"response": body}))
    assert c._tago_page(serve({"header": {"resultCode": "00"}, "body": {"items": "", "totalCount": 0}}), KEY, 37.5, 126.9, 1) == ([], 0)
    assert c._tago_page(serve({"header": {"resultCode": "00"}, "body": ""}), KEY, 37.5, 126.9, 1) == ([], 0)            # 본문이 문자열로 오는 경우
    one = {"header": {"resultCode": "00"}, "body": {"items": {"item": {"nodeid": "A"}}, "totalCount": 1}}
    assert c._tago_page(serve(one), KEY, 37.5, 126.9, 1) == ([{"nodeid": "A"}], 1)                                   # 한 건이면 dict
    with pytest.raises(c.ApiError):
        c._tago_page(serve({"header": {"resultCode": "30", "resultMsg": "SERVICE KEY IS NOT REGISTERED"}, "body": {}}), KEY, 37.5, 126.9, 1)


def test_versions_are_discovered_from_the_public_swagger_and_the_latest_is_used(tmp_path, monkeypatch):
    spec = {"paths": {"/ns/v1/uddi:old": {"get": {"summary": "위치정보_20231016"}}, "/ns/v1/uddi:new": {"get": {"summary": "위치정보_20251031"}},
                      "/ns/v1/uddi:mid": {"get": {"summary": "위치정보_20241028"}}}}
    pages = {1: [{"정류장번호": f"S{i}"} for i in range(3)], 2: [{"정류장번호": f"S{i}"} for i in range(3, 5)]}
    seen = []

    def handler(req):
        if req.url.host == "infuser.odcloud.kr":
            return httpx.Response(200, json=spec)
        seen.append((req.url.path, dict(req.url.params)))
        page = int(req.url.params["page"])
        return httpx.Response(200, json={"page": page, "perPage": 3, "totalCount": 99, "currentCount": len(pages[page]), "matchCount": 5, "data": pages[page]})

    monkeypatch.setattr(c, "OUT_DIR", tmp_path)
    monkeypatch.setattr(c, "PAGE_SIZE", 3)
    monkeypatch.setattr(c, "DELAY_SEC", 0)
    with _client(handler) as client:
        v = c.discover_versions(client, "ns/v1")
        assert [x["date"] for x in v] == ["20231016", "20241028", "20251031"]
        c.collect_odcloud(client, KEY, "loc", "ns/v1", [("서울", {"cond[도시명::EQ]": "서울특별시"})], None, "20260101", False)
    saved = json.loads((tmp_path / "loc_20260101.json").read_text(encoding="utf-8"))
    assert saved["version"] == "20251031" and saved["item_count"] == 5 and [r["정류장번호"] for r in saved["rows"]] == [f"S{i}" for i in range(5)]
    assert saved["filters"][0]["match_count"] == 5 and all(p.endswith("uddi:new") for p, _ in seen)    # 가장 최근 버전만, 두 페이지
    assert KEY not in (tmp_path / "loc_20260101.json").read_text(encoding="utf-8")                      # 원본에 키가 없다
    assert "serviceKey" not in json.dumps(saved["filters"]) and "serviceKey" not in saved["endpoint"]


def test_unknown_version_and_existing_file_are_handled(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(c, "OUT_DIR", tmp_path)
    spec = {"paths": {"/ns/v1/uddi:a": {"get": {"summary": "x_20251031"}}}}
    client = _client(lambda req: httpx.Response(200, json=spec))
    with pytest.raises(SystemExit):
        c.collect_odcloud(client, KEY, "loc", "ns/v1", [], "19990101", "20260101", False)
    (tmp_path / "loc_20260101.json").write_text("{}", encoding="utf-8")
    c.collect_odcloud(client, KEY, "loc", "ns/v1", [], None, "20260101", False)      # 같은 날짜 파일은 건너뜀(덮어쓰지 않음)
    assert "[skip]" in capsys.readouterr().out and (tmp_path / "loc_20260101.json").read_text(encoding="utf-8") == "{}"


def test_grid_points_are_deterministic_and_regular():
    if not (config.PROCESSED_DIR / "regions.geojson").exists():
        pytest.skip("regions.geojson 없음")
    import numpy as np
    from pyproj import Transformer

    a, b = c.tago_grid_points(), c.tago_grid_points()
    assert a == b and len(a) == len(set(a)) and 100 < len(a) < 400
    x, y = Transformer.from_crs(config.CRS_WGS84, config.CRS_METRIC, always_xy=True).transform([p[1] for p in a], [p[0] for p in a])
    pts = np.c_[x, y]
    d = np.hypot(pts[:, None, 0] - pts[None, :, 0], pts[:, None, 1] - pts[None, :, 1]) + np.eye(len(pts)) * 1e9
    assert d.min() > c.TAGO_GRID_STEP_M * 0.99                              # 이웃 점 간격이 설정한 격자 간격보다 좁지 않다(m 단위)


def test_the_api_key_is_not_present_in_code_raw_files_or_reports():
    """환경의 키 값이 코드·수집 원본·산출 표·문서에 문자 그대로 남아 있지 않다."""
    key = os.environ.get("DATA_GO_KR_KEY", "").strip()
    if not key:
        pytest.skip("DATA_GO_KR_KEY 없음")
    roots = [config.ROOT / "pipelines", config.ROOT / "backend" / "app", config.ROOT / "frontend" / "src", config.RAW_DIR / "bus", config.TABLES_DIR]
    for root in roots:
        for p in root.rglob("*"):
            if p.is_file() and p.suffix in {".py", ".json", ".csv", ".md", ".ts", ".tsx", ".txt"}:
                assert key not in p.read_text(encoding="utf-8", errors="ignore"), p
