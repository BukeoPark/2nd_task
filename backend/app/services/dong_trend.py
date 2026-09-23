"""행정동별 상권변화지표(TRDAR_CHNGE_IX) 분기 이력.

seoul_change_index.parquet 에는 2021Q1~2026Q2 22개 분기가 이미 다 들어있다
(수집 당시 API 가 분기 필터를 받아들이지 않아 통째로 저장됨). dong_metrics.parquet
은 그중 최신 분기만 쓰지만, 여기서는 그 이력 전체를 그대로 노출해 실측 데이터가
없는 "매출 트렌드" 대신 실제로 존재하는 "상권 변화 추이"를 보여준다.
"""
from __future__ import annotations

from app.services import data_store


def list_dong_trend() -> list[dict]:
    crosswalk = data_store.load_parquet("dong_crosswalk.parquet")[["region_id", "adongCd", "dong_nm", "sggnm"]]
    history = data_store.load_parquet("seoul_change_index.parquet")[
        ["ADSTRD_CD", "STDR_YYQU_CD", "TRDAR_CHNGE_IX", "TRDAR_CHNGE_IX_NM"]
    ].sort_values("STDR_YYQU_CD")

    records = []
    for _, dong in crosswalk.iterrows():
        rows = history.loc[history["ADSTRD_CD"] == dong["adongCd"]]
        quarters = [
            {
                "quarter": row["STDR_YYQU_CD"],
                "change_index": row["TRDAR_CHNGE_IX"],
                "change_index_nm": row["TRDAR_CHNGE_IX_NM"],
            }
            for _, row in rows.iterrows()
        ]
        records.append(
            {
                "region_id": int(dong["region_id"]),
                "adongCd": dong["adongCd"],
                "adongNm": dong["dong_nm"],
                "sggnm": dong["sggnm"],
                "quarters": quarters,
            }
        )
    return records
