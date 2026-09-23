"""파일럿 자치구(양천구·영등포구)의 경계와 분석용 격자를 생성한다.

실행
----
프로젝트 루트에서  .venv/bin/python -m pipelines.transform.build_regions [--inspect]

입력
----
1순위 — data/external/seoul_admin_dong.geojson (참조자료, 수정하지 않음)
    서울시 행정동 경계 폴리곤(EPSG:4326). properties 에 자치구 식별 필드 필요
    (코드: 'sigungu_cd' 류 앞 5자리, 또는 이름: 'sggnm' 류). 실제 필드명은
    --inspect 로 확인 후 --sigungu-field / --name-field 로 지정.
2순위(fallback) — 위 파일이 없으면 data/processed/stores.parquet(수집된 상가업소
    좌표)의 시군구별 convex hull + 150m 버퍼로 경계를 근사한다. 실제 행정동
    경계가 아니라 "점 분포의 외곽선"이라 경계 인근은 부정확할 수 있음 —
    regions.geojson 의 properties.boundary_source 로 어느 방식인지 표시한다.

출력 (data/processed/)
--------------------
regions.geojson      : 대상 지역 FeatureCollection (properties.boundary_source 로 출처 구분).
grid_100m.parquet    : 100m 격자 (grid_id, lon, lat, x_5179, y_5179).
grid_250m.parquet    : 250m 격자.

재현성: 동일 입력에 대해 항상 동일 결과. 격자는 대상 폴리곤 합집합의
UTM-K(EPSG:5179) 경계상자를 원점 기준으로 스냅해서 생성한다.
"""
from __future__ import annotations

import argparse
import json

import pandas as pd
from pyproj import Transformer
from shapely.geometry import MultiPoint, box, mapping, shape
from shapely.ops import transform as shp_transform
from shapely.prepared import prep

from pipelines.common import config

EXTERNAL_BOUNDARY = config.EXTERNAL_DIR / "seoul_admin_dong.geojson"
STORES_PARQUET = config.PROCESSED_DIR / "stores.parquet"
POINT_HULL_BUFFER_M = 150  # convex hull fallback 시 외곽 여유 버퍼

_to_metric = Transformer.from_crs(config.CRS_WGS84, config.CRS_METRIC, always_xy=True).transform
_to_wgs = Transformer.from_crs(config.CRS_METRIC, config.CRS_WGS84, always_xy=True).transform


def _load_official_features() -> list[dict]:
    with EXTERNAL_BOUNDARY.open(encoding="utf-8") as f:
        gj = json.load(f)
    return gj["features"]


def _select_pilot(features: list[dict], sigungu_field: str | None, name_field: str | None) -> list[dict]:
    names = set(config.PILOT_SIGUNGU.values())
    codes = set(config.PILOT_SIGUNGU)
    picked = []
    for ft in features:
        props = ft.get("properties", {})
        hit = False
        if sigungu_field and sigungu_field in props:
            hit = str(props[sigungu_field])[:5] in codes
        if not hit and name_field and name_field in props:
            hit = any(nm in str(props[name_field]) for nm in names)
        if hit:
            picked.append(ft)
    if not picked:
        raise SystemExit("대상 자치구 feature를 찾지 못했습니다. --inspect 로 속성 필드를 확인하세요.")
    return picked


def _regions_from_official(sigungu_field: str | None, name_field: str | None) -> tuple[dict, list]:
    picked = _select_pilot(_load_official_features(), sigungu_field, name_field)
    print(f"[official] 경계 출처: {EXTERNAL_BOUNDARY.relative_to(config.ROOT)} — 대상 feature {len(picked)}개")

    fc = {"type": "FeatureCollection", "features": []}
    polys_metric = []
    for i, ft in enumerate(picked):
        geom = shape(ft["geometry"])
        polys_metric.append(shp_transform(_to_metric, geom))
        props = {**ft.get("properties", {}), "region_id": i, "boundary_source": "official"}
        fc["features"].append({**ft, "properties": props})
    return fc, polys_metric


def _regions_from_points() -> tuple[dict, list]:
    if not STORES_PARQUET.exists():
        raise SystemExit(
            f"경계 파일도({EXTERNAL_BOUNDARY.relative_to(config.ROOT)}) 없고, "
            f"fallback 에 쓸 {STORES_PARQUET.relative_to(config.ROOT)} 도 없습니다.\n"
            "먼저 pipelines.collect.collect_sbiz_stores 와 pipelines.transform.clean_stores 를 실행하세요."
        )
    stores = pd.read_parquet(STORES_PARQUET)
    print(
        f"[fallback] 공식 경계 파일이 없어 상가업소 좌표의 convex hull(+{POINT_HULL_BUFFER_M}m 버퍼)로 "
        "근사 경계를 생성합니다. (정확한 행정동 경계 아님)"
    )

    fc = {"type": "FeatureCollection", "features": []}
    polys_metric = []
    for i, (sigungu_cd, sigungu_nm) in enumerate(config.PILOT_SIGUNGU.items()):
        sub = stores.loc[stores["signguCd"] == sigungu_cd]
        if sub.empty:
            print(f"  [경고] {sigungu_nm}({sigungu_cd}) 상가업소 없음 — 건너뜀")
            continue
        pts_metric = [
            _to_metric(lon, lat) for lon, lat in zip(sub["lon"], sub["lat"], strict=True)
        ]
        hull = MultiPoint(pts_metric).convex_hull.buffer(POINT_HULL_BUFFER_M)
        polys_metric.append(hull)
        hull_wgs = shp_transform(_to_wgs, hull)
        fc["features"].append(
            {
                "type": "Feature",
                "geometry": mapping(hull_wgs),
                "properties": {
                    "region_id": i,
                    "sigungu_cd": sigungu_cd,
                    "sigungu_nm": sigungu_nm,
                    "n_points": len(sub),
                    "boundary_source": "convex_hull_of_stores_approx",
                },
            }
        )
        print(f"  {sigungu_nm}({sigungu_cd}): 상가업소 {len(sub):,}건으로 근사 경계 생성")
    return fc, polys_metric


def _make_grid(polys_metric: list, size_m: int) -> pd.DataFrame:
    union = polys_metric[0]
    for p in polys_metric[1:]:
        union = union.union(p)
    prepared = prep(union)
    minx, miny, maxx, maxy = union.bounds
    # 원점 기준 스냅 → 격자 크기를 바꿔도 셀 경계가 결정적으로 정렬됨
    x0 = (minx // size_m) * size_m
    y0 = (miny // size_m) * size_m

    rows = []
    x = x0
    while x < maxx:
        y = y0
        while y < maxy:
            cell = box(x, y, x + size_m, y + size_m)
            if prepared.intersects(cell):
                cx, cy = x + size_m / 2, y + size_m / 2
                lon, lat = _to_wgs(cx, cy)
                rows.append(
                    {
                        "grid_id": f"{size_m}_{int(x)}_{int(y)}",
                        "lon": round(lon, 7),
                        "lat": round(lat, 7),
                        "x_5179": cx,
                        "y_5179": cy,
                    }
                )
            y += size_m
        x += size_m
    return pd.DataFrame(rows).sort_values("grid_id").reset_index(drop=True)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--inspect", action="store_true", help="공식 경계 파일 첫 feature 의 properties 키를 출력하고 종료")
    ap.add_argument("--sigungu-field", default=None, help="자치구 코드 속성명 (앞 5자리 비교)")
    ap.add_argument("--name-field", default="sggnm", help="자치구 이름 속성명")
    args = ap.parse_args()

    if args.inspect:
        if not EXTERNAL_BOUNDARY.exists():
            raise SystemExit(f"경계 파일이 없습니다: {EXTERNAL_BOUNDARY.relative_to(config.ROOT)}")
        print(json.dumps(_load_official_features()[0]["properties"], ensure_ascii=False, indent=2))
        return

    if EXTERNAL_BOUNDARY.exists():
        fc, polys_metric = _regions_from_official(args.sigungu_field, args.name_field)
    else:
        fc, polys_metric = _regions_from_points()

    out_geojson = config.PROCESSED_DIR / "regions.geojson"
    with out_geojson.open("w", encoding="utf-8") as f:
        json.dump(fc, f, ensure_ascii=False)
    print(f"저장: {out_geojson.relative_to(config.ROOT)}")

    for size_m in config.GRID_SIZES_M:
        grid = _make_grid(polys_metric, size_m)
        out = config.PROCESSED_DIR / f"grid_{size_m}m.parquet"
        grid.to_parquet(out, index=False)
        print(f"저장: {out.relative_to(config.ROOT)}  ({len(grid):,} cells)")


if __name__ == "__main__":
    main()
