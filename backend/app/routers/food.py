"""외식(요식업·카페) 지도 — 배율별 버블과 매장 점."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.services import area_character, area_overview, data_store, food_map, heatmap

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
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except data_store.DataNotReady as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/units/{level}/{code}/stores")
def food_unit_stores(
    level: str, code: str,
    svc: str | None = None, scls: str | None = None,
    limit: int = Query(50, gt=0, le=200),
    offset: int = Query(0, ge=0, description="이어 받기 시작 위치(응답의 next_offset)"),
    sort: str = Query("distance", description="distance(버블 중심에서 가까운 순)|name(상호 가나다순)"),
) -> dict:
    """버블 하나에 속한 매장 목록 — 버블 점포 수와 같은 기준(경계 안 매장). offset 으로 이어 받는다."""
    try:
        return food_map.stores_in_unit(level, code, svc, scls, limit, offset, sort)
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


@router.get("/compare")
def food_compare(
    level: str = Query(..., description="gu|dong|trdar — 같은 단위끼리만 비교"),
    codes: str = Query(..., description="단위 코드 쉼표 구분, 최대 4곳"),
    svc: str | None = None, scls: str | None = None,
) -> dict:
    """입지 비교 — 단위 몇 곳의 매출·점포·개폐업·수요 기반·앵커·임대 지표를 나란히(종합 점수 없음)."""
    try:
        return food_map.compare(level, [c for c in codes.split(",") if c], svc, scls)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except KeyError as e:
        raise HTTPException(status_code=404, detail=f"단위를 찾을 수 없습니다: {e}")
    except data_store.DataNotReady as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/units/{level}/{code}/overview")
def food_unit_overview(level: str, code: str, svc: str | None = None, scls: str | None = None) -> dict:
    """행정동·상권 종합분석 보조 자료 — 분기 시계열·시간대별 소비·유동인구·행정동과 겹치는 상권(상권은 상권 자체 표로 계산)."""
    try:
        return area_overview.overview(level, code, svc, scls)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except KeyError:
        raise HTTPException(status_code=404, detail=f"단위를 찾을 수 없습니다: {level}/{code}")
    except data_store.DataNotReady as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/units/{level}/{code}/character")
def food_unit_character(level: str, code: str, svc: str | None = None, scls: str | None = None) -> dict:
    """상권 유형 및 입지 특성 — 교통·배후 수요·앵커/상업·경쟁 4개 영역과 참고용 규칙 분류(경계 기준, 종합점수 없음)."""
    try:
        return area_character.character(level, code, svc, scls)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except KeyError:
        raise HTTPException(status_code=404, detail=f"단위를 찾을 수 없습니다: {level}/{code}")
    except data_store.DataNotReady as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/heat")
def food_heat(metric: str = Query("flpop", description=f"{'|'.join(heatmap.METRICS)} — 지도 히트맵에 쓸 인구 지표(상권 단위 점)")) -> dict:
    try:
        return heatmap.heat(metric)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except data_store.DataNotReady as e:
        raise HTTPException(status_code=503, detail=str(e))
