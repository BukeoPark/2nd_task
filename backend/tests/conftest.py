"""backend 테스트 공통 설정. 루트에서 `.venv/bin/pytest backend` 로 실행."""
from __future__ import annotations

import sys
from pathlib import Path

# `app` 패키지를 import 할 수 있도록 backend/ 를 경로에 추가.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)
