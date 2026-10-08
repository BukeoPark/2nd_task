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
