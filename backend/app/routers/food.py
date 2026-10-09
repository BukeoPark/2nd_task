"""외식(요식업·카페) 지도 — 배율별 버블과 매장 점."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.services import data_store, food_map

router = APIRouter(prefix="/api/food", tags=["food"])


@router.get("/categories")
def food_categories() -> dict:
    """서울시 외식 10개 업종과 그 아래 소상공인 세부 업종."""
    try:
        return food_map.categories()
    except data_store.DataNotReady as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/bubbles")
def food_bubbles(
    level: str = Query("dong", description="gu|dong|trdar — 지도 배율에 맞는 묶음 단위"),
    metric: str = Query("stores", description=f"{'|'.join(food_map.METRICS)}"),
    svc: str | None = Query(None, description="서울시 외식 업종 코드(CS100001~). 생략하면 외식 전체"),
    scls: str | None = Query(None, description="소상공인 세부 업종 코드(점포 수·버블 크기만 거름)"),
) -> dict:
    try:
        return food_map.bubbles(level, svc, scls, metric)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except data_store.DataNotReady as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/stores")
def food_stores(
    min_lon: float, min_lat: float, max_lon: float, max_lat: float,
    svc: str | None = None, scls: str | None = None,
    limit: int = Query(400, gt=0, le=1000),
) -> dict:
    """지도 화면 범위 안의 외식 매장(가장 확대했을 때 점으로 표시)."""
    try:
        return food_map.stores_in_bbox(min_lon, min_lat, max_lon, max_lat, svc, scls, limit)
    except data_store.DataNotReady as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/units/{level}/{code}/stores")
def food_unit_stores(
    level: str, code: str,
    svc: str | None = None, scls: str | None = None,
    limit: int = Query(50, gt=0, le=500),
) -> dict:
    """버블 하나에 속한 매장 목록 — 버블 점포 수와 같은 기준(경계 안 매장)."""
    try:
        return food_map.stores_in_unit(level, code, svc, scls, limit)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except KeyError:
        raise HTTPException(status_code=404, detail=f"단위를 찾을 수 없습니다: {level}/{code}")
    except data_store.DataNotReady as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/anchors")
def food_anchors() -> dict:
    """앵커 브랜드(스타벅스·다이소) 매장 위치."""
    try:
        return food_map.anchors()
    except data_store.DataNotReady as e:
        raise HTTPException(status_code=503, detail=str(e))
