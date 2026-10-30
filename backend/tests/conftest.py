"""backend 테스트 공통 설정. 루트에서 `.venv/bin/python -m pytest backend` 로 실행.

data/processed 는 git 에 없다. 실제 산출물이 없는 환경(새 PC·CI)에서는
  - 산출물이 있어야 하는 테스트는 실패 대신 skip 으로 표시하고(이유에 파이프라인 안내),
  - 가상 샘플(`sample_data.py`)로 도는 `sample_*` 테스트가 API 계약을 대신 확인한다.
`REQUIRE_DATA=1` 이면 산출물이 없을 때 skip 하지 않고 그대로 실패시킨다(데이터가 있어야 하는 검증 환경용).
"""
from __future__ import annotations

import functools
import os
import sys
from pathlib import Path

# `app` 패키지를 import 할 수 있도록 backend/ 를 경로에 추가.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.services import data_store

REAL_DATA_KEYS = ("stores.parquet", "regions.geojson")
REAL_DATA_READY = all((settings.processed_dir / name).exists() for name in REAL_DATA_KEYS)
SKIP_ON_MISSING_DATA = not REAL_DATA_READY and os.environ.get("REQUIRE_DATA") != "1"
MISSING_REASON = "data/processed 산출물이 없어 건너뜀 — pipelines/ 파이프라인을 먼저 실행하세요(실패로 보려면 REQUIRE_DATA=1)"
SAW_503 = pytest.StashKey[bool]()


def pytest_report_header(config) -> str:
    if REAL_DATA_READY:
        return "실제 data/processed: 있음 — 전체 테스트 실행"
    mode = "REQUIRE_DATA=1 이므로 실패로 처리" if os.environ.get("REQUIRE_DATA") == "1" else "산출물 의존 테스트는 skip, 샘플 테스트만 실행"
    return f"실제 data/processed: 없음 — {mode}"


def _caused_by_missing_data(exc: BaseException | None) -> bool:
    while exc is not None:
        if isinstance(exc, data_store.DataNotReady):
            return True
        exc = exc.__cause__ or exc.__context__
    return False


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    report = outcome.get_result()
    if report.passed or call.excinfo is None or not SKIP_ON_MISSING_DATA or "sample_processed" in item.fixturenames:
        return
    if _caused_by_missing_data(call.excinfo.value) or item.stash.get(SAW_503, False):
        report.outcome = "skipped"
        report.longrepr = (str(item.path), item.location[1] or 0, f"Skipped: {MISSING_REASON}")


class _RecordingClient(TestClient):
    """산출물 없음(503)을 만난 테스트를 기록한다 — 단언이 상태 코드로 실패해도 원인이 데이터 부재임을 알 수 있다."""

    def __init__(self, *args, item=None, **kwargs):
        super().__init__(*args, **kwargs)
        self._item = item

    def request(self, *args, **kwargs):
        response = super().request(*args, **kwargs)
        if response.status_code == 503 and "파이프라인" in response.text and self._item is not None:
            self._item.stash[SAW_503] = True
        return response


@pytest.fixture
def client(request) -> TestClient:
    return _RecordingClient(app, item=request.node)


def _clear_caches() -> None:
    """서비스 모듈의 lru_cache 를 모두 비운다(샘플 ↔ 실데이터 전환 때 이전 데이터가 남지 않게)."""
    for module in list(sys.modules.values()):
        if getattr(module, "__name__", "").startswith("app.services"):
            for value in vars(module).values():
                if isinstance(value, functools._lru_cache_wrapper):
                    value.cache_clear()


@pytest.fixture
def sample_processed(tmp_path, monkeypatch) -> Path:
    """가상 산출물을 임시 폴더에 만들고 data_store 가 그곳을 읽게 한다."""
    from sample_data import write_sample

    write_sample(tmp_path)
    monkeypatch.setattr(data_store, "PROCESSED", tmp_path)
    monkeypatch.setattr(settings, "processed_dir", tmp_path)
    _clear_caches()
    yield tmp_path
    _clear_caches()


@pytest.fixture
def empty_processed(tmp_path, monkeypatch) -> Path:
    """산출물이 하나도 없는 상태 — 503 안내가 나오는지 확인하는 용도."""
    monkeypatch.setattr(data_store, "PROCESSED", tmp_path)
    monkeypatch.setattr(settings, "processed_dir", tmp_path)
    _clear_caches()
    yield tmp_path
    _clear_caches()
