"""지하철·도시철도 수집기 — 키 노출 방지, 재시도, 월 목록, 타일, 중복 수집 방지."""
from __future__ import annotations

import json
import os

import httpx
import pytest

from pipelines.collect import collect_rail_transit as c
from pipelines.common import config


def _client(handler) -> httpx.Client:
    return httpx.Client(transport=httpx.MockTransport(handler))


def test_months_are_inclusive_and_cross_years():
    assert c._months("202511", "202602") == ["202511", "202512", "202601", "202602"]
    assert c._months("202501", "202501") == ["202501"]


def test_secret_in_the_url_path_is_never_echoed_in_errors():
    secret = "SEOULSECRET123abc"

    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(403, text=f"denied for {req.url}")

    with pytest.raises(c.ApiError) as e:
        c._json(_client(handler), f"{c.SEOUL}/{secret}/json/x/1/2/", secret)
    assert secret not in str(e.value)

    def boom(req: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError(f"cannot reach {req.url}")

    with pytest.raises(httpx.TransportError) as e2:
        c._json.__wrapped__(_client(boom), f"{c.SEOUL}/{secret}/json/x/1/2/", secret)
    assert secret not in str(e2.value)


def test_server_errors_are_retried_then_succeed(monkeypatch):
    calls = {"n": 0}

    def handler(req: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(503) if calls["n"] < 3 else httpx.Response(200, json={"ok": 1})

    monkeypatch.setattr(c._json.retry, "wait", lambda *_a, **_k: 0)
    assert c._json(_client(handler), "https://example.test/x", "k") == {"ok": 1} and calls["n"] == 3


def test_seoul_rows_pages_until_total_and_empty_month_is_empty(monkeypatch):
    monkeypatch.setattr(c, "SEOUL_PAGE", 2)
    monkeypatch.setattr(c, "DELAY_SEC", 0)
    data = [{"i": i} for i in range(5)]

    def handler(req: httpx.Request) -> httpx.Response:
        parts = req.url.path.strip("/").split("/")
        service = parts[2]
        if service == "Empty":
            return httpx.Response(200, json={"RESULT": {"CODE": "INFO-200", "MESSAGE": "없음"}})
        start, end = int(parts[3]), int(parts[4])
        return httpx.Response(200, json={service: {"list_total_count": 5, "RESULT": {"CODE": "INFO-000"}, "row": data[start - 1:end]}})

    client = _client(handler)
    rows, total = c._seoul_rows(client, "KEY", "Svc")
    assert rows == data and total == 5
    assert c._seoul_rows(client, "KEY", "Empty") == ([], 0)


def test_existing_raw_file_is_not_overwritten(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(c, "OUT_DIR", tmp_path)
    (tmp_path / "seoul_master_20260101.json").write_text("{}", encoding="utf-8")
    assert c._exists("seoul_master", "20260101", False) is True and "이미 있음" in capsys.readouterr().out
    assert c._exists("seoul_master", "20260101", True) is False
    c._write("x", "20260101", {"item_count": 1, "rows": [1]})
    assert json.loads((tmp_path / "x_20260101.json").read_text(encoding="utf-8"))["rows"] == [1]


def test_kakao_tiles_cover_the_pilot_deterministically_and_stay_under_the_result_cap():
    a, b = c._tiles(), c._tiles()
    assert a == b and len(a) == len(set(a)) and 10 <= len(a) <= 200
    assert all(x2 - x1 == pytest.approx(c.TILE_DEG, abs=1e-4) for x1, _, x2, _ in a)
    assert c.EXIT_MAX_NO >= 12 and c.EXIT_MISS_STOP >= 2         # 큰 역(출구 10개 이상)에서 일찍 끊기지 않는다


def test_the_api_keys_are_not_present_in_code_raw_files_or_reports():
    keys = {n: os.environ.get(n, "").strip() for n in ("SEOUL_OPENAPI_KEY", "KAKAO_REST_API_KEY", "DATA_GO_KR_KEY")}
    keys = {n: v for n, v in keys.items() if len(v) >= 16}
    if not keys:
        pytest.skip("키 환경변수 없음")
    roots = [config.ROOT / "pipelines", config.ROOT / "backend" / "app", config.ROOT / "frontend" / "src", config.RAW_DIR / "rail", config.TABLES_DIR, config.PROCESSED_DIR / "rail_meta.json"]
    for root in roots:
        files = [root] if root.is_file() else root.rglob("*")
        for p in files:
            if p.is_file() and p.suffix in {".py", ".json", ".csv", ".md", ".ts", ".tsx", ".txt"}:
                text = p.read_text(encoding="utf-8", errors="ignore")
                for n, v in keys.items():
                    assert v not in text, f"{n} 값이 {p} 에 있음"


def test_usage_versions_are_saved_as_separate_files_with_their_own_observed_period(tmp_path, monkeypatch):
    """인천처럼 버전마다 관측 기간이 다른 자료는 버전별 파일로 저장하고 첫·마지막 날짜를 남긴다."""
    monkeypatch.setattr(c, "OUT_DIR", tmp_path)
    monkeypatch.setattr(c, "DELAY_SEC", 0)
    monkeypatch.setitem(c.USAGE_VERSIONS, "incheon", ("15004329/v1", "통행일자", ["20250630", "20260630", "29990101"]))
    spec = {"paths": {f"/15004329/v1/uddi:{v}": {"get": {"summary": f"인천교통공사_역별일별 이용인원현황_{v}"}} for v in ("20250630", "20260630")}}
    days = {"20250630": ["2025-06-29", "2025-06-30"], "20260630": ["2026-06-29", "2026-06-30"]}

    def handler(req: httpx.Request) -> httpx.Response:
        if "oas/docs" in str(req.url):
            return httpx.Response(200, json=spec)
        ver = req.url.path.split("uddi:")[1]
        rows = [{"통행일자": d, "호선": 1, "역명": "계양", "승차인원": 1, "하차인원": 2, "이용인원": 3} for d in days[ver]]
        return httpx.Response(200, json={"page": 1, "perPage": 1000, "totalCount": 2, "matchCount": 2, "currentCount": 2, "data": rows})

    c.collect_usage_versions(_client(handler), "KEY", "incheon", "20261015", False)
    a = json.loads((tmp_path / "incheon_20250630_20261015.json").read_text(encoding="utf-8"))
    b = json.loads((tmp_path / "incheon_20260630_20261015.json").read_text(encoding="utf-8"))
    assert (a["period_first"], a["period_last"]) == ("2025-06-29", "2025-06-30") and (b["period_first"], b["period_last"]) == ("2026-06-29", "2026-06-30")
    assert not (tmp_path / "incheon_29991101_20261015.json").exists()                  # 공개 목록에 없는 버전은 만들지 않는다(임의 생성 금지)
    assert not list(tmp_path.glob("incheon_29991231*"))
    c.collect_usage_versions(_client(handler), "KEY", "incheon", "20261015", False)   # 같은 날 다시 실행해도 덮어쓰지 않는다
    assert json.loads((tmp_path / "incheon_20250630_20261015.json").read_text(encoding="utf-8"))["collected_at"] == a["collected_at"]
