"""R-ONE 상권명(영등포역·당산역·여의도·목동·까치산역)에 임대료·공실률과 그 기준 분기를 붙인다.

실행
----
프로젝트 루트에서: .venv/bin/python -m pipelines.transform.build_reb_zone_metrics

입력: data/processed/reb_zone_coords.parquet (build_reb_zone_coords 산출물)
      data/raw/reb/*.json (collect_reb_rone 산출물 6종, 통계표별 최신 수집 파일)

출력: data/processed/reb_zone_metrics.parquet
      (reb_zone_nm, lon, lat, in_pilot_sigungu,
       vacancy_small_shop_pct, rent_small_shop, vacancy_midlarge_shop_pct, rent_midlarge_shop,
       vacancy_office_pct, rent_office,
       <위 6개 지표마다> <지표>_quarter  — 그 값을 고른 분기('202602' = 2026년 2분기))
      outputs/tables/reb_zone_metrics_log.csv  통계표별 최신 분기와 값이 있는/없는 상권

기준 분기 규칙
  - 통계표마다 원천에 실제로 들어 있는 가장 최근 분기(WRTTIME_IDTFR_ID 의 최댓값)를 쓴다 — 코드에 분기를 박아 두지 않는다.
    그래서 원천에 새 분기가 들어오면 다음 실행부터 자동으로 따라간다.
  - 지표(통계표)마다 최신 분기가 다를 수 있어 분기를 지표별 칸(<지표>_quarter)에 따로 기록한다.
  - 그 최신 분기에 값이 없는 상권은 NaN 으로 둔다. 이전 분기 값으로 채우지 않는다(최신 값처럼 보이지 않게).
    분기 칸은 값이 NaN 이어도 '이 분기를 확인했다'는 뜻으로 채워 화면이 '○○ 분기 조사 없음'이라고 말할 수 있다.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import pandas as pd

from pipelines.collect.collect_reb_rone import TABLES
from pipelines.common import config

RAW_DIR = config.RAW_DIR / "reb"
QUARTER_RE = re.compile(r"^\d{4}0[1-4]$")  # R-ONE 분기 코드: 연도 4자리 + 0 + 분기(1~4)

METRIC_COLS = {  # 통계표 키 → 산출물 칸
    "vacancy_small_shop": "vacancy_small_shop_pct",
    "rent_small_shop": "rent_small_shop",
    "vacancy_midlarge_shop": "vacancy_midlarge_shop_pct",
    "rent_midlarge_shop": "rent_midlarge_shop",
    "vacancy_office": "vacancy_office_pct",
    "rent_office": "rent_office",
}


def _latest_raw_file(statbl_id: str) -> Path | None:
    candidates = sorted(RAW_DIR.glob(f"*_{statbl_id}_*.json"))  # 파일명 끝이 수집일이라 정렬하면 가장 늦게 수집한 것이 마지막
    return candidates[-1] if candidates else None


def latest_quarter(rows: pd.DataFrame) -> str | None:
    """통계표에 실제로 들어 있는 가장 최근 분기. 분기 형식이 아닌 코드(월·연 단위 등)는 무시한다."""
    q = rows["WRTTIME_IDTFR_ID"].astype(str)
    valid = q[q.str.match(QUARTER_RE)]
    return None if valid.empty else str(valid.max())


def select_latest(rows: pd.DataFrame) -> tuple[pd.Series, str | None]:
    """(상권명 → 최신 분기 값, 최신 분기). 같은 분기에 같은 이름이 여러 줄이면 모호하므로 값을 쓰지 않는다."""
    quarter = latest_quarter(rows)
    if quarter is None:
        return pd.Series(dtype="float64"), None
    cur = rows.loc[rows["WRTTIME_IDTFR_ID"].astype(str) == quarter, ["CLS_NM", "DTA_VAL"]].copy()
    cur["DTA_VAL"] = pd.to_numeric(cur["DTA_VAL"], errors="coerce")
    dup = cur["CLS_NM"].duplicated(keep=False)
    return cur.loc[~dup].set_index("CLS_NM")["DTA_VAL"], quarter


def build_metrics(zones: pd.DataFrame, tables: dict[str, pd.DataFrame]) -> tuple[pd.DataFrame, list[dict]]:
    """상권 목록에 통계표별 최신 분기 값과 그 분기를 붙인다. tables: 통계표 키 → 원본 행."""
    out = zones.copy()
    log: list[dict] = []
    for key, col in METRIC_COLS.items():
        rows = tables.get(key)
        values, quarter = select_latest(rows) if rows is not None else (pd.Series(dtype="float64"), None)
        out[col] = out["reb_zone_nm"].map(values)
        out[f"{col}_quarter"] = quarter
        have = out.loc[out[col].notna(), "reb_zone_nm"].tolist()
        log.append({"metric": col, "latest_quarter": quarter or "원천 없음", "zones_with_value": ",".join(have),
                    "zones_without_value": ",".join(out.loc[out[col].isna(), "reb_zone_nm"])})
    return out, log


def main() -> None:
    zones = pd.read_parquet(config.PROCESSED_DIR / "reb_zone_coords.parquet")
    tables: dict[str, pd.DataFrame] = {}
    for key in METRIC_COLS:
        path = _latest_raw_file(TABLES[key][0])
        if path is not None:
            tables[key] = pd.DataFrame(json.loads(path.read_text(encoding="utf-8"))["rows"])
    out, log = build_metrics(zones, tables)
    out_path = config.PROCESSED_DIR / "reb_zone_metrics.parquet"
    out.to_parquet(out_path, index=False)
    pd.DataFrame(log).to_csv(config.TABLES_DIR / "reb_zone_metrics_log.csv", index=False)
    print(f"저장: {out_path.relative_to(config.ROOT)} ({len(out)}개 상권)")
    for r in log:
        print(f"  {r['metric']}: 최신 분기 {r['latest_quarter']} · 값 있음 [{r['zones_with_value']}] · 값 없음 [{r['zones_without_value']}]")


if __name__ == "__main__":
    main()
