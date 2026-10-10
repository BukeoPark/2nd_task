"""R-ONE 임대동향 — 지표별 기준 분기. 산출물(reb_zone_metrics.parquet)이 기록한 분기를 그대로 전달한다."""
from __future__ import annotations

METRIC_COLS = ("vacancy_small_shop_pct", "rent_small_shop", "vacancy_midlarge_shop_pct", "rent_midlarge_shop",
               "vacancy_office_pct", "rent_office")


def quarter_label(code: str | None) -> str | None:
    """R-ONE 분기 코드('202602') → '2026년 2분기'. 형식이 아니면 None(추측해서 표시하지 않는다)."""
    if code and len(code) == 6 and code.isdigit() and code[4] == "0" and code[5] in "1234":
        return f"{code[:4]}년 {code[5]}분기"
    return None


def reb_quarters(records: list[dict]) -> dict[str, str | None]:
    """지표 → 기준 분기 라벨. 산출물에 분기 칸이 없거나 상권마다 분기가 다르면(합쳐 말할 수 없으면) None."""
    out: dict[str, str | None] = {}
    for col in METRIC_COLS:
        found = {rec.get(f"{col}_quarter") for rec in records} - {None}
        out[col] = quarter_label(next(iter(found))) if len(found) == 1 else None
    return out
