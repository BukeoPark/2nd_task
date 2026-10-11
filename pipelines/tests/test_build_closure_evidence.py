"""폐업 근거 판정 규칙 — 결격이 하나라도 있으면 confirmed 가 될 수 없고, 근거는 두 가지뿐이다."""
from __future__ import annotations

import pandas as pd
import pytest

from pipelines.transform.build_closure_evidence import EVIDENCE_AFTER_SNAPSHOT, EVIDENCE_REPLACED, judge, snapshot_end

SNAP = snapshot_end("202606")
CLEAN = dict(exact=True, n_groups=1, has_close=True, ended_not_closed=False, same_name_active_building=False,
             same_name_active_nearby=False, duplicate_record=False, last_close=pd.Timestamp("2023-01-01"), snapshot=SNAP, replaced=False)


def test_snapshot_end_is_the_last_day_of_the_base_month():
    assert snapshot_end("202606") == pd.Timestamp("2026-06-30")
    assert snapshot_end("202602") == pd.Timestamp("2026-02-28")


def test_closure_after_the_store_snapshot_is_confirmed():
    status, evidence, reasons = judge(**{**CLEAN, "last_close": pd.Timestamp("2026-07-01")})
    assert (status, evidence, reasons) == ("confirmed", EVIDENCE_AFTER_SNAPSHOT, [])
    # 기준월 말일 당일은 '이후'가 아니다
    assert judge(**{**CLEAN, "last_close": SNAP})[0] == "uncertain"


def test_replacement_by_another_license_is_confirmed_only_when_clean():
    assert judge(**{**CLEAN, "replaced": True})[:2] == ("confirmed", EVIDENCE_REPLACED)


def test_old_closure_without_other_evidence_stays_uncertain():
    assert judge(**CLEAN) == ("uncertain", None, ["no_supporting_evidence"])


@pytest.mark.parametrize("flag,reason", [
    ({"exact": False}, "not_exact_name"),
    ({"n_groups": 2}, "multiple_closed_licenses"),
    ({"has_close": False}, "no_close_date"),
    ({"ended_not_closed": True}, "cancelled_or_removed"),
    ({"same_name_active_building": True}, "same_name_active_license_in_building"),
    ({"same_name_active_nearby": True}, "same_name_active_license_nearby"),
    ({"duplicate_record": True}, "duplicate_store_record"),
])
def test_any_disqualifier_blocks_confirmation_even_with_strong_evidence(flag, reason):
    strong = {**CLEAN, "last_close": pd.Timestamp("2026-08-01"), "replaced": True, **flag}
    status, evidence, reasons = judge(**strong)
    assert status == "uncertain" and evidence is None and reason in reasons


def test_missing_close_date_is_never_filled():
    status, _, reasons = judge(**{**CLEAN, "has_close": False, "last_close": pd.NaT, "replaced": True})
    assert status == "uncertain" and "no_close_date" in reasons
