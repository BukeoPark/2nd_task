"""반경 내 매장(경쟁업체) 조회."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.services import competitors, data_store

router = APIRouter(prefix="/api", tags=["competitors"])


@router.get("/competitors")
def list_competitors(
    lon: float = Query(..., description="중심 경도(WGS84)"),
    lat: float = Query(..., description="중심 위도(WGS84)"),
    radius_m: float = Query(500, gt=0, le=5000, description="검색 반경(m)"),
    category_level: str = Query("scls", description="업종 분류 단계: lcls|mcls|scls"),
    category_code: str | None = Query(None, description="업종 코드(대·중·소분류). 생략하면 반경 내 전체"),
    limit: int = Query(10, gt=0, le=100, description="반환할 최대 매장 수"),
) -> dict:
    """반경 내 매장을 거리순으로 반환한다.

    매장별 매출·평점 데이터가 없어 '매출 순위'가 아니라 **거리순**이다. 고객평가 유무로 제외·정렬하지 않는다.
    """
    try:
        return competitors.find_competitors(lon, lat, radius_m, category_level, category_code, limit)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except data_store.DataNotReady as e:
        raise HTTPException(status_code=503, detail=str(e))
