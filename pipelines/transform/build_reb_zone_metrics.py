"""R-ONE 상권명(영등포역·당산역·여의도·목동·까치산역)에 최신 분기 임대료·공실률을 붙인다.

실행
----
프로젝트 루트에서: .venv/bin/python -m pipelines.transform.build_reb_zone_metrics

입력: data/processed/reb_zone_coords.parquet (build_reb_zone_coords 산출물)
      data/raw/reb/*.json (collect_reb_rone 산출물 6종, 시군구별 최신 파일)

출력: data/processed/reb_zone_metrics.parquet
      (reb_zone_nm, lon, lat, in_pilot_sigungu,
       vacancy_small_shop_pct, rent_small_shop, vacancy_midlarge_shop_pct, rent_midlarge_shop,
       vacancy_office_pct, rent_office)  — 값이 없는 지표는 NaN(해당 상권 유형 조사가 없는 경우, 예: 여의도의 소규모 상가).
"""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from pipelines.collect.collect_reb_rone import TABLES
from pipelines.common import config

RAW_DIR = config.RAW_DIR / "reb"
LATEST_QUARTER = "202602"  # collect_reb_rone.py 수집 시점 기준 최신 분기(2026년 2분기)


def _latest_raw_file(statbl_id: str) -> Path | None:
    candidates = sorted(RAW_DIR.glob(f"*_{statbl_id}_*.json"))
    return candidates[-1] if candidates else None


def _latest_value_by_zone(dataset_key: str) -> pd.Series:
    statbl_id, _dtacycle_cd, _desc = TABLES[dataset_key]
    path = _latest_raw_file(statbl_id)
    if path is None:
        return pd.Series(dtype="float64")
    with path.open(encoding="utf-8") as f:
        envelope = json.load(f)
    rows = pd.DataFrame(envelope["rows"])
    latest = rows.loc[rows["WRTTIME_IDTFR_ID"] == LATEST_QUARTER]
    return latest.set_index("CLS_NM")["DTA_VAL"]


def main() -> None:
    zones = pd.read_parquet(config.PROCESSED_DIR / "reb_zone_coords.parquet")

    metric_cols = {
        "vacancy_small_shop": "vacancy_small_shop_pct",
        "rent_small_shop": "rent_small_shop",
        "vacancy_midlarge_shop": "vacancy_midlarge_shop_pct",
        "rent_midlarge_shop": "rent_midlarge_shop",
        "vacancy_office": "vacancy_office_pct",
        "rent_office": "rent_office",
    }
    for dataset_key, out_col in metric_cols.items():
        values = _latest_value_by_zone(dataset_key)
        zones[out_col] = zones["reb_zone_nm"].map(values)

    out_path = config.PROCESSED_DIR / "reb_zone_metrics.parquet"
    zones.to_parquet(out_path, index=False)
    print(f"저장: {out_path.relative_to(config.ROOT)} ({len(zones)}개 상권)")
    print(zones.to_string(index=False))


if __name__ == "__main__":
    main()
