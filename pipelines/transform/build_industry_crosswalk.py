"""공식 업종 분류(대·중·소) 전체 + 소분류별 인허가 대응 상태 표를 만든다.

실행: .venv/bin/python -m pipelines.transform.build_industry_crosswalk
입력: data/raw/sbiz/upjong_small_*.json (최신), data/processed/stores.parquet, data/processed/licenses.parquet(있으면)
출력: data/processed/industry_taxonomy.parquet — 소분류 1행
      (lcls/mcls/scls 코드·명, stdrDt, store_count, status, license_codes, license_names, uptae, rule, note,
       license_records — 연결된 원천의 파일럿 구 인허가 건수. 0 이면 '원천은 연결됐지만 이 지역 기록 없음')
"""
from __future__ import annotations

import json
import sys

import pandas as pd

from pipelines.common import config
from pipelines.common.industry_crosswalk import resolve
from pipelines.common.sources import LICENSE_SERVICES, OTHER_LICENSE_CODES, license_name


def main() -> None:
    path = sorted((config.RAW_DIR / "sbiz").glob("upjong_small_*.json"))[-1]
    small = pd.DataFrame(json.loads(path.read_text(encoding="utf-8"))["items"])
    stores = pd.read_parquet(config.PROCESSED_DIR / "stores.parquet")
    counts = stores.groupby("indsSclsCd").size()

    lic_counts: pd.Series | None = None
    lic_path = config.PROCESSED_DIR / "licenses.parquet"
    if lic_path.exists():
        lic_counts = pd.read_parquet(lic_path).groupby("license_code").size()

    rows = []
    for rec in small.itertuples():
        rule, origin = resolve(rec.indsSclsCd)
        unknown = [c for c in rule.license_codes if c not in LICENSE_SERVICES and c not in OTHER_LICENSE_CODES]
        if unknown:
            sys.exit(f"[중단] {rec.indsSclsCd} 규칙에 등록부에 없는 인허가 코드 {unknown}")
        records = (int(sum(lic_counts.get(c, 0) for c in rule.license_codes))
                   if lic_counts is not None and rule.license_codes else None)
        # 인증키 대기(pending) 업종이라도 원천 데이터가 실제로 적재돼 있으면 연결된 것으로 본다.
        status = "connected" if rule.status == "pending" and records else rule.status
        rows.append({
            "indsLclsCd": rec.indsLclsCd, "indsLclsNm": rec.indsLclsNm,
            "indsMclsCd": rec.indsMclsCd, "indsMclsNm": rec.indsMclsNm,
            "indsSclsCd": rec.indsSclsCd, "indsSclsNm": rec.indsSclsNm,
            "stdrDt": rec.stdrDt,
            "store_count": int(counts.get(rec.indsSclsCd, 0)),
            "status": status,
            "license_codes": list(rule.license_codes),
            "license_names": [license_name(c) for c in rule.license_codes],
            "uptae": list(rule.uptae) if rule.uptae else None,
            "license_records": records,
            "rule": origin,
            "note": rule.note,
        })
    out = pd.DataFrame(rows).sort_values("indsSclsCd", kind="stable")

    missing = set(stores["indsSclsCd"]) - set(out["indsSclsCd"])
    if missing:
        sys.exit(f"[중단] 매장 데이터에 있으나 공식 분류표에 없는 소분류: {sorted(missing)}")

    out.to_parquet(config.PROCESSED_DIR / "industry_taxonomy.parquet", index=False)
    print(f"저장: industry_taxonomy.parquet — 대 {out.indsLclsCd.nunique()} / 중 {out.indsMclsCd.nunique()} / "
          f"소 {len(out)} (분류표 기준일 {sorted(out.stdrDt.unique())})")
    summary = out.groupby("status").agg(scls=("indsSclsCd", "size"), stores=("store_count", "sum"))
    print(summary.to_string())
    summary.to_csv(config.TABLES_DIR / "industry_coverage_summary.csv")


if __name__ == "__main__":
    main()
