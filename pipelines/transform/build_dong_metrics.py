"""행정동(36개) 단위로 매출·점포·인구·상권변화지표를 한 표로 합친다 — 지도 코로플레스용.

실행
----
프로젝트 루트에서: .venv/bin/python -m pipelines.transform.build_dong_metrics

입력: data/processed/{seoul_sales,seoul_stores,seoul_change_index,seoul_floating_pop,
      seoul_resident_pop,seoul_workplace_pop,dong_crosswalk}.parquet

출력: data/processed/dong_metrics.parquet
      (region_id, adongCd, adongNm, sggnm,
       sales_total, sales_top_category, stores_total,
       change_index, change_index_nm,
       floating_pop, resident_pop, workplace_pop)

주의
----
seoul_floating_pop / seoul_change_index / seoul_resident_pop 는 (수집 당시 API가
STDR_YYQU_CD 필터를 안 받아들여) 2021Q1~2026Q2 **전체 22개 분기**가 들어있다.
이 스크립트는 그중 LATEST_QUARTER 한 시점만 골라 쓴다 — 나머지 분기는 나중에
"변동성/트렌드" 기능에 그대로 쓸 수 있어 원본은 그대로 둔다.
"""
from __future__ import annotations

import pandas as pd

from pipelines.common import config

LATEST_QUARTER = "20262"  # 2026년 2분기 — 2026-09-14 기준 모든 seoul_trdar 데이터셋의 최신 분기


def _latest(df: pd.DataFrame) -> pd.DataFrame:
    if "STDR_YYQU_CD" not in df.columns:
        return df
    return df.loc[df["STDR_YYQU_CD"] == LATEST_QUARTER]


def main() -> None:
    crosswalk = pd.read_parquet(config.PROCESSED_DIR / "dong_crosswalk.parquet")
    base = crosswalk[["region_id", "adongCd", "sggnm", "dong_nm"]].rename(columns={"dong_nm": "adongNm"})

    sales = _latest(pd.read_parquet(config.PROCESSED_DIR / "seoul_sales.parquet"))
    sales_agg = sales.groupby("ADSTRD_CD").agg(
        sales_total=("THSMON_SELNG_AMT", "sum"),
    )
    top_cat = (
        sales.sort_values("THSMON_SELNG_AMT", ascending=False)
        .groupby("ADSTRD_CD")["SVC_INDUTY_CD_NM"]
        .first()
        .rename("sales_top_category")
    )

    stores = _latest(pd.read_parquet(config.PROCESSED_DIR / "seoul_stores.parquet"))
    stores_agg = stores.groupby("ADSTRD_CD").agg(stores_total=("STOR_CO", "sum"))

    change_index = _latest(pd.read_parquet(config.PROCESSED_DIR / "seoul_change_index.parquet"))
    change_agg = change_index.set_index("ADSTRD_CD")[["TRDAR_CHNGE_IX", "TRDAR_CHNGE_IX_NM"]].rename(
        columns={"TRDAR_CHNGE_IX": "change_index", "TRDAR_CHNGE_IX_NM": "change_index_nm"}
    )

    floating_pop = _latest(pd.read_parquet(config.PROCESSED_DIR / "seoul_floating_pop.parquet"))
    floating_agg = floating_pop.set_index("ADSTRD_CD")[["TOT_FLPOP_CO"]].rename(columns={"TOT_FLPOP_CO": "floating_pop"})

    resident_pop = _latest(pd.read_parquet(config.PROCESSED_DIR / "seoul_resident_pop.parquet"))
    resident_agg = resident_pop.set_index("ADSTRD_CD")[["TOT_REPOP_CO"]].rename(columns={"TOT_REPOP_CO": "resident_pop"})

    workplace_pop = _latest(pd.read_parquet(config.PROCESSED_DIR / "seoul_workplace_pop.parquet"))
    workplace_agg = workplace_pop.set_index("ADSTRD_CD")[["TOT_WRC_POPLTN_CO"]].rename(
        columns={"TOT_WRC_POPLTN_CO": "workplace_pop"}
    )

    result = base.set_index("adongCd")
    for piece in (sales_agg, top_cat, stores_agg, change_agg, floating_agg, resident_agg, workplace_agg):
        result = result.join(piece, how="left")
    result = result.reset_index().rename(columns={"index": "adongCd"})

    missing = result[["sales_total", "stores_total"]].isna().any(axis=1).sum()
    if missing:
        print(f"[경고] {missing}개 행정동에서 매출/점포 데이터 결측 (소규모 동이라 API 미제공 가능)")

    out_path = config.PROCESSED_DIR / "dong_metrics.parquet"
    result.to_parquet(out_path, index=False)
    print(f"저장: {out_path.relative_to(config.ROOT)} ({len(result)}개 행정동, 기준분기 {LATEST_QUARTER})")
    print(result[["adongNm", "sggnm", "sales_total", "stores_total", "change_index_nm"]].to_string(index=False))


if __name__ == "__main__":
    main()
