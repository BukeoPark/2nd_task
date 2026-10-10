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
