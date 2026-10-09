"""분기 갱신 실행표 — 모든 수집·변환 모듈이 빠짐없이, 의존 순서대로 들어 있는지.

실행: .venv/bin/python -m pytest pipelines/tests
"""
from __future__ import annotations

import importlib
from pathlib import Path

import pytest

from pipelines import run_quarterly
from pipelines.run_quarterly import NOT_IN_QUARTERLY, STEPS

PKG = Path(run_quarterly.__file__).parent


def _modules() -> set[str]:
    return {f"pipelines.{d}.{p.stem}" for d in ("collect", "transform") for p in (PKG / d).glob("*.py") if p.stem != "__init__"}


def test_every_pipeline_module_is_scheduled_or_explicitly_excluded():
    scheduled = {s.module for s in STEPS}
    missing = _modules() - scheduled - set(NOT_IN_QUARTERLY)
    assert not missing, f"STEPS 에도 NOT_IN_QUARTERLY 에도 없는 모듈: {sorted(missing)}"
    assert not (scheduled & set(NOT_IN_QUARTERLY)), "실행표에 있으면서 제외 목록에도 있는 모듈"
    assert set(NOT_IN_QUARTERLY) <= _modules(), "제외 목록에 없는 모듈 이름이 있음"


def test_step_names_are_unique_and_importable():
    names = [s.name for s in STEPS]
    assert len(names) == len(set(names))
    for s in STEPS:
        if s.module != "pytest":
            importlib.import_module(s.module)  # 오타·삭제된 모듈이면 여기서 실패


# (먼저, 나중) — 나중 단계가 먼저 단계의 산출물을 입력으로 읽는다
MUST_PRECEDE = [
    ("clean_stores", "build_store_snapshots"),
    ("clean_stores", "merge_naver_anchors"), ("merge_naver_anchors", "compute_anchor_features"),
    ("clean_stores", "compute_store_density"), ("clean_stores", "compute_anchor_features"),
    ("clean_stores", "build_trdar_areas"), ("clean_stores", "link_store_licenses"), ("clean_stores", "filter_seoul_trdar"),
    ("build_licenses", "build_industry_crosswalk"), ("build_licenses", "link_store_licenses"),
    ("build_industry_crosswalk", "link_store_licenses"),
    ("build_dong_crosswalk", "build_sales_timeseries"), ("build_dong_crosswalk", "build_hinterland"),
    ("filter_seoul_trdar", "build_sales_timeseries"), ("filter_seoul_trdar", "build_dong_metrics"),
    ("build_trdar_areas", "build_sales_timeseries_trdar"), ("build_trdar_areas", "build_hinterland"),
    ("build_sales_timeseries", "build_sales_crosswalk"), ("build_sales_timeseries", "build_dong_metrics"),
    ("build_sales_crosswalk", "build_dong_metrics"),
    ("build_trdar_areas", "build_franchise"), ("clean_stores", "build_franchise"),
    ("export_source_registry", "pipeline_tests"), ("pipeline_tests", "backend_tests"),
]


@pytest.mark.parametrize("first,second", MUST_PRECEDE)
def test_dependency_order(first, second):
    order = [s.name for s in STEPS]
    assert first in order and second in order
    assert order.index(first) < order.index(second)


def test_collect_steps_come_before_every_transform_step():
    flags = [s.collect for s in STEPS if s.module != "pytest"]
    assert flags == sorted(flags, reverse=True), "수집(collect) 단계가 변환 단계 뒤에 끼어 있음"
