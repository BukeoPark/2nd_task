"""위치·매장 검색 — 역명·상권·행정동·주소·매장명."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.services import data_store, search

router = APIRouter(prefix="/api", tags=["search"])


@router.get("/search")
def search_places(q: str = Query(..., description="역명·상권명·행정동·주소·매장명(2자 이상)"),
                  limit: int = Query(20, ge=1, le=50)) -> dict:
    """찾은 위치와 매장 — 선택하면 지도가 그 위치로 가고 관련 정보로 이어진다."""
    try:
        return search.search(q, limit)
    except data_store.DataNotReady as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/search/stores")
def search_stores(q: str = Query(..., description="매장 이름(2자 이상)"), limit: int = Query(search.MAP_STORE_LIMIT, ge=1, le=500)) -> dict:
    """이름에 검색어가 들어간 외식 매장 전부 — 지도에 한꺼번에 올려 보이는 용도(예: '본죽' 모든 지점)."""
    try:
        return search.stores_by_name(q, limit)
    except data_store.DataNotReady as e:
        raise HTTPException(status_code=503, detail=str(e))
