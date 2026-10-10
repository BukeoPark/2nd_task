"""상권/지역 관련 엔드포인트 (파일럿 골격).

실제 응답은 데이터 파이프라인 산출물이 채워지면 연결된다. 지금은 산출물이
없으면 503 으로 "아직 준비 안 됨"을 명확히 알려준다.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.services import data_store
from app.services.reb import reb_quarters

router = APIRouter(prefix="/api", tags=["regions"])


@router.get("/status")
def status() -> dict:
    """파이프라인 산출물 준비 현황."""
    return {"processed_files": data_store.available()}


@router.get("/regions")
def list_regions() -> dict:
    """파일럿 자치구의 행정동 목록/경계 (GeoJSON FeatureCollection)."""
    try:
        return data_store.load_json("regions.geojson")
    except data_store.DataNotReady as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/reb-zones")
def reb_zones() -> dict:
    """한국부동산원 R-ONE 임대료·공실률 (파일럿 구 내 상권명 5곳, 좌표 포함)."""
    try:
        recs = data_store.records("reb_zone_metrics.parquet")
    except data_store.DataNotReady as e:
        raise HTTPException(status_code=503, detail=str(e))
    return {"count": len(recs), "records": recs, "quarters": reb_quarters(recs)}
