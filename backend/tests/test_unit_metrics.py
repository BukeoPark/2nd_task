"""단위 지표 계산 — 결측·0·부분 결측을 합성 표로 재현해 분자·분모가 같은 집단만 쓰는지 확인한다."""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from app.services import unit_metrics as um

MAN = 10_000


def _row(unit: str, svc: str, quarter: str = "20262", *, sales=np.nan, stores=np.nan, frc=0.0, opened=0.0, closed=0.0, flpop=1_000_000.0) -> dict:
    return {"_unit": "U", "_unit_raw": unit, "svc_cd": svc, "quarter": quarter, "sales_q": sales, "stores": stores,
            "frc_stores": frc, "open_stores": opened, "close_stores": closed, "flpop": flpop}


def _now(rows: list[dict]) -> pd.DataFrame:
    return pd.DataFrame(rows)


def test_reported_case_sales_without_store_count_is_not_added_to_the_numerator():
    """A: 분기 매출 9,000만 원·점포 10곳(월 300만 원), B: 같은 매출·점포 수 누락 → 합쳐도 월 300만 원이어야 한다(600만 원 아님)."""
    now = _now([_row("A", "CS1", sales=9_000 * MAN, stores=10), _row("B", "CS2", sales=9_000 * MAN, stores=np.nan)])
    r = um.ratio_metric(now, "_unit", "sales_q", "stores", scale=1 / 3, share_of_sales=True).loc["U"]
    assert r["value"] == pytest.approx(300 * MAN)
    assert (r["used"], r["total"]) == (1, 2)                      # 두 집단 중 한 집단만 썼다는 범위
    assert r["excluded_sales_share"] == pytest.approx(0.5)        # 제외된 집단의 매출이 전체의 50%
    # 예전 방식(결측을 0 으로 건너뛰고 따로 합산)은 이 숫자를 600만 원으로 만든다
    naive = now["sales_q"].sum() / now["stores"].sum() / 3
    assert naive == pytest.approx(600 * MAN)


def test_normal_data_uses_every_group_and_reports_no_exclusion():
    now = _now([_row("A", "CS1", sales=9_000 * MAN, stores=10), _row("B", "CS2", sales=6_000 * MAN, stores=10)])
    r = um.ratio_metric(now, "_unit", "sales_q", "stores", scale=1 / 3, share_of_sales=True).loc["U"]
    assert r["value"] == pytest.approx(15_000 * MAN / 20 / 3)
    assert (r["used"], r["total"], r["excluded_sales_share"]) == (2, 2, 0.0) and pd.isna(r["reason"])


def test_all_store_counts_missing_gives_no_value_and_a_reason_not_zero():
    now = _now([_row("A", "CS1", sales=9_000 * MAN), _row("B", "CS2", sales=1_000 * MAN)])
    r = um.ratio_metric(now, "_unit", "sales_q", "stores", scale=1 / 3, share_of_sales=True).loc["U"]
    assert pd.isna(r["value"]) and r["used"] == 0 and r["reason"] == um.MISSING_INPUTS
    assert r["excluded_sales_share"] == pytest.approx(1.0)


def test_zero_stores_is_excluded_with_its_own_reason():
    only_zero = _now([_row("A", "CS1", sales=9_000 * MAN, stores=0)])
    r = um.ratio_metric(only_zero, "_unit", "sales_q", "stores", scale=1 / 3).loc["U"]
    assert pd.isna(r["value"]) and r["reason"] == um.ZERO_STORES   # 결측(자료 없음)과 구분되는 '점포 0'
    mixed = _now([_row("A", "CS1", sales=9_000 * MAN, stores=0), _row("B", "CS2", sales=6_000 * MAN, stores=10)])
    m = um.ratio_metric(mixed, "_unit", "sales_q", "stores", scale=1 / 3, share_of_sales=True).loc["U"]
    assert m["value"] == pytest.approx(6_000 * MAN / 10 / 3) and (m["used"], m["total"]) == (1, 2)


def test_opening_rate_ignores_groups_with_missing_openings_instead_of_counting_them_as_zero():
    now = _now([_row("A", "CS1", sales=1, stores=10, opened=2.0), _row("B", "CS2", sales=1, stores=10, opened=np.nan)])
    r = um.ratio_metric(now, "_unit", "open_stores", "stores", scale=100.0, min_den=um.MIN_STORES_FOR_RATE).loc["U"]
    assert r["value"] == pytest.approx(20.0)        # 2 ÷ 10 (결측 집단의 점포 10곳은 분모에도 넣지 않음). 예전 방식이면 2 ÷ 20 = 10%
    assert (r["used"], r["total"]) == (1, 2)


def test_all_openings_missing_is_not_zero_percent():
    now = _now([_row("A", "CS1", sales=1, stores=10, opened=np.nan, closed=np.nan)])
    r = um.ratio_metric(now, "_unit", "open_stores", "stores", scale=100.0, min_den=um.MIN_STORES_FOR_RATE).loc["U"]
    assert pd.isna(r["value"]) and r["reason"] == um.MISSING_INPUTS


def test_real_zero_openings_are_a_real_zero_percent():
    now = _now([_row("A", "CS1", sales=1, stores=10, opened=0.0)])
    r = um.ratio_metric(now, "_unit", "open_stores", "stores", scale=100.0, min_den=um.MIN_STORES_FOR_RATE).loc["U"]
    assert r["value"] == 0.0 and pd.isna(r["reason"])


def test_too_few_stores_has_its_own_reason():
    now = _now([_row("A", "CS1", sales=1, stores=2, opened=1.0)])
    r = um.ratio_metric(now, "_unit", "open_stores", "stores", scale=100.0, min_den=um.MIN_STORES_FOR_RATE).loc["U"]
    assert pd.isna(r["value"]) and r["reason"] == um.TOO_FEW_STORES and r["used"] == 1


def test_sales_per_flpop_only_uses_units_with_both_values():
    now = _now([_row("A", "CS1", sales=100 * MAN, stores=1, flpop=1_000_000.0),
                _row("B", "CS1", sales=900 * MAN, stores=1, flpop=np.nan)])
    r = um.sales_per_flpop(now, "_unit", "_unit_raw").loc["U"]
    assert r["value"] == pytest.approx(100 * MAN / 1_000_000 * 1e4)   # B 의 매출은 분자에서도 빠진다
    assert (r["used"], r["total"]) == (1, 2) and r["excluded_sales_share"] == pytest.approx(0.9)


def test_yoy_needs_sales_in_both_quarters_for_the_same_group():
    now = _now([_row("A", "CS1", sales=110.0, stores=1), _row("B", "CS2", sales=500.0, stores=1)])
    ago = _now([_row("A", "CS1", "20252", sales=100.0, stores=1), _row("B", "CS2", "20252", sales=np.nan, stores=1)])
    r = um.sales_yoy(now, ago, "_unit", "_unit_raw").loc["U"]
    assert r["value"] == pytest.approx(10.0)       # B 는 전년 값이 없어 이번 분기 매출도 비교에서 뺀다(500 이 섞이면 +450%)
    assert (r["used"], r["total"]) == (1, 2)


def _series(unit: str, svc: str, stores: list[float]) -> list[dict]:
    qs = ["20241", "20242", "20243", "20244", "20251", "20252", "20253", "20254"][-len(stores):]
    return [_row(unit, svc, q, sales=1, stores=s) | {"quarter": q} for q, s in zip(qs, stores)]


def test_store_dynamics_skips_groups_with_a_missing_quarter_value_or_row():
    q8 = ["20241", "20242", "20243", "20244", "20251", "20252", "20253", "20254"]
    ok = [_row("A", "CS1", q, stores=10.0) for q in q8]
    hole = [_row("B", "CS2", q, stores=(np.nan if q == "20243" else 50.0)) for q in q8]   # 한 분기 값이 비어 있음
    short = [_row("C", "CS3", q, stores=20.0) for q in q8[3:]]                           # 관찰 5개 분기뿐
    df = _now(ok + hole + short)
    values, period, cov = um.store_dynamics(df, "20254", "_unit", "_unit_raw")
    assert (cov.loc["U", "used"], cov.loc["U", "total"]) == (1, 3)
    assert values.loc["U", "stores_change_2y"] == 0.0   # A 집단만(10→10), 합계가 가짜로 출렁이지 않는다
    assert period == "2024년 1분기~2025년 4분기"


def test_store_dynamics_reasons_for_unusable_groups():
    q8 = ["20241", "20242", "20243", "20244", "20251", "20252", "20253", "20254"]
    short_only = _now([_row("C", "CS3", q, stores=20.0) for q in q8[5:]])
    _, _, cov = um.store_dynamics(short_only, "20254", "_unit", "_unit_raw")
    assert cov.loc["U", "reason"] == um.SHORT_PERIOD
    missing_only = _now([_row("B", "CS2", q, stores=np.nan) for q in q8])
    _, _, cov = um.store_dynamics(missing_only, "20254", "_unit", "_unit_raw")
    assert cov.loc["U", "reason"] == um.MISSING_INPUTS


def test_empty_input_does_not_crash():
    empty = _now([_row("A", "CS1", sales=1, stores=1)]).iloc[0:0]
    cov, _ = um.latest_metrics(empty, "20262")
    assert all(f.empty for f in cov.values())
