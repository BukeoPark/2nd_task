"""R-ONE 기준 분기 라벨 — 산출물이 기록한 분기만 전달하고 추측하지 않는다."""
from __future__ import annotations

from app.services.reb import quarter_label, reb_quarters


def test_quarter_label_formats_valid_codes_only():
    assert quarter_label("202602") == "2026년 2분기"
    assert quarter_label("202504") == "2025년 4분기"
    for bad in ("2026", "202605", "202600", "26-02", None, ""):
        assert quarter_label(bad) is None


def test_quarters_follow_the_data_and_never_guess():
    recs = [{"rent_office_quarter": "202603", "rent_small_shop_quarter": "202602"},
            {"rent_office_quarter": "202603", "rent_small_shop_quarter": "202602"}]
    q = reb_quarters(recs)
    assert q["rent_office"] == "2026년 3분기" and q["rent_small_shop"] == "2026년 2분기"   # 지표마다 분기가 다를 수 있다
    assert q["vacancy_office_pct"] is None                                              # 산출물에 분기 칸이 없으면 말하지 않는다


def test_conflicting_quarters_are_not_merged_into_one_label():
    recs = [{"rent_office_quarter": "202602"}, {"rent_office_quarter": "202603"}]
    assert reb_quarters(recs)["rent_office"] is None
