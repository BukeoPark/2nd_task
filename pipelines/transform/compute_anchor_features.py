"""격자에 앵커 브랜드(스세권/다세권) 거리·밀집도 컬럼을 추가한다.

실행
----
프로젝트 루트에서: .venv/bin/python -m pipelines.transform.compute_anchor_features

입력
----
data/processed/grid_{size}m.parquet   (build_regions 산출물, size in config.GRID_SIZES_M)
data/processed/anchor_stores.parquet  (clean_stores 산출물 — bizesNm 매칭 기반 앵커 매장)

출력
----
같은 grid_{size}m.parquet 에 브랜드별 `{brand}_nearest_m` / `{brand}_cnt_{r}m` / `{brand}_zone`
컬럼을 추가해 덮어쓴다 (anchor_metrics.compute_anchor_metrics 사용).

주의: anchor_stores 는 파일럿 두 시군구 내에서 상호명 패턴으로 찾은 매장만 포함한다.
구 경계 바로 바깥의 앵커 매장은 잡히지 않으므로, 경계 인근 격자의 최근접 거리는
실제보다 크게(과소평가) 나올 수 있다 — 정확도가 중요해지면 카카오 로컬 검색 API로
반경 검색을 보강한다.
"""
from __future__ import annotations

import pandas as pd

from pipelines.common import config
from pipelines.transform.anchor_metrics import AnchorMetricConfig, compute_anchor_metrics

ANCHOR_STORES_PATH = config.PROCESSED_DIR / "anchor_stores.parquet"


def main() -> None:
    if not ANCHOR_STORES_PATH.exists():
        raise SystemExit(
            f"{ANCHOR_STORES_PATH.relative_to(config.ROOT)} 가 없습니다. "
            "먼저 pipelines.transform.clean_stores 를 실행하세요."
        )
    anchors = pd.read_parquet(ANCHOR_STORES_PATH)
    anchors_by_brand = {
        brand: anchors.loc[anchors["brand"] == brand, ["lon", "lat"]]
        for brand in config.ANCHOR_BRANDS
    }
    for brand, df in anchors_by_brand.items():
        print(f"앵커 브랜드 {brand}: {len(df)}개 매장")

    for size_m in config.GRID_SIZES_M:
        grid_path = config.PROCESSED_DIR / f"grid_{size_m}m.parquet"
        if not grid_path.exists():
            print(f"[건너뜀] {grid_path.relative_to(config.ROOT)} 없음 — build_regions 먼저 실행")
            continue
        grid = pd.read_parquet(grid_path)
        result = compute_anchor_metrics(grid, anchors_by_brand, AnchorMetricConfig())
        result.to_parquet(grid_path, index=False)
        zone_cols = [f"{b}_zone" for b in config.ANCHOR_BRANDS]
        zone_counts = {c: int(result[c].sum()) for c in zone_cols}
        print(f"저장: {grid_path.relative_to(config.ROOT)} ({len(result):,} cells) — 존 해당 셀 수: {zone_counts}")


if __name__ == "__main__":
    main()
