"""앵커 브랜드(스세권/다세권) 거리·밀집도 연산.

입력
----
targets : 관심 지점들(격자 중심 또는 점포 좌표). 최소 경도(lon)/위도(lat) 컬럼.
anchors_by_brand : {브랜드명: 매장 좌표 DataFrame(lon, lat)} 형태.

출력
----
targets 를 복사한 DataFrame 에 브랜드별 지표 컬럼을 붙여 반환한다.
    {brand}_nearest_m      : 가장 가까운 매장까지의 거리(m). 매장이 없으면 NaN.
    {brand}_cnt_{radius}m  : 반경 radius m 이내 매장 수.
    {brand}_zone           : 최근접 거리 <= walk_threshold_m 이면 True("스세권"/"다세권").

거리는 하버사인(구면) 거리로 계산한다. 서울 자치구 범위(수 km)에서는
투영 좌표 유클리드 거리와의 차이가 1% 미만이라 별도 투영 없이 사용한다.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from sklearn.neighbors import BallTree

# 실행: 프로젝트 루트에서  .venv/bin/python -m pipelines.transform.anchor_metrics

# 지구 평균 반지름(m). IUGG 평균 반지름.
_EARTH_RADIUS_M = 6_371_008.8


def haversine_m(
    lon1: np.ndarray | float,
    lat1: np.ndarray | float,
    lon2: np.ndarray | float,
    lat2: np.ndarray | float,
) -> np.ndarray:
    """두 지점(경위도, degree) 사이의 하버사인 거리(m). 브로드캐스팅 지원."""
    lon1, lat1, lon2, lat2 = (np.radians(np.asarray(v, dtype="float64"))
                              for v in (lon1, lat1, lon2, lat2))
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = np.sin(dlat / 2.0) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2.0) ** 2
    return 2.0 * _EARTH_RADIUS_M * np.arcsin(np.sqrt(a))


@dataclass(frozen=True)
class AnchorMetricConfig:
    density_radii_m: tuple[int, ...] = (250, 500, 1000)
    walk_threshold_m: int = 250


def _validate_lonlat(df: pd.DataFrame, name: str, lon_col: str, lat_col: str) -> None:
    missing = {lon_col, lat_col} - set(df.columns)
    if missing:
        raise KeyError(f"{name}: 필요한 좌표 컬럼 없음 {sorted(missing)}")
    coords = df[[lon_col, lat_col]].to_numpy("float64")
    if len(coords) and not np.isfinite(coords).all():
        raise ValueError(f"{name}: 좌표에 NaN/inf 포함")
    if len(coords):
        lon, lat = coords[:, 0], coords[:, 1]
        if (lon < -180).any() or (lon > 180).any() or (lat < -90).any() or (lat > 90).any():
            raise ValueError(f"{name}: 경위도 범위를 벗어난 값 (lon/lat 순서 확인)")


def _radians_latlon(df: pd.DataFrame, lon_col: str, lat_col: str) -> np.ndarray:
    # BallTree(haversine)는 [lat, lon] 순서의 라디안 입력을 요구한다.
    return np.radians(df[[lat_col, lon_col]].to_numpy("float64"))


def compute_anchor_metrics(
    targets: pd.DataFrame,
    anchors_by_brand: dict[str, pd.DataFrame],
    config: AnchorMetricConfig | None = None,
    *,
    lon_col: str = "lon",
    lat_col: str = "lat",
) -> pd.DataFrame:
    cfg = config or AnchorMetricConfig()
    _validate_lonlat(targets, "targets", lon_col, lat_col)

    out = targets.copy()
    n = len(out)
    tgt_rad = _radians_latlon(out, lon_col, lat_col) if n else np.empty((0, 2))

    for brand, anchors in anchors_by_brand.items():
        nearest_col = f"{brand}_nearest_m"
        cnt_cols = {r: f"{brand}_cnt_{r}m" for r in cfg.density_radii_m}
        zone_col = f"{brand}_zone"

        if anchors is None or len(anchors) == 0:
            out[nearest_col] = np.nan
            for c in cnt_cols.values():
                out[c] = 0
            out[zone_col] = False
            continue

        _validate_lonlat(anchors, f"anchors[{brand}]", lon_col, lat_col)
        tree = BallTree(_radians_latlon(anchors, lon_col, lat_col), metric="haversine")

        if n == 0:
            for c in [nearest_col, *cnt_cols.values(), zone_col]:
                out[c] = pd.Series(dtype="float64" if c == nearest_col else "int64")
            out[zone_col] = out[zone_col].astype(bool)
            continue

        dist_rad, _ = tree.query(tgt_rad, k=1)
        nearest_m = dist_rad[:, 0] * _EARTH_RADIUS_M
        out[nearest_col] = nearest_m
        out[zone_col] = nearest_m <= cfg.walk_threshold_m

        for r, col in cnt_cols.items():
            out[col] = tree.query_radius(
                tgt_rad, r=r / _EARTH_RADIUS_M, count_only=True
            ).astype("int64")

    return out


if __name__ == "__main__":  # 합성 데이터 스모크 테스트
    # 기준점: 영등포구청역 부근
    base_lon, base_lat = 126.8963, 37.5264
    tgts = pd.DataFrame({"id": [1, 2, 3], "lon": [base_lon, base_lon + 0.02, base_lon],
                         "lat": [base_lat, base_lat, base_lat + 0.02]})
    anc = {
        "starbucks": pd.DataFrame({"lon": [base_lon + 0.0005, base_lon + 0.03],
                                   "lat": [base_lat + 0.0005, base_lat]}),
        "daiso": pd.DataFrame(columns=["lon", "lat"]),
    }
    res = compute_anchor_metrics(tgts, anc, AnchorMetricConfig(density_radii_m=(300, 1000)))
    with pd.option_context("display.width", 120):
        print(res.to_string(index=False))

    # ~65m 떨어진 매장 하나 → 1번 지점은 스세권
    assert res.loc[0, "starbucks_nearest_m"] < 100
    assert bool(res.loc[0, "starbucks_zone"]) is True
    assert res.loc[0, "starbucks_cnt_300m"] == 1
    # 2번 지점(약 1.7km 동쪽)은 스세권 아님, 1km 내 매장 1개(동쪽 매장)
    assert bool(res.loc[1, "starbucks_zone"]) is False
    # 매장 없는 브랜드
    assert res["daiso_nearest_m"].isna().all()
    assert (res["daiso_cnt_1000m"] == 0).all()
    assert (~res["daiso_zone"]).all()
    print("\nOK: anchor_metrics smoke test passed")
