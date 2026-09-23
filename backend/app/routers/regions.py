"""상권/지역 관련 엔드포인트 (파일럿 골격).

실제 응답은 데이터 파이프라인 산출물이 채워지면 연결된다. 지금은 산출물이
없으면 503 으로 "아직 준비 안 됨"을 명확히 알려준다.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.services import data_store
from app.services.dong_trend import list_dong_trend

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


@router.get("/grid")
def grid(size_m: int = 250) -> dict:
    """버블 시각화용 격자 집계 지표."""
    try:
        recs = data_store.records(f"grid_{size_m}m.parquet")
    except data_store.DataNotReady as e:
        raise HTTPException(status_code=503, detail=str(e))
    return {"size_m": size_m, "count": len(recs), "records": recs}


@router.get("/dong-metrics")
def dong_metrics() -> dict:
    """행정동(36개) 단위 매출·점포·인구·상권변화지표 — 지도 코로플레스용."""
    try:
        recs = data_store.records("dong_metrics.parquet")
    except data_store.DataNotReady as e:
        raise HTTPException(status_code=503, detail=str(e))
    return {"count": len(recs), "records": recs}


@router.get("/dong-trend")
def dong_trend() -> dict:
    """행정동별 상권변화지표 분기 이력(2021Q1~) — 매출 트렌드 그래프 대신 실측 추이."""
    try:
        recs = list_dong_trend()
    except data_store.DataNotReady as e:
        raise HTTPException(status_code=503, detail=str(e))
    return {"count": len(recs), "records": recs}


@router.get("/reb-zones")
def reb_zones() -> dict:
    """한국부동산원 R-ONE 임대료·공실률 (파일럿 구 내 상권명 5곳, 좌표 포함)."""
    try:
        recs = data_store.records("reb_zone_metrics.parquet")
    except data_store.DataNotReady as e:
        raise HTTPException(status_code=503, detail=str(e))
    return {"count": len(recs), "records": recs}
