"""공식 업종 분류(대·중·소) 소분류별 데이터 지원 범위와 데이터 원천 등록부."""
from __future__ import annotations

from app.services import data_store

COVERAGE_LABEL = {
    "connected": "인허가 이력 연결",
    "pending": "연동 준비 중",
    "not_connected": "원천 미연결",
    "not_applicable": "해당 인허가 없음",
}


def _taxonomy():
    return data_store.load_parquet("industry_taxonomy.parquet")


def sources() -> dict:
    return data_store.load_json("data_sources.json")


def scls_row(scls_cd: str) -> dict:
    df = _taxonomy()
    row = df.loc[df["indsSclsCd"] == scls_cd]
    if row.empty:
        raise KeyError(scls_cd)
    rec = row.iloc[0].to_dict()
    for col in ("license_codes", "license_names"):
        rec[col] = [] if rec[col] is None else list(rec[col])
    rec["uptae"] = None if rec["uptae"] is None else list(rec["uptae"])
    return rec
