"""분기 이동·연 개폐업 공용 계산 — 합성 표로 기준(4개 분기 완비·평균 5곳 이상)을 확인한다."""
from __future__ import annotations

import pandas as pd
import pytest

from app.services import store_churn


def test_shift_quarter_crosses_year_boundaries():
    assert store_churn.shift_quarter("20262", 4) == "20252"
    assert store_churn.shift_quarter("20261", 1) == "20254"
    assert store_churn.shift_quarter("20254", -1) == "20261"
    assert store_churn.churn_quarters("20262") == ["20253", "20254", "20261", "20262"]


def _rows(unit: str, svc: str, quarters: list[str], stores: int, opened: int, closed: int) -> list[dict]:
    return [{"u": unit, "svc_cd": svc, "quarter": q, "stores": stores, "open_stores": opened, "close_stores": closed} for q in quarters]


def test_annual_churn_sums_four_quarters_over_average_stores():
    qs = store_churn.churn_quarters("20262")
    df = pd.DataFrame(_rows("A", "CS1", qs, 10, 1, 2))
    out = store_churn.annual_churn(df, "20262", "u", "u")
    assert out.loc["A", "opened"] == 4 and out.loc["A", "closed"] == 8
    assert out.loc["A", "open_rate"] == pytest.approx(0.4) and out.loc["A", "close_rate"] == pytest.approx(0.8)


def test_annual_churn_drops_incomplete_and_small_units():
    qs = store_churn.churn_quarters("20262")
    df = pd.DataFrame(
        _rows("FULL", "CS1", qs, 10, 1, 1)
        + _rows("GAP", "CS1", qs[1:], 10, 1, 1)        # 한 분기 행이 없음 → 가짜 출렁임 방지로 제외
        + _rows("TINY", "CS1", qs, 3, 1, 1)             # 평균 5곳 미만 → 제외
        + _rows("MIX", "CS1", qs, 10, 1, 1) + _rows("MIX", "CS2", qs[:2], 10, 5, 5)  # 불완전한 업종 행만 빠지고 나머지는 남음
    )
    out = store_churn.annual_churn(df, "20262", "u", "u")
    assert set(out.index) == {"FULL", "MIX"}
    assert out.loc["MIX", "opened"] == 4 and out.loc["MIX", "avg_stores"] == 10
