"""격자마다 상가업소 밀도(점포수)·주요 업종을 계산해 붙인다.

실행
----
프로젝트 루트에서: .venv/bin/python -m pipelines.transform.compute_store_density

입력: data/processed/stores.parquet, data/processed/grid_{size}m.parquet
출력: 같은 grid_{size}m.parquet 에 `store_count`(셀 내 상가업소 수),
      `top_category`(가장 많은 상권업종대분류명) 컬럼을 추가해 덮어쓴다.
      data/processed/store_grid_index.parquet — 매장별 소속 격자(grid_100m, grid_250m).
      업종(대·중·소분류)을 골랐을 때 backend 가 격자 점포수를 다시 세는 데 쓴다.

셀 배정은 build_regions._make_grid 와 동일한 절대 원점(0,0) 기준
floor(좌표_5179 / size_m) * size_m 스냅 규칙을 그대로 재현해서, 별도 공간
조인 없이 좌표만으로 grid_id 를 계산한다 (build_regions 의 grid_id 포맷과 반드시 일치해야 함).

주의: 이 값은 수집 시점(현재는 2026-09-13 1개 시점) 스냅샷이라 "점포수 변동성"은
아직 계산할 수 없다 — 주기적으로 재수집해 시점별 스냅샷을 쌓아야 증감을 볼 수 있다.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from pyproj import Transformer

from pipelines.common import config

STORES_PATH = config.PROCESSED_DIR / "stores.parquet"
_to_metric = Transformer.from_crs(config.CRS_WGS84, config.CRS_METRIC, always_xy=True).transform


def _cell_ids(size_m: int, mx: np.ndarray, my: np.ndarray) -> pd.Series:
    x0 = (np.floor(mx / size_m) * size_m).astype("int64")
    y0 = (np.floor(my / size_m) * size_m).astype("int64")
    return pd.Series([f"{size_m}_{x}_{y}" for x, y in zip(x0, y0, strict=True)])


def main() -> None:
    if not STORES_PATH.exists():
        raise SystemExit(f"{STORES_PATH.relative_to(config.ROOT)} 가 없습니다. clean_stores 를 먼저 실행하세요.")
    stores = pd.read_parquet(STORES_PATH)
    mx, my = _to_metric(stores["lon"].to_numpy(), stores["lat"].to_numpy())
    index = pd.DataFrame({"bizesId": stores["bizesId"].to_numpy()})
    for size_m in config.GRID_SIZES_M:
        index[f"grid_{size_m}m"] = _cell_ids(size_m, mx, my).to_numpy()
    index.to_parquet(config.PROCESSED_DIR / "store_grid_index.parquet", index=False)
    print(f"저장: store_grid_index.parquet ({len(index):,}건)")

    for size_m in config.GRID_SIZES_M:
        grid_path = config.PROCESSED_DIR / f"grid_{size_m}m.parquet"
        if not grid_path.exists():
            print(f"[건너뜀] {grid_path.relative_to(config.ROOT)} 없음 — build_regions 먼저 실행")
            continue

        tmp = pd.DataFrame({"grid_id": _cell_ids(size_m, mx, my), "category": stores["indsLclsNm"].to_numpy()})
        counts = tmp.groupby("grid_id").size().rename("store_count")
        top_category = (
            tmp.groupby("grid_id")["category"]
            .agg(lambda s: s.value_counts().idxmax())
            .rename("top_category")
        )
        agg = pd.concat([counts, top_category], axis=1).reset_index()

        grid = pd.read_parquet(grid_path).drop(columns=["store_count", "top_category"], errors="ignore")
        merged = grid.merge(agg, on="grid_id", how="left")
        merged["store_count"] = merged["store_count"].fillna(0).astype("int64")
        merged.to_parquet(grid_path, index=False)

        matched = int(merged["store_count"].sum())
        print(
            f"저장: {grid_path.relative_to(config.ROOT)} — "
            f"매장 있는 셀 {int((merged['store_count'] > 0).sum()):,}/{len(merged):,}, "
            f"격자에 매칭된 매장 {matched:,}/{len(stores):,}건 "
            f"(격자 밖 {len(stores) - matched:,}건은 경계 바깥이라 제외됨)"
        )


if __name__ == "__main__":
    main()
