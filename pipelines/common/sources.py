"""데이터 공급원 등록부 — 원천별 API·필드·갱신주기·좌표계·이용조건·검증상태를 한 곳에서 관리한다.

새 원천을 붙일 때는 여기에 항목을 추가하고, 업종 연결은 industry_crosswalk.py 에서 한다.
backend 는 pipelines 를 import 하지 않으므로 transform/export_source_registry.py 가 data/processed/data_sources.json 으로 내보낸다.

verification 값
  - "api_call_ok"  : 실제 호출로 응답을 받아 필드를 확인함
  - "docs_only"    : 공식 문서로만 확인(인증키가 없어 호출 못 함)
"""
from __future__ import annotations

from dataclasses import dataclass, field

SEOUL_OPENAPI_BASE = "http://openapi.seoul.go.kr:8088"

# 서울 구별 인허가(LOCALDATA) 서비스명 접미사 — 2026-09-23 실호출로 확인
# (LOCALDATA_072404_YD 28,293건 / LOCALDATA_072404_YC 17,982건 응답).
SEOUL_GU_SUFFIX: dict[str, str] = {"11470": "YC", "11560": "YD"}

# 구별 모범음식점 지정 현황 서비스명 — 실호출 확인(영등포 79건, 양천 63건).
SEOUL_MODEL_RESTAURANT_SERVICE: dict[str, str] = {
    "11470": "YcModelRestaurantDesignate",
    "11560": "YdpModelRestaurantDesignate",
}

# 인허가 좌표(X, Y) 좌표계. 2026-09-23 상호+도로명주소가 같은 일반음식점-상가업소 5,284쌍 대조:
# EPSG:5174 중앙값 2.4m(p90 13.3m) / EPSG:2097 254.8m / EPSG:5181 313.4m → 5174 채택.
LOCALDATA_CRS = "EPSG:5174"


@dataclass(frozen=True)
class LicenseService:
    """서울 구별 인허가 서비스 하나(= LOCALDATA 업종 코드 하나)."""

    code: str
    name: str
    # localdata.go.kr 코드표가 접속 불가(2026-09-23)라, 코드별 업종명은 실제 응답의 상호·업태 표본으로 판별했다.
    # 코드 탐색 범위: LOCALDATA_{AA}{BB}{CC}_YD 에서 AA 01~12, BB 01~60, CC 01~30 (ERROR-500 = 서비스 없음).
    evidence: str

    def service_name(self, gu_suffix: str) -> str:
        return f"LOCALDATA_{self.code}_{gu_suffix}"


LICENSE_SERVICES: dict[str, LicenseService] = {
    s.code: s
    for s in [
        LicenseService("072404", "일반음식점", "업태 한식·분식·일식 등"),
        LicenseService("072405", "휴게음식점", "업태 다방·과자점·기타 휴게음식점"),
        LicenseService("072218", "제과점영업", "응답 업태 '제과점영업' + 영등포구 포털 OA-18420 샘플 서비스명 LOCALDATA_072218_YD"),
        LicenseService("072219", "즉석판매제조가공업", "응답 업태 '즉석판매제조가공업'"),
        LicenseService("072102", "집단급식소", "업태 '산업체'"),
        LicenseService("072301", "단란주점영업", "업태 '단란주점'"),
        LicenseService("072302", "유흥주점영업", "업태 '고고(디스코)클럽' 등"),
        LicenseService("031103", "숙박업", "상호 'Q모텔' 등 모텔·호텔류"),
        LicenseService("031101", "숙박 관련 인허가(세부 명칭 미확인)", "상호 호텔·스테이류, 업태 필드 비어 있음"),
        LicenseService("031104", "외국인관광 도시민박업", "상호 '~스테이', 호수 포함"),
        LicenseService("031107", "야영장업", "상호 '한강여름캠프' 등"),
        LicenseService("010101", "병원", "업태 병원·요양병원·치과병원"),
        LicenseService("010102", "의원", "업태 의원·치과의원·한의원"),
        LicenseService("010110", "안마시술소·안마원", "업태 안마시술소·안마원"),
        LicenseService("010106", "약국", "상호 '~약국'"),
        LicenseService("010201", "안경업", "상호 '~안경원'"),
        LicenseService("010203", "의료기기판매(임대)업", "상호 의료기기 업체"),
        LicenseService("020301", "동물병원", "상호 '~동물병원'"),
        LicenseService("114302", "담배소매업", "상호 편의점·마트"),
        LicenseService("051801", "미용업", "업태 일반미용업·네일아트업 등"),
        LicenseService("051901", "이용업", "업태 일반이용업"),
        LicenseService("062001", "세탁업", "업태 일반세탁업"),
        LicenseService("114401", "목욕장업", "업태 공동탕업·찜질시설"),
        LicenseService("104201", "체력단련장업", "상호 PT·짐·피트니스"),
        LicenseService("104101", "체육도장업", "업태 태권도·레슬링 등"),
        LicenseService("103701", "종합체육시설업(추정)", "상호 호텔 피트니스·스포츠클럽"),
        LicenseService("103501", "수영장업", "상호 수영·수련관"),
        LicenseService("103201", "당구장업", "상호 '~당구장'"),
        LicenseService("103101", "골프연습장업", "상호 '~골프'"),
        LicenseService("030504", "인터넷컴퓨터게임시설제공업(PC방, 소규모 구분)", "상호 '~PC방'"),
        LicenseService("030505", "인터넷컴퓨터게임시설제공업(PC방)", "상호 '~PC'"),
        LicenseService("030506", "일반게임제공업", "상호 성인게임장·오락실"),
        LicenseService("030507", "청소년게임제공업", "상호 인형뽑기·게임랜드"),
        LicenseService("030901", "노래연습장업", "상호 '~노래연습장'"),
        LicenseService("031001", "비디오물감상실업", "상호 DVD·영화감상실"),
        LicenseService("115002", "직업소개소", "상호 '~직업소개소'"),
        LicenseService("031201", "여행업(1)", "상호 여행사"),
        LicenseService("031202", "여행업(2)", "상호 여행사"),
        LicenseService("031203", "여행업(3)", "상호 여행사"),
    ]
}


# LOCALDATA 외 원천의 '인허가·등록' 코드. 업종 대응표와 licenses.parquet 의 license_code 로 같이 쓴다.
OTHER_LICENSE_CODES: dict[str, str] = {"NEIS": "학원·교습소 등록(NEIS)"}


def license_name(code: str) -> str:
    return LICENSE_SERVICES[code].name if code in LICENSE_SERVICES else OTHER_LICENSE_CODES[code]


@dataclass(frozen=True)
class DataSource:
    key: str
    title: str
    provider: str
    endpoint: str
    docs_url: str
    fields: list[str]
    update_cycle: str
    crs: str
    terms: str
    verification: str
    status: str  # connected | pending(키·신청 필요)
    notes: str = ""
    extra: dict = field(default_factory=dict)


SOURCES: dict[str, DataSource] = {
    s.key: s
    for s in [
        DataSource(
            key="sbiz_store",
            title="소상공인시장진흥공단 상가(상권)정보 — 행정동 단위 상가업소",
            provider="소상공인시장진흥공단 (공공데이터포털)",
            endpoint="https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInDong",
            docs_url="https://www.data.go.kr/data/15012005/openapi.do",
            fields=["bizesId", "bizesNm", "brchNm", "indsLclsCd~indsSclsNm", "rdnmAdr", "lnoAdr", "lon", "lat"],
            update_cycle="분기(응답 stdrYm 기준)",
            crs="EPSG:4326",
            terms="공공데이터포털 이용허락범위(출처표시)",
            verification="api_call_ok",
            status="connected",
            notes="현재 영업 중으로 파악된 매장 목록. 개업·폐업일은 제공하지 않는다.",
        ),
        DataSource(
            key="sbiz_upjong",
            title="소상공인시장진흥공단 상권정보 업종 대·중·소분류 코드",
            provider="소상공인시장진흥공단 (공공데이터포털)",
            endpoint="https://apis.data.go.kr/B553077/api/open/sdsc2/{large,middle,small}UpjongList",
            docs_url="https://www.data.go.kr/data/15012005/openapi.do",
            fields=["indsLclsCd", "indsLclsNm", "indsMclsCd", "indsMclsNm", "indsSclsCd", "indsSclsNm", "stdrDt"],
            update_cycle="분류 개편 시(응답 stdrDt 기준)",
            crs="-",
            terms="공공데이터포털 이용허락범위(출처표시)",
            verification="api_call_ok",
            status="connected",
        ),
        DataSource(
            key="seoul_localdata",
            title="서울시 자치구별 인허가 정보(LOCALDATA)",
            provider="서울 열린데이터광장 (각 자치구 제공)",
            endpoint=f"{SEOUL_OPENAPI_BASE}/{{KEY}}/json/LOCALDATA_{{업종코드}}_{{구}}/{{start}}/{{end}}/",
            docs_url="https://data.seoul.go.kr/",
            fields=["MGTNO", "BPLCNM", "APVPERMYMD", "TRDSTATEGBN", "TRDSTATENM", "DTLSTATENM",
                    "DCBYMD", "RDNWHLADDR", "SITEWHLADDR", "UPTAENM", "X", "Y", "UPDATEDT"],
            update_cycle="매일(자치구 제공, 데이터셋 안내 기준)",
            crs=LOCALDATA_CRS,
            terms="서울 열린데이터광장 이용약관(공공누리 출처표시)",
            verification="api_call_ok",
            status="connected",
            notes="폐업 매장도 이력으로 남아 있어 개업·폐업 추이를 계산할 수 있다. "
                  "업종 코드명은 공식 코드표(localdata.go.kr) 접속 불가로 실제 응답 표본으로 판별했다.",
            extra={"services": {c: {"name": s.name, "evidence": s.evidence} for c, s in LICENSE_SERVICES.items()},
                   "gu_suffix": SEOUL_GU_SUFFIX},
        ),
        DataSource(
            key="seoul_model_restaurant",
            title="서울시 자치구별 모범음식점 지정 현황",
            provider="서울 열린데이터광장 (각 자치구 제공)",
            endpoint=f"{SEOUL_OPENAPI_BASE}/{{KEY}}/json/{{Ydp|Yc}}ModelRestaurantDesignate/{{start}}/{{end}}/",
            docs_url="https://data.seoul.go.kr/",
            fields=["PERM_NT_NO", "UPSO_NM", "ASGN_YMD", "SITE_ADDR_RD", "SNT_UPTAE_NM"],
            update_cycle="자치구 갱신 시",
            crs="-",
            terms="서울 열린데이터광장 이용약관(공공누리 출처표시)",
            verification="api_call_ok",
            status="connected",
            notes="현재 지정 현황 목록이다. 지정 취소 이력·유효기간 필드는 없으므로, 인허가가 영업 중인 경우에만 '지정'으로 표시한다.",
            extra={"services": SEOUL_MODEL_RESTAURANT_SERVICE},
        ),
        DataSource(
            key="neis_academy",
            title="NEIS 학원교습소정보",
            provider="교육부 나이스 교육정보 개방 포털",
            endpoint="https://open.neis.go.kr/hub/acaInsTiInfo",
            docs_url="https://open.neis.go.kr/",
            fields=["ACA_ASNUM", "ACA_NM", "ACA_INSTI_SC_NM", "ESTBL_YMD", "REG_YMD", "REG_STTUS_NM", "FA_RDNMA", "FA_RDNDA"],
            update_cycle="수시(포털 안내 기준)",
            crs="주소만 제공(좌표 없음) — 반경 분석 불가, 매장 연결은 주소·상호로만",
            terms="나이스 교육정보 개방 포털 이용약관",
            verification="api_call_ok",
            status="pending",
            notes="키 없이 호출하면 5건만 반환(2026-09-23 실호출: 영등포구 867건·양천구 2,111건 중 5건). "
                  "인증키(NEIS_API_KEY) 발급 후 collect_neis_academy 실행 시 연결된다.",
        ),
        DataSource(
            key="google_places_ui_kit",
            title="Google Places UI Kit — 장소 상세(평점·평가 수·리뷰)",
            provider="Google Maps Platform",
            endpoint="Maps JavaScript API + <gmp-place-details> (브라우저)",
            docs_url="https://developers.google.com/maps/documentation/javascript/places-ui-kit/place-details",
            fields=["(컴포넌트가 직접 렌더링 — 우리 서버는 내용을 받거나 저장하지 않음)"],
            update_cycle="조회 시점 실시간",
            crs="-",
            terms="https://cloud.google.com/maps-platform/terms/maps-service-terms (UI Kit은 비Google 지도와 함께 사용 가능)",
            verification="docs_only",
            status="pending",
            notes="브라우저 키(VITE_GOOGLE_MAPS_BROWSER_KEY)가 없어 연동 준비 중.",
        ),
        DataSource(
            key="google_places_text_search",
            title="Google Places API (New) Text Search — 매장↔Google 장소 연결용",
            provider="Google Maps Platform",
            endpoint="POST https://places.googleapis.com/v1/places:searchText",
            docs_url="https://developers.google.com/maps/documentation/places/web-service/text-search",
            fields=["places.id (저장)", "places.displayName·formattedAddress·location (연결 판정에만 일시 사용, 저장 안 함)"],
            update_cycle="요청 시(매장당 최초 1회, Place ID 캐시)",
            crs="EPSG:4326",
            terms="Place ID 는 캐싱 제한 예외(무기한 저장 가능)",
            verification="docs_only",
            status="pending",
            notes="서버 키(GOOGLE_MAPS_SERVER_KEY)가 없어 연동 준비 중. 약관 해석(2026-09-30 결정): Places API 콘텐츠는 "
                  "비Google 지도와 함께 표시하지 않고 서버의 연결 판정에만 일시 사용한다(표시·저장 안 함). 무료 한도 안에서만 호출.",
        ),
    ]
}
