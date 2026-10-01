"""서울시 상권 영역(골목·발달·전통시장·관광특구) 경계 → 파일럿 상권 목록 + 매장별 소속 상권.

실행: .venv/bin/python -m pipelines.transform.build_trdar_areas
입력: data/external/seoul_trdar_area/trdar_area.shp (서울 열린데이터광장 OA-15560 '서울시 상권분석서비스(영역-상권)',
      2026-10-01 내려받음, EPSG:5181, UTF-8), data/processed/stores.parquet
출력: data/processed/trdar_areas.parquet   파일럿 구 상권 1행 (코드·이름·유형·면적·중심 lon/lat)
      data/processed/trdar_areas.geojson   같은 상권의 경계(WGS84)
      data/processed/store_trdar.parquet   매장별 소속 상권(없으면 행 없음)
      outputs/tables/store_trdar_log.csv   배정 건수·겹침 처리 건수

배정 규칙: 매장 좌표가 상권 경계 안에 있으면 그 상권. 여러 상권에 겹치면 관광특구를 마지막 순위로 두고
면적이 가장 작은(가장 구체적인) 상권을 고른다. 어느 상권에도 없으면 배정하지 않는다(화면은 행정동으로 대체).
"""
from __future__ import annotations

import json

import pandas as pd
import shapefile
from pyproj import Transformer
from shapely.geometry import Point, mapping, shape
from shapely.ops import transform as shp_transform
from shapely.strtree import STRtree

from pipelines.common import config

SHP = config.EXTERNAL_DIR / "seoul_trdar_area" / "trdar_area.shp"
SRC_CRS = "EPSG:5181"
LOW_PRIORITY_TYPES = {"관광특구"}


def main() -> None:
    to_wgs = Transformer.from_crs(SRC_CRS, config.CRS_WGS84, always_xy=True).transform
    sf = shapefile.Reader(str(SHP), encoding="utf-8")
    rows, geoms = [], []
    for sr in sf.iterShapeRecords():
        rec = sr.record.as_dict()
        if rec["SIGNGU_CD"] not in config.PILOT_SIGUNGU:
            continue
        geom = shp_transform(to_wgs, shape(sr.shape.__geo_interface__))
        if not geom.is_valid:
            geom = geom.buffer(0)
        c = geom.representative_point()
        rows.append({"trdar_cd": rec["TRDAR_CD"], "trdar_nm": rec["TRDAR_CD_N"], "trdar_type": rec["TRDAR_SE_1"],
                     "sigungu_cd": rec["SIGNGU_CD"], "adongCd": rec["ADSTRD_CD"], "area_m2": float(rec["RELM_AR"]),
                     "lon": round(c.x, 7), "lat": round(c.y, 7)})
        geoms.append(geom)
    areas = pd.DataFrame(rows)
    areas.to_parquet(config.PROCESSED_DIR / "trdar_areas.parquet", index=False)
    fc = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "geometry": mapping(g), "properties": {k: r[k] for k in ("trdar_cd", "trdar_nm", "trdar_type")}}
        for g, r in zip(geoms, rows)]}
    (config.PROCESSED_DIR / "trdar_areas.geojson").write_text(json.dumps(fc, ensure_ascii=False), encoding="utf-8")

    stores = pd.read_parquet(config.PROCESSED_DIR / "stores.parquet")
    tree = STRtree(geoms)
    priority = [(r["trdar_type"] in LOW_PRIORITY_TYPES, r["area_m2"]) for r in rows]
    out, overlaps = [], 0
    for s in stores.itertuples():
        hits = [int(i) for i in tree.query(Point(s.lon, s.lat), predicate="within")]
        if not hits:
            continue
        overlaps += len(hits) > 1
        best = min(hits, key=lambda i: priority[i])
        out.append({"bizesId": s.bizesId, "trdar_cd": rows[best]["trdar_cd"], "trdar_nm": rows[best]["trdar_nm"],
                    "trdar_type": rows[best]["trdar_type"]})
    assigned = pd.DataFrame(out)
    assigned.to_parquet(config.PROCESSED_DIR / "store_trdar.parquet", index=False)

    log = pd.DataFrame([
        ("파일럿 구 상권 수", len(areas)),
        ("상권에 배정된 매장", len(assigned)),
        ("어느 상권에도 속하지 않은 매장(행정동으로 대체)", len(stores) - len(assigned)),
        ("두 개 이상 상권에 겹친 매장(관광특구 후순위·작은 상권 우선)", overlaps),
    ], columns=["기준", "건수"])
    log.to_csv(config.TABLES_DIR / "store_trdar_log.csv", index=False)
    print(f"저장: trdar_areas.parquet/.geojson {len(areas)}개 상권 — {areas.trdar_type.value_counts().to_dict()}")
    print(log.to_string(index=False))


if __name__ == "__main__":
    main()
