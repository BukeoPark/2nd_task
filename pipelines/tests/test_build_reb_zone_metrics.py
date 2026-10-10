"""R-ONE 임대료·공실률의 기준 분기 — 코드에 박힌 분기가 아니라 원천의 실제 최신 분기를 쓰는지 합성 데이터로 확인한다."""
from __future__ import annotations

import numpy as np
import pandas as pd

from pipelines.transform import build_reb_zone_metrics as m

ZONES = pd.DataFrame({"reb_zone_nm": ["영등포역", "당산역", "여의도"], "lon": [126.9, 126.8, 126.92], "lat": [37.5, 37.53, 37.52],
                      "in_pilot_sigungu": [True, True, True]})


def _rows(*triples: tuple[str, str, float]) -> pd.DataFrame:
    return pd.DataFrame([{"WRTTIME_IDTFR_ID": q, "CLS_NM": z, "DTA_VAL": v} for q, z, v in triples])


def test_no_hard_coded_quarter_remains():
    assert not hasattr(m, "LATEST_QUARTER")


def test_latest_quarter_comes_from_the_source_across_a_year_boundary():
    rows = _rows(("202503", "영등포역", 1.0), ("202504", "영등포역", 2.0), ("202601", "영등포역", 3.0), ("202602", "영등포역", 4.0))
    values, q = m.select_latest(rows)
    assert q == "202602" and values["영등포역"] == 4.0
    # 원천에 한 분기가 더 들어오면 코드를 고치지 않아도 다음 실행부터 따라간다
    values, q = m.select_latest(pd.concat([rows, _rows(("202603", "영등포역", 5.0))]))
    assert q == "202603" and values["영등포역"] == 5.0


def test_zone_without_a_latest_quarter_value_is_empty_not_filled_with_an_older_quarter():
    rows = _rows(("202601", "영등포역", 3.0), ("202601", "여의도", 7.0), ("202602", "영등포역", 4.0))  # 여의도는 202601 값만 있음
    out, log = m.build_metrics(ZONES, {"rent_small_shop": rows})
    by = out.set_index("reb_zone_nm")
    assert by.loc["영등포역", "rent_small_shop"] == 4.0
    assert pd.isna(by.loc["여의도", "rent_small_shop"])          # 7.0(2026년 1분기)을 최신 값처럼 쓰지 않는다
    assert (out["rent_small_shop_quarter"] == "202602").all()     # 값이 없어도 '202602 를 확인했다'는 분기는 남는다
    assert next(r for r in log if r["metric"] == "rent_small_shop")["zones_without_value"] == "당산역,여의도"


def test_each_metric_keeps_its_own_latest_quarter():
    tables = {"rent_small_shop": _rows(("202602", "영등포역", 4.0)),
              "vacancy_small_shop": _rows(("202601", "영등포역", 1.5), ("202604", "영등포역", 9.9))}
    out, _ = m.build_metrics(ZONES, tables)
    assert set(out["rent_small_shop_quarter"]) == {"202602"}
    assert set(out["vacancy_small_shop_pct_quarter"]) == {"202604"}
    assert out.set_index("reb_zone_nm").loc["영등포역", "vacancy_small_shop_pct"] == 9.9
    assert out["rent_office_quarter"].isna().all()                # 원천이 아예 없는 지표는 분기도 비어 있다


def test_non_quarter_codes_are_ignored_and_ambiguous_names_are_not_used():
    rows = _rows(("2026", "영등포역", 99.0), ("202602", "영등포역", 4.0), ("202602", "당산역", 1.0), ("202602", "당산역", 2.0))
    values, q = m.select_latest(rows)
    assert q == "202602" and values["영등포역"] == 4.0
    assert "당산역" not in values.index                              # 같은 분기·같은 이름이 둘이면 어느 값인지 모호해 쓰지 않음
    assert m.select_latest(_rows(("2026", "영등포역", 1.0)))[1] is None


def test_missing_value_stays_missing_not_zero():
    values, _ = m.select_latest(_rows(("202602", "영등포역", np.nan)))
    assert pd.isna(values["영등포역"])
