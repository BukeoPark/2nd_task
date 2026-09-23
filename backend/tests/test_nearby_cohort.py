"""관찰기간을 맞춘 폐업 비율 계산 — 합성 데이터로 분자·분모·제외 규칙을 검증한다."""
from __future__ import annotations

from datetime import date

import pandas as pd

from app.services.nearby_analysis import cohort_close_rate, yearly_trend

AS_OF = date(2026, 9, 23)


def _lic(permit: str, status: str = "active", close: str | None = None) -> dict:
    return {"permit_date": pd.Timestamp(permit), "status_norm": status,
            "close_date": pd.Timestamp(close) if close else pd.NaT}


def test_only_licenses_with_full_observation_are_counted():
    df = pd.DataFrame(
        [_lic("2020-01-01", "closed", "2021-06-01")] * 5      # 3년 안에 폐업 → 분자
        + [_lic("2020-01-01", "closed", "2024-06-01")] * 5    # 3년 넘어 폐업 → 분모만
        + [_lic("2021-01-01")] * 15                           # 영업 중 → 분모만
        + [_lic("2024-01-01", "closed", "2024-06-01")] * 50   # 관찰 3년 미확보 → 제외
        + [_lic("2010-01-01", "closed", "2010-06-01")] * 50   # 코호트 창(13년 전) 밖 → 제외
    )
    r = cohort_close_rate(df, AS_OF, min_n=20)
    assert (r["numerator"], r["denominator"]) == (5, 25)
    assert r["rate"] == 0.2 and r["status"] == "ok"
    assert r["cohort_permit_to"] == "2023-09-23"


def test_unknown_end_and_missing_close_date_are_excluded_and_reported():
    df = pd.DataFrame(
        [_lic("2019-05-01")] * 20
        + [_lic("2019-05-01", "cancelled")] * 3
        + [_lic("2019-05-01", "closed")] * 2                      # 폐업인데 폐업일자 없음
        + [_lic("2019-05-01", "closed", "2018-01-01")] * 1        # 폐업일 < 인허가일
    )
    r = cohort_close_rate(df, AS_OF, min_n=20)
    assert r["denominator"] == 20 and r["numerator"] == 0 and r["rate"] == 0.0
    assert list(r["excluded"].values()) == [3, 2, 1]


def test_small_sample_is_insufficient_not_zero():
    r = cohort_close_rate(pd.DataFrame([_lic("2019-05-01")] * 5), AS_OF, min_n=20)
    assert r["status"] == "insufficient" and r["rate"] is None
    assert "분석 자료 부족" in r["message"]


def test_trend_distinguishes_zero_from_unknown():
    df = pd.DataFrame([_lic("2025-03-01", "closed", "2025-09-01")])
    known = {y["year"]: y for y in yearly_trend(df, AS_OF, closures_available=True)}
    unknown = {y["year"]: y for y in yearly_trend(df, AS_OF, closures_available=False)}
    assert known[2025]["closed"] == 1 and known[2024]["closed"] == 0
    assert unknown[2025]["closed"] is None and unknown[2025]["opened"] == 1
    assert known[2026]["partial_year"] is True
