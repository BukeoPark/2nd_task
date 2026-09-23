"""서울 전체로 받은 상권분석서비스 원본을 파일럿 두 구(36개 행정동)로 추린다.

실행
----
프로젝트 루트에서: .venv/bin/python -m pipelines.transform.filter_seoul_trdar

입력: data/raw/seoul/<dataset_key>_<SERVICE>_<quarter|static>_<날짜>.json (dataset별 최신 파일)
      + data/processed/stores.parquet (파일럿 행정동 코드 목록을 뽑는 기준)
출력: data/processed/seoul_<dataset_key>.parquet (해당 행정동 행만 남김)

이 API 들은 ADSTRD_CD 로 서버 필터링을 지원하지 않아 시 전체를 받아야 했다
(collect_seoul_trdar 참고) — 그래서 이 스크립트가 우리 분석 범위로 줄이는 역할을 한다.
"""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from pipelines.collect.collect_seoul_trdar import DATASETS
from pipelines.common import config

RAW_DIR = config.RAW_DIR / "seoul"
STORES_PATH = config.PROCESSED_DIR / "stores.parquet"


def _pilot_adong_codes() -> set[str]:
    if not STORES_PATH.exists():
        raise SystemExit(f"{STORES_PATH.relative_to(config.ROOT)} 가 없습니다. clean_stores 를 먼저 실행하세요.")
    stores = pd.read_parquet(STORES_PATH, columns=["adongCd"])
    return set(stores["adongCd"].dropna().unique())


def _latest_raw_file(dataset_key: str, service: str) -> Path | None:
    candidates = sorted(RAW_DIR.glob(f"{dataset_key}_{service}_*_*.json"))
    return candidates[-1] if candidates else None


def main() -> None:
    pilot_codes = _pilot_adong_codes()
    print(f"파일럿 행정동 코드 {len(pilot_codes)}개 기준으로 필터링")

    for dataset_key, (service, _needs_quarter, desc) in DATASETS.items():
        path = _latest_raw_file(dataset_key, service)
        if path is None:
            print(f"  [건너뜀] {desc}: 원본 없음 (collect_seoul_trdar 먼저 실행)")
            continue

        with path.open(encoding="utf-8") as f:
            envelope = json.load(f)
        rows = pd.DataFrame(envelope["rows"])

        code_col = "ADSTRD_CD"
        filtered = rows.loc[rows[code_col].isin(pilot_codes)].reset_index(drop=True)

        out_path = config.PROCESSED_DIR / f"seoul_{dataset_key}.parquet"
        filtered.to_parquet(out_path, index=False)
        print(f"  {desc}: 서울 전체 {len(rows):,}건 → 파일럿 {len(filtered):,}건 → 저장 {out_path.relative_to(config.ROOT)}")


if __name__ == "__main__":
    main()
