"""데이터 원천·매장 상세(기본정보 / 매장 운영이력 / 주변 상권 분석 / Google 고객평가 연결)."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.services import data_store, food_map, franchise, google_places, improvement_report, nearby_analysis, sales_benchmark, store_profile, taxonomy

router = APIRouter(prefix="/api", tags=["stores"])


def _not_found(bizes_id: str) -> HTTPException:
    return HTTPException(status_code=404, detail=f"매장 '{bizes_id}' 를 찾을 수 없습니다. 매장 목록에서 다시 선택하세요.")


@router.get("/sources")
def data_sources() -> dict:
    """데이터 공급원 등록부 — API·필드·갱신주기·좌표계·이용조건·검증 상태·기준일."""
    try:
        return taxonomy.sources()
    except data_store.DataNotReady as e:
        raise HTTPException(status_code=503, detail=str(e))


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


@router.get("/stores/{bizes_id}/sales-benchmark")
def store_sales_benchmark(bizes_id: str) -> dict:
    """동네 같은 업종의 점포당 월평균 추정매출·증감·매출 구성(서울시 추정매출, 개별 매장 매출 아님)."""
    try:
        return sales_benchmark.benchmark(bizes_id)
    except store_profile.StoreNotFound:
        raise _not_found(bizes_id)
    except data_store.DataNotReady as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/stores/{bizes_id}/peer-stores")
def store_peer_stores(bizes_id: str) -> dict:
    """동네 매출 비교의 비교 단위(상권·행정동) 안 같은 업종 매장 id 와 단위 경계 — 지도에서 '어느 매장들과 비교한 숫자인지' 강조하는 데 쓴다."""
    try:
        return sales_benchmark.peer_stores(bizes_id)
    except store_profile.StoreNotFound:
        raise _not_found(bizes_id)
    except data_store.DataNotReady as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/stores/{bizes_id}/improvement-report")
def store_improvement_report(bizes_id: str) -> dict:
    """상권 운영 점검 — 규칙 + 같은 유형·비슷한 수요 구조의 비교 상권으로 만든 관측·해석·확인 항목(외부 AI 미사용)."""
    try:
        return improvement_report.report(bizes_id)
    except store_profile.StoreNotFound:
        raise _not_found(bizes_id)
    except data_store.DataNotReady as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/stores/{bizes_id}/franchise")
def store_franchise(bizes_id: str) -> dict:
    """프랜차이즈 참고 정보 — 상호·업종으로 연결한 브랜드의 전국 평균 매출·가맹점 증감, 서울 업종 평균(공정위)."""
    try:
        return franchise.franchise(bizes_id)
    except store_profile.StoreNotFound:
        raise _not_found(bizes_id)
    except data_store.DataNotReady as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/stores/{bizes_id}/anchors")
def store_anchors(bizes_id: str) -> dict:
    """앵커 브랜드(스타벅스·다이소)까지 직선거리와 도보권(250m) 여부."""
    try:
        res = food_map.store_anchor(bizes_id)
    except data_store.DataNotReady as e:
        raise HTTPException(status_code=503, detail=str(e))
    if res is None:
        raise _not_found(bizes_id)
    return res


@router.get("/google-usage")
def google_usage() -> dict:
    """Google 호출 사용량과 무료 한도 상한(오늘·이번 달)."""
    return google_places.usage_summary()


@router.post("/stores/{bizes_id}/google-place/view")
def reserve_google_view(bizes_id: str) -> dict:
    """UI Kit 컴포넌트 표시 허락(일·월 상한 안에서만). allowed=false 면 브라우저는 컴포넌트를 만들지 않는다."""
    try:
        return google_places.reserve_ui_kit_view(bizes_id)
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
