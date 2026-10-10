"""분기 이동·연 개폐업 공용 계산 — 합성 표로 결측·0·부분 결측·관찰기간 부족을 구분하는지 확인한다."""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from app.services import store_churn as sc

QS = sc.churn_quarters("20262")


def test_shift_quarter_crosses_year_boundaries():
    assert sc.shift_quarter("20262", 4) == "20252"
    assert sc.shift_quarter("20261", 1) == "20254"
    assert sc.shift_quarter("20254", -1) == "20261"
    assert QS == ["20253", "20254", "20261", "20262"]


def _rows(unit: str, svc: str, quarters: list[str], stores, opened, closed) -> list[dict]:
    return [{"u": unit, "svc_cd": svc, "quarter": q, "stores": stores, "open_stores": opened, "close_stores": closed} for q in quarters]


def _run(rows: list[dict]) -> pd.DataFrame:
    return sc.annual_churn(pd.DataFrame(rows), "20262", "u", "u")


def test_normal_data_sums_four_quarters_over_average_stores():
    out = _run(_rows("A", "CS1", QS, 10, 1, 2))
    a = out.loc["A"]
    assert a["status"] == sc.STATUS_OK and (a["opened"], a["closed"], a["avg_stores"]) == (4, 8, 10)
    assert a["open_rate"] == pytest.approx(0.4) and a["close_rate"] == pytest.approx(0.8)
    assert (a["groups_used"], a["groups_total"]) == (1, 1)


def test_real_zero_openings_and_closures_stay_a_real_zero():
    """개업·폐업이 값으로 0 이면 '0건·0%'가 맞다 — 결측과 구분되는 정상 결과."""
    a = _run(_rows("A", "CS1", QS, 10, 0, 0)).loc["A"]
    assert a["status"] == sc.STATUS_OK and a["opened"] == 0 and a["open_rate"] == 0 and a["close_rate"] == 0


def test_all_missing_openings_are_not_turned_into_zero():
    """개업·폐업이 전부 결측이면 0건·0% 로 합산하지 않고 자료 없음(missing_values)으로 둔다."""
    a = _run(_rows("A", "CS1", QS, 10, np.nan, np.nan)).loc["A"]
    assert a["status"] == sc.STATUS_MISSING
    assert pd.isna(a["opened"]) and pd.isna(a["open_rate"]) and pd.isna(a["close_rate"]) and a["groups_used"] == 0
    assert sc.usable(pd.DataFrame([a])).empty


def test_one_missing_quarter_value_makes_the_year_incomplete():
    rows = _rows("A", "CS1", QS, 10, 1, 1)
    rows[2]["close_stores"] = np.nan  # 한 분기 폐업 수만 비어 있음 — 3개 분기만 더해 연 통계처럼 보이면 안 된다
    a = _run(rows).loc["A"]
    assert a["status"] == sc.STATUS_MISSING and pd.isna(a["close_rate"])


def test_missing_store_count_is_not_zero_stores():
    rows = _rows("A", "CS1", QS, np.nan, 1, 1)
    assert _run(rows).loc["A", "status"] == sc.STATUS_MISSING


def test_short_observation_period_is_distinct_from_missing_values():
    a = _run(_rows("A", "CS1", QS[1:], 10, 1, 1)).loc["A"]  # 3개 분기만 관찰
    assert a["status"] == sc.STATUS_SHORT and pd.isna(a["open_rate"])


def test_zero_stores_unit_is_too_small_not_a_division_error():
    a = _run(_rows("A", "CS1", QS, 0, 0, 0)).loc["A"]
    assert a["status"] == sc.STATUS_TOO_SMALL and pd.isna(a["open_rate"])
    assert _run(_rows("B", "CS1", QS, 3, 1, 1)).loc["B", "status"] == sc.STATUS_TOO_SMALL  # 평균 5곳 미만


def test_partial_groups_are_marked_partial_and_only_complete_groups_are_summed():
    full = _rows("U", "CS1", QS, 10, 1, 1)
    gap = _rows("U", "CS2", QS, 10, np.nan, np.nan)      # 값이 비어 있는 업종 집단 → 제외
    short = _rows("U", "CS3", QS[1:], 10, 5, 5)          # 관찰 3개 분기뿐인 업종 집단 → 제외
    u = _run(full + gap + short).loc["U"]
    assert u["status"] == sc.STATUS_PARTIAL and (u["groups_used"], u["groups_total"]) == (1, 3)
    assert (u["opened"], u["closed"], u["avg_stores"]) == (4, 4, 10)  # 제외된 집단의 값이 섞이지 않음
    assert u["open_rate"] == pytest.approx(0.4)
