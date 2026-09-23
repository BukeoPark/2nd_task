"""파일 기반 데이터 접근 계층.

data/processed 에 저장된 가공 결과(Parquet/GeoJSON)를 읽어 API 로 제공한다.
나중에 PostGIS 를 도입하면 이 모듈의 구현만 교체하면 되도록 인터페이스를 단순하게 둔다.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

import pandas as pd

from app.config import settings

PROCESSED = settings.processed_dir


class DataNotReady(RuntimeError):
    """아직 파이프라인이 생성하지 않은 산출물을 요청한 경우."""


def _require(path: Path) -> Path:
    if not path.exists():
        try:
            shown = path.relative_to(settings.processed_dir.parents[1])
        except ValueError:
            shown = path
        raise DataNotReady(f"'{shown}' 가 없습니다. pipelines/ 파이프라인을 먼저 실행하세요.")
    return path


@lru_cache(maxsize=8)
def load_parquet(name: str) -> pd.DataFrame:
    return pd.read_parquet(_require(PROCESSED / name))


@lru_cache(maxsize=8)
def load_json(name: str) -> dict:
    with _require(PROCESSED / name).open(encoding="utf-8") as f:
        return json.load(f)


def available() -> list[str]:
    if not PROCESSED.exists():
        return []
    return sorted(p.name for p in PROCESSED.iterdir() if p.is_file() and p.name != ".gitkeep")


def records(name: str) -> list[dict]:
    """parquet 을 JSON-safe dict 리스트로 반환한다 (NaN -> null, 표준 JSON이 아니라서 그대로 두면 클라이언트가 깨짐)."""
    df = load_parquet(name)
    return df.astype(object).where(df.notna(), None).to_dict(orient="records")
