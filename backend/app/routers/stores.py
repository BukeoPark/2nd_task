"""업종 분류·데이터 원천·매장 상세(기본정보 / 매장 운영이력 / 주변 상권 분석 / Google 고객평가 연결)."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.services import data_store, google_places, nearby_analysis, store_profile, taxonomy

router = APIRouter(prefix="/api", tags=["stores"])


def _not_found(bizes_id: str) -> HTTPException:
    return HTTPException(status_code=404, detail=f"매장 '{bizes_id}' 를 찾을 수 없습니다. 매장 목록에서 다시 선택하세요.")


@router.get("/categories/tree")
def category_tree() -> dict:
    """공식 업종 대·중·소분류 전체와 소분류별 데이터 지원 범위(인허가 연결 / 연동 준비 중 / 미연결 / 해당 없음)."""
    try:
        return taxonomy.category_tree()
    except data_store.DataNotReady as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/sources")
def data_sources() -> dict:
    """데이터 공급원 등록부 — API·필드·갱신주기·좌표계·이용조건·검증 상태·기준일."""
    try:
        return taxonomy.sources()
    except data_store.DataNotReady as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/grid-counts")
def grid_counts(
    size_m: int = Query(250, description="격자 크기(100|250)"),
    level: str = Query(..., description="lcls|mcls|scls"),
    code: str = Query(..., description="업종 코드"),
) -> dict:
    """선택한 업종(대·중·소분류)의 격자별 점포수."""
    if size_m not in (100, 250):
        raise HTTPException(status_code=400, detail="size_m 은 100 또는 250 이어야 합니다")
    try:
        sclss = set(taxonomy.codes_under(level, code))
        stores = data_store.load_parquet("stores.parquet")
        index = data_store.load_parquet("store_grid_index.parquet")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except KeyError:
        raise HTTPException(status_code=404, detail=f"업종 코드 '{code}' 가 공식 분류표에 없습니다")
    except data_store.DataNotReady as e:
        raise HTTPException(status_code=503, detail=str(e))
    picked = index.loc[index["bizesId"].isin(stores.loc[stores["indsSclsCd"].isin(sclss), "bizesId"])]
    counts = picked.groupby(f"grid_{size_m}m").size()
    return {"size_m": size_m, "level": level, "code": code, "store_total": int(counts.sum()),
            "counts": {k: int(v) for k, v in counts.items()}}


@router.get("/stores/{bizes_id}")
def store_detail(bizes_id: str) -> dict:
    """매장 기본정보 + 매장 운영이력(인허가 기준 업력·영업 상태·인증/지정, 출처·기준일)."""
    try:
        store = store_profile.get_store(bizes_id)
        return {"store": store_profile.basic_info(store), "operation_history": store_profile.operation_history(store)}
    except store_profile.StoreNotFound:
        raise _not_found(bizes_id)
    except data_store.DataNotReady as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/stores/{bizes_id}/nearby-analysis")
def store_nearby(bizes_id: str, radius_m: float = Query(500, ge=100, le=1000, description="분석 반경(m)")) -> dict:
    """주변 상권 분석 — 같은 업종 인허가의 연도별 개폐업과 관찰기간을 맞춘 폐업 비율."""
    try:
        return nearby_analysis.analyze(bizes_id, radius_m)
    except store_profile.StoreNotFound:
        raise _not_found(bizes_id)
    except data_store.DataNotReady as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/stores/{bizes_id}/google-place")
def store_google_place(bizes_id: str) -> dict:
    """Google 장소 연결(요청한 매장 1곳만, Place ID 만 반환). 평점·리뷰는 브라우저의 Places UI Kit 이 직접 표시한다."""
    try:
        return google_places.link_store(bizes_id)
    except store_profile.StoreNotFound:
        raise _not_found(bizes_id)
    except data_store.DataNotReady as e:
        raise HTTPException(status_code=503, detail=str(e))
