"""소분류 247개 전체의 '서울시 추정매출' 대응 상태표.

실행: .venv/bin/python -m pipelines.transform.build_sales_crosswalk   (build_sales_timeseries 다음)
입력: data/processed/{industry_taxonomy,dong_industry_sales}.parquet, data/raw/seoul/stores_*.json(업종명)
출력: data/processed/sales_industry_crosswalk.parquet — indsSclsCd, svc_cd, svc_nm, status, note
      status: sales(파일럿 지역 추정매출 있음) | no_sales(대응 업종은 있으나 추정매출 미제공) | no_match(대응 업종 없음)
"""
from __future__ import annotations

import sys

import pandas as pd

from pipelines.common import config
from pipelines.common.sales_industry_crosswalk import SCLS_TO_SVC


def main() -> None:
    tax = pd.read_parquet(config.PROCESSED_DIR / "industry_taxonomy.parquet")
    sales = pd.read_parquet(config.PROCESSED_DIR / "dong_industry_sales.parquet")
    names = pd.read_parquet(config.PROCESSED_DIR / "seoul_stores.parquet").drop_duplicates("SVC_INDUTY_CD") \
        .set_index("SVC_INDUTY_CD")["SVC_INDUTY_CD_NM"]
    with_sales = set(sales.loc[sales["sales_q"] > 0, "svc_cd"])

    unknown = set(SCLS_TO_SVC) - set(tax["indsSclsCd"])
    bad_svc = {v[0] for v in SCLS_TO_SVC.values()} - set(names.index)
    if unknown or bad_svc:
        sys.exit(f"[중단] 대응표 오류 — 공식 분류에 없는 소분류 {sorted(unknown)} / 서울시에 없는 업종 {sorted(bad_svc)}")

    rows = []
    for r in tax.itertuples():
        svc, note = SCLS_TO_SVC.get(r.indsSclsCd, (None, ""))
        status = "no_match" if svc is None else ("sales" if svc in with_sales else "no_sales")
        rows.append({"indsSclsCd": r.indsSclsCd, "indsSclsNm": r.indsSclsNm, "store_count": r.store_count,
                     "svc_cd": svc, "svc_nm": names.get(svc) if svc else None, "status": status, "note": note})
    out = pd.DataFrame(rows)
    out.to_parquet(config.PROCESSED_DIR / "sales_industry_crosswalk.parquet", index=False)
    summary = out.groupby("status").agg(scls=("indsSclsCd", "size"), stores=("store_count", "sum"))
    summary.to_csv(config.TABLES_DIR / "sales_crosswalk_summary.csv")
    print(f"저장: sales_industry_crosswalk.parquet ({len(out)}개 소분류)")
    print(summary.to_string())


if __name__ == "__main__":
    main()
