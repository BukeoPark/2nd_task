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
            key="ftc_brand_frcs_stats",
            title="공정거래위원회 가맹정보 — 브랜드별 가맹점 현황(전국)",
            provider="공정거래위원회 (공공데이터포털 15110241)",
            endpoint="https://apis.data.go.kr/1130000/FftcBrandFrcsStatsService/getBrandFrcsStats",
            docs_url="https://www.data.go.kr/data/15110241/openapi.do",
            fields=["yr", "indutyLclasNm", "indutyMlsfcNm", "corpNm", "brandNm", "frcsCnt", "newFrcsRgsCnt",
                    "ctrtEndCnt", "ctrtCncltnCnt", "nmChgCnt", "avrgSlsAmt", "arUnitAvrgSlsAmt"],
            update_cycle="연 1회(정보공개서 기준)",
            crs="-",
            terms="공공데이터포털 이용허락범위",
            verification="api_call_ok",
            status="connected",
            notes="2017~2025년 76,846행 수집(2026-10-01). 전국 브랜드 평균이라 상권 값이 아니다. 평균매출 단위(천원 추정)와 "
                  "yr 이 실적 연도인지 공시 연도인지는 공식 문서로 재확인 필요. 2025년 평균매출 공개 브랜드는 5,557/11,724.",
        ),
        DataSource(
            key="ftc_area_induty_avr",
            title="공정거래위원회 가맹정보 — 지역별 업종별 평균매출(시도)",
            provider="공정거래위원회 (공공데이터포털 15110302)",
            endpoint="https://apis.data.go.kr/1130000/FftcAreaIndutyAvrStatsService/getAreaIndutyAvr{Out|Srvc|Whrt}Stats",
            docs_url="https://www.data.go.kr/data/15110302/openapi.do",
            fields=["yr", "indutyMlsfcNm", "areaNm", "frcsCnt(실제로는 평균매출금액)", "arUnitAvrgSlsAmt", "crrncyUnitCdNm"],
            update_cycle="연 1회",
            crs="-",
            terms="공공데이터포털 이용허락범위",
            verification="api_call_ok",
            status="connected",
            notes="2017~2025년, 외식·서비스·도소매, 지역은 시도 단위(서울 전체가 한 값). 단위 천원(응답에 명시). "
                  "'frcsCnt' 칸은 이름과 달리 평균매출금액으로 판단(2024 서울 한식 471,736천원, 면적당 매출과 대조).",
        ),
        DataSource(
            key="seoul_trdar_hinterland",
            title="서울시 상권분석서비스 — 직장인구·상주인구·집객시설(상권·행정동)",
            provider="서울 열린데이터광장",
            endpoint=f"{SEOUL_OPENAPI_BASE}/{{KEY}}/json/{{VwsmTrdarWrcPopltnQq|VwsmTrdarRepopQq|VwsmTrdarFcltyQq|"
                     "VwsmAdstrdWrcPopltnW|VwsmAdstrdRepopW|VwsmAdstrdFcltyW}/{start}/{end}/",
            docs_url="https://data.seoul.go.kr/",
            fields=["STDR_YYQU_CD", "TRDAR_CD|ADSTRD_CD", "TOT_WRC_POPLTN_CO", "FML_WRC_POPLTN_CO", "AGRDE_*_WRC_POPLTN_CO",
                    "TOT_REPOP_CO", "FML_REPOP_CO", "AGRDE_*_REPOP_CO", "TOT_HSHLD_CO", "APT_HSHLD_CO",
                    "VIATR_FCLTY_CO", "SUBWAY_STATN_CO", "BUS_STTN_CO", "UNIV_CO", "*_CO(시설 종류별)"],
            update_cycle="분기",
            crs="-(상권·행정동 코드로 연결)",
            terms="서울 열린데이터광장 이용약관(출처표시)",
            verification="api_call_ok",
            status="connected",
            notes="2026-10-08 실호출. 상권 3종·행정동 집객시설은 분기 파라미터를 무시하고 2021Q1~최신 전 분기를 돌려줘 전량 수집 후 "
                  "최신 분기만 쓴다. 인구는 상권(행정동) 영역 안 인구이며 배후지(주변)는 포함하지 않는다. "
                  "소득소비(VwsmTrdarIncmCnsmpQq·VwsmAdstrdIncmCnsmpW)는 ERROR-500 — 서울시 공지상 소득 컬럼 공급 중단(2020)·"
                  "2026-05-13 삭제, 소비-상권 갱신 중단이라 연결하지 않는다.",
        ),
        DataSource(
            key="molit_bus_stop_location",
            title="국토교통부 전국 버스정류장 위치정보(15067528)",
            provider="국토교통부 (공공데이터포털, odcloud)",
            endpoint="https://api.odcloud.kr/api/15067528/v1/uddi:<버전별>",
            docs_url="https://infuser.odcloud.kr/oas/docs?namespace=15067528/v1",
            fields=["정류장번호", "모바일단축번호", "정류장명", "위도", "경도", "도시코드", "도시명", "관리도시명", "정보수집일"],
            update_cycle="연 1회(기준일별 버전: 2023-10-16·2024-10-28·2025-10-31)",
            crs="EPSG:4326(WGS84 위경도, 원천이 문자열로 제공)",
            terms="이용허락범위 제한 없음(공공데이터포털)",
            verification="api_call_ok",
            status="connected",
            notes="2026-10-14 실호출. 서울특별시 16,980행(관리도시명 서울BIS 12,956·경기BIS 4,024). 도시명이 서울이어도 좌표는 서울 밖인 행이 11%(예: 성남 판교). "
                  "같은 정류장이 서울BIS(SEB)·경기BIS(GGB)·인천BIS(ICB)에 접두만 다르게 중복 실려 있어 번호·이름·50m 로 중복을 묶는다. "
                  "모바일단축번호는 BIS 별로 매겨져 서울 안에서도 다른 정류장과 겹칠 수 있다.",
        ),
        DataSource(
            key="molit_bus_stop_usage",
            title="국토교통부 시군구별 정류장평균이용량(15162142)",
            provider="국토교통부 (공공데이터포털, odcloud)",
            endpoint="https://api.odcloud.kr/api/15162142/v1/uddi:<버전>",
            docs_url="https://infuser.odcloud.kr/oas/docs?namespace=15162142/v1",
            fields=["년도", "시도코드(법정동)", "시군구코드(법정동)", "시군구명", "정류장ID", "정류장명", "모바일ID", "평균승차이용량", "평균하차이용량", "평균환승이용량"],
            update_cycle="연 1회(2025년 자료, 2026-08-27 등록, 차기 2027-07-31 예정)",
            crs="-(좌표 없음 — 위치정보와 모바일 번호로만 연결)",
            terms="이용허락범위 제한 없음(공공데이터포털)",
            verification="api_call_ok",
            status="connected",
            notes="2026-10-14 실호출, 서울(시도코드 11) 15,046행. 행 단위는 정류장이고 시군구는 소속 구(원천 설명: 정류장별 일일 평균 승하차 인원). "
                  "승차·하차·환승의 정의는 원천에 없다 — 환승은 파일럿에서 승차를 넘는 행이 0건이라 승차에 포함된 값일 가능성이 있어 더하지 않는다. "
                  "모바일ID 가 비어 있는 행은 모바일ID 미확인 정류장이며 같은 모바일ID·정류장ID 에 이름이 다른 별칭 행이 여럿 나온다. "
                  "실시간 유동인구·방문객 수가 아니라 정류장 이용 인원(연 평균)이다.",
        ),
        DataSource(
            key="tago_bus_stop",
            title="국토교통부 TAGO 버스정류소정보(BusSttnInfoInqireService)",
            provider="국토교통부 (공공데이터포털)",
            endpoint="https://apis.data.go.kr/1613000/BusSttnInfoInqireService",
            docs_url="https://www.data.go.kr/data/15098534/openapi.do",
            fields=["nodeid", "nodenm", "nodeno", "gpslati", "gpslong", "citycode"],
            update_cycle="수시",
            crs="EPSG:4326",
            terms="이용허락범위 제한 없음(공공데이터포털)",
            verification="api_call_ok",
            status="connected",
            notes="2026-10-14 실호출. 도시 목록(138곳)에 서울이 없어 cityCode 11 로는 0건 — 서울 안 정류소는 좌표 근접 조회(getCrdntPrxmtSttnList)를 파일럿 격자로 훑어 받는다. "
                  "위치정보(15067528)와의 대조(코드·좌표·이름) 용도이며 서울BIS 정류소는 담겨 있지 않다.",
        ),
        DataSource(
            key="seoul_subway_master",
            title="서울 열린데이터광장 지하철 역사 마스터(subwayStationMaster)",
            provider="서울시 (서울 열린데이터광장)",
            endpoint="http://openapi.seoul.go.kr:8088/<키>/json/subwayStationMaster/<시작>/<끝>/",
            docs_url="https://data.seoul.go.kr/",
            fields=["BLDN_ID", "BLDN_NM", "ROUTE", "LAT", "LOT"],
            update_cycle="수시",
            crs="EPSG:4326(위도 LAT·경도 LOT, 문자열)",
            terms="서울 열린데이터광장 이용약관",
            verification="api_call_ok",
            status="connected",
            notes="2026-10-15 실호출 784행(역사×노선, 수도권 전철 — 서울 1~9호선·경부선·경인선·인천 1·2호선·공항철도 등). 운영기관 열은 없다. 출입구 좌표는 없다.",
        ),
        DataSource(
            key="seoul_subway_card",
            title="서울 열린데이터광장 지하철 호선별 역별 시간대별 승하차(CardSubwayTime)",
            provider="서울시 (서울 열린데이터광장)",
            endpoint="http://openapi.seoul.go.kr:8088/<키>/json/CardSubwayTime/<시작>/<끝>/<YYYYMM>/",
            docs_url="https://data.seoul.go.kr/",
            fields=["USE_MM", "SBWY_ROUT_LN_NM", "STTN", "HR_<시>_GET_ON_NOPE", "HR_<시>_GET_OFF_NOPE", "JOB_YMD"],
            update_cycle="월(다음 달 초 등록) — 2026-10-15 기준 2026-09 까지",
            crs="-(좌표 없음 — 역명+노선으로 마스터와 연결)",
            terms="서울 열린데이터광장 이용약관",
            verification="api_call_ok",
            status="connected",
            notes="2026-10-15 실호출. 월·노선·역별 24시간 승차/하차 인원(교통카드). 환승 칸이 없고 승차·하차만 있다. 2026-03·2026-07 은 같은 행을 두 번 담아 완전히 같은 중복 행을 하나로 줄인다. "
                  "역명 괄호 부연('대림(구로구청)')은 정규화로 맞춘다.",
        ),
        DataSource(
            key="kakao_subway_local",
            title="카카오 로컬 API — 지하철역(SW8)·지하철출구",
            provider="카카오 (Kakao Developers)",
            endpoint="https://dapi.kakao.com/v2/local/search/{category,keyword}.json",
            docs_url="https://developers.kakao.com/docs/latest/ko/local/dev-guide",
            fields=["place_name", "category_name", "x", "y", "id"],
            update_cycle="상시",
            crs="EPSG:4326(x=경도, y=위도)",
            terms="이용 조건 미확인 — 카카오 공식 계정(devtalk, 2026-08-20)은 로컬 API 결과를 '어떠한 형태로든 저장하여 사용할 수 없고' 실시간 호출·일시 표시만 허용한다고 답했다. 출입구 좌표 225건을 저장해 API·지도로 내보내므로 공개 배포 전 차단 또는 공식 출입구 자료로 교체 대상(대체 후보: 서울교통공사·국가철도공단 출입구 공공데이터 — 필드 확인 필요, 없으면 공식 역 중심점 기준만)",
            verification="api_call_ok",
            status="blocked",
            notes="[사용 중단 2026-10-17] 출입구 좌표를 API·지도·분석에 쓰지 않는다(rail_access.EXIT_COORDINATES_ENABLED=False). 원본·가공본은 로컬에 남아 있다(보고서의 잔존 위치 참고). 2026-10-15 실호출. 역 좌표는 공식 마스터 대조용(같은 역 144쌍 좌표 차이 중앙값 약 19m). 출구는 '<역> N번출구' 키워드를 번호별로 검색해 받는다 — '<역> 출구' 한 번 검색은 결과가 2~3건이라 대부분 누락됐다. 출구가 누락될 수 있다.",
        ),
        DataSource(
            key="rail_highspeed_and_korail",
            title="고속철도·광역철도 역별 승하차(KTX 15108119 · SRT 15131754 · 한국철도공사 광역철도 15100373)",
            provider="한국철도공사·(주)에스알 (공공데이터포털, odcloud)",
            endpoint="https://api.odcloud.kr/api/<네임스페이스>/v1/uddi:<버전별>",
            docs_url="https://infuser.odcloud.kr/oas/docs?namespace=15108119/v1",
            fields=["정차역", "운행년월", "상행/하행_승차·하차인원수", "역명", "집계년도", "집계월", "승차인원", "하차인원", "승차", "하차"],
            update_cycle="KTX 2023-12까지(월별) · SRT 2025-09까지(월별) · 광역철도 2021 연 단위",
            crs="-(좌표 없음 — 역명만)",
            terms="이용허락범위 제한 없음(공공데이터포털)",
            verification="api_call_ok",
            status="connected",
            notes="2026-10-15 실호출(승인된 키). 고속철도는 rail_type=high_speed 로 별도 관리하고 도시철도 이용량에 더하지 않는다. 광역철도 자료는 2021 연 단위로 오래돼 서울 카드 자료와 합치지 않고 수집만 한다. "
                  "대구교통공사 역별일별시간별 승하차(15002503, 2026-08까지 월별)도 승인됐지만 파일럿 밖이라 메타만 기록.",
        ),
        DataSource(
            key="rail_official_station_xlsx",
            title="전국 도시철도 역사정보(표준데이터 15013205) — 전체_도시철도역사정보_20260630.xlsx",
            provider="국가철도공단 (공공데이터포털 표준데이터, 레일포털) — 사람이 내려받은 파일",
            endpoint="data/raw/전체_도시철도역사정보_20260630.xlsx (파일, API 아님)",
            docs_url="https://www.data.go.kr/data/15013205/standard.do",
            fields=["역번호", "역사명", "노선번호", "노선명", "환승역구분", "환승노선번호", "환승노선명", "역위도", "역경도", "운영기관명", "역사도로명주소", "데이터기준일자"],
            update_cycle="연간(파일 이름 2026-06-30, 행별 데이터기준일자는 2022-04~2026-06 로 제각각)",
            crs="EPSG:4326(위도·경도 숫자)",
            terms="공공데이터포털 이용허락범위 제한 없음(표준데이터)",
            verification="file_checked",
            status="connected",
            notes="2026-10-15 확인. 1,099행(역사×노선)·15열·시트 '표준데이터 역사'. 같은 역의 이중 등재 2행(주안·이수)은 최신 기준일만 남긴다. 기준일은 문자열·날짜·정수(20240812)·'1900-01-00'·결측이 섞여 있다. "
                  "출구 좌표는 없다. 운영기관·노선 표기가 제각각이라 표준화(build_rail_national)한다. 공식 좌표 우선순위 1위.",
        ),
        DataSource(
            key="seoul_metro_daily",
            title="서울교통공사 역별 일별 시간대별 승하차인원 정보(15048032)",
            provider="서울교통공사 (공공데이터포털, odcloud)",
            endpoint="https://api.odcloud.kr/api/15048032/v1/uddi:<버전별>",
            docs_url="https://infuser.odcloud.kr/oas/docs?namespace=15048032/v1",
            fields=["수송일자", "호선", "역번호", "역명", "승하차구분", "06시이전", "06-07시간대", "…", "23-24시간대", "24시이후"],
            update_cycle="연 1회 — 최신 버전 2024(2024-01-01~2024-12-31, 199,424행). 서울 카드 월별 자료(2025-01~)와 기간이 다르다",
            crs="-(좌표 없음 — 노선·역명으로 공식 표에 연결, 역번호는 공식 표와 번호 체계가 달라 쓰지 않음)",
            terms="이용허락범위 제한 없음(공공데이터포털)",
            verification="api_call_ok",
            status="connected",
            notes="2026-10-15 실호출. 일×역×승·하차 행. 서울교통공사(1~8호선)만 담긴다. 역번호가 공식 표와 92개만 맞고 그중 이름이 일치하는 것은 68개뿐이라 번호로 연결하지 않는다.",
        ),
        DataSource(
            key="busan_metro_hourly",
            title="부산교통공사 시간대별 승하차인원(3057229)",
            provider="부산교통공사 (공공데이터포털, odcloud)",
            endpoint="https://api.odcloud.kr/api/3057229/v1/uddi:<버전별>",
            docs_url="https://infuser.odcloud.kr/oas/docs?namespace=3057229/v1",
            fields=["년월일", "요일", "구분(승차/하차)", "역번호", "역명", "01시-02시", "…", "24시-01시", "합계"],
            update_cycle="버전별 — 2025(2025-01-01~12-31, 81,760행)·2026(2026-01-01~08-31, 54,432행)",
            crs="-(좌표 없음 — 역번호로 공식 표의 부산교통공사 역에 연결)",
            terms="이용허락범위 제한 없음(공공데이터포털)",
            verification="api_call_ok",
            status="connected",
            notes="2026-10-15 실호출. 일×역×승·하차 행, 호선 열이 없다. 역번호가 공식 표와 112개 모두 일치(이름 일치 검증 포함). 호선별 게이트가 없는 환승역은 한 호선 행에 합쳐 담길 수 있어 역사 단위로 집계한다.",
        ),
        DataSource(
            key="incheon_metro_daily",
            title="인천교통공사 역별일별 이용인원현황(15004329)",
            provider="인천교통공사 (공공데이터포털, odcloud)",
            endpoint="https://api.odcloud.kr/api/15004329/v1/uddi:<버전별>",
            docs_url="https://infuser.odcloud.kr/oas/docs?namespace=15004329/v1",
            fields=["통행일자", "호선", "역명", "승차인원", "하차인원", "이용인원"],
            update_cycle="연 1회, 최근 12개월 롤링 — 2024-07~2025-06(24,829행)·2025-07~2026-06(25,915행) 두 버전을 받아 이어 쓴다",
            crs="-(좌표 없음 — 호선·역명으로 공식 표의 인천교통공사 역에 연결)",
            terms="이용허락범위 제한 없음(공공데이터포털)",
            verification="api_call_ok",
            status="connected",
            notes="2026-10-15 실호출. 일×역 행(승차·하차 열 분리, 이용인원=승차+하차). 인천 1·2호선과 7호선 인천·부천 구간(까치울~석남)을 담는다. 7호선 까치울·상동은 서울 카드에도 일부 게이트 값이 잡혀 있어 운영기관 자체 자료를 대표로 쓴다.",
        ),
        DataSource(
            key="seoul_cultural_space",
            title="서울 열린데이터광장 서울시 문화공간 정보(culturalSpaceInfo)",
            provider="서울시 (서울 열린데이터광장)",
            endpoint="http://openapi.seoul.go.kr:8088/<키>/json/culturalSpaceInfo/<시작>/<끝>/",
            docs_url="https://data.seoul.go.kr/",
            fields=["FAC_NAME", "SUBJCODE", "ADDR", "GNGU", "X_COORD", "Y_COORD", "HOMEPAGE", "OPENHOUR", "SEAT_CNT"],
            update_cycle="상시",
            crs="EPSG:4326 — 단, X_COORD 가 위도·Y_COORD 가 경도로 뒤바뀌어 제공됨(값 범위로 확인해 바로잡는다)",
            terms="서울 열린데이터광장 이용약관",
            verification="api_call_ok",
            status="connected",
            notes="2026-10-17 실호출 1,096건(공연장 180·미술관 224·박물관 166·도서관 167·문화원 28·문화예술회관 20·기타 215·분류 없음 포함). 시설 이용객 수·관람객 수는 없다.",
        ),
        DataSource(
            key="seoul_college_info",
            title="서울 열린데이터광장 서울시 대학교 기본정보(SebcCollegeInfoKor)",
            provider="서울시 (서울 열린데이터광장)",
            endpoint="http://openapi.seoul.go.kr:8088/<키>/json/SebcCollegeInfoKor/<시작>/<끝>/",
            docs_url="https://data.seoul.go.kr/",
            fields=["MAIN_KEY", "YEAR", "CATE1_NAME", "NAME_KOR", "BRANCH", "STATE", "TYPE", "ADD_KOR", "H_KOR_GU", "H_KOR_DONG"],
            update_cycle="자료 연도 2013(오래됨)",
            crs="-(좌표 없음, 주소만)",
            terms="서울 열린데이터광장 이용약관",
            verification="api_call_ok",
            status="connected",
            notes="2026-10-17 실호출 64건. 좌표가 없어 목록 대조용으로만 쓰고 좌표를 만들지 않는다. 양천·영등포 구에는 등재된 대학이 없다.",
        ),
        DataSource(
            key="kakao_facility_local",
            title="카카오 로컬 API — 대형마트(MT1)·문화시설(CT1)·학교(SC4)·종합병원/백화점/복합쇼핑몰/아울렛 키워드",
            provider="카카오 (Kakao Developers)",
            endpoint="https://dapi.kakao.com/v2/local/search/{category,keyword}.json",
            docs_url="https://developers.kakao.com/docs/latest/ko/local/dev-guide",
            fields=["place_name", "category_name", "address_name", "road_address_name", "x", "y", "id"],
            update_cycle="상시",
            crs="EPSG:4326(x=경도, y=위도)",
            terms="이용 조건 미확인(저장 불가 취지의 카카오 공식 답변 있음) — 서비스 분석·공개 API·지도에는 쓰지 않는다. 진단 비교용으로만 로컬에 두고 원본·가공본은 git 제외",
            verification="api_call_ok",
            status="connected",
            notes="2026-10-17 실호출. 승인된 공식 좌표 자료가 없는 백화점·쇼핑몰·아울렛·대형마트·영화관·대학교의 유일한 좌표 출처. 검색은 구역(0.02°)별이고 45건을 넘으면 4등분(깊이 3)한다 — 키워드 '백화점'·'아울렛'은 잡음이 많아 한도에 닿은 구역이 9곳 있다. 방문객 수 없음.",
        ),
        DataSource(
            key="naver_local_anchor",
            title="NAVER 지역 검색(API HUB local) — 앵커 브랜드(스타벅스·다이소) 매장 보강",
            provider="네이버 (NAVER API HUB)",
            endpoint="NAVER 지역 검색 API (pipelines/collect/collect_naver_local.py)",
            docs_url="https://api.ncloud-docs.com/docs/naver-api-hub-overview",
            fields=["title", "roadAddress", "address", "mapx", "mapy"],
            update_cycle="수집 시점",
            crs="네이버 좌표(정수 경위도×1e7 형식)",
            terms="이용 조건 미확인 — 공식 약관 원문을 이번에 열람하지 못했다(2차 보도: 검색 결과의 복사·저장·캐싱·제3자 제공 금지, 신규 신청 중단·기존 이용자 유예 2027-06-30). 앵커 82곳 중 22곳이 이 출처라 공개 배포 전 차단 또는 교체 대상(대체: 소상공인 상가정보 상호 매칭 60곳 + 브랜드 공식 매장 목록 확인)",
            verification="api_call_ok",
            status="blocked",
            notes="[사용 중단 2026-10-17] merge_official_anchors 가 anchor_stores 에서 이 출처 행 22곳을 지우고 상가정보+LOCALDATA 인허가 교차 검증으로 대체했다. collect_naver_local·merge_naver_anchors 는 --allow-unconfirmed-terms 없이는 실행되지 않는다. 원본은 data/raw/naver_local 에 남아 있다.",
        ),
        DataSource(
            key="localdata_license_anchor",
            title="서울시 구별 인허가(LOCALDATA) — 다이소 의료기기판매(임대)업 사업장 (앵커 공식 보강)",
            provider="서울특별시 (서울 열린데이터광장, 공공누리 제1유형)",
            endpoint="data/processed/licenses.parquet (build_licenses 산출물)",
            docs_url="https://data.seoul.go.kr/",
            fields=["사업장명(\"(주)아성다이소 OO점\")", "영업상태", "TM 좌표→WGS84", "인허가일자", "수집일"],
            update_cycle="구별 갱신일 상이",
            crs="EPSG:5174(TM) → WGS84",
            terms="공공누리 제1유형(출처표시·상업적 이용·변경 가능)",
            verification="api_call_ok",
            status="connected",
            notes="다이소는 의료기기판매(임대)업으로 인허가를 받아 사업장명이 남는다. 인허가상 '영업'이며 실제 영업과 다를 수 있다. 좌표 없는 2곳(영등포구청점·목동깨비시장점)은 주소로 좌표를 만들지 않고 누락으로 기록한다(outputs/tables/anchor_official_crosscheck.csv). 입점 매장이라 인허가가 없는 5곳은 복원하지 않는다.",
        ),
        DataSource(
            key="seoul_tdata_subway_entrance",
            title="서울교통빅데이터플랫폼 — 지하철 출입구 정보 및 주변정류장 정보(tnSubwayEntrc.csv)",
            provider="서울특별시 버스정보시스템(BIS)·미래첨단교통과 (t-data.seoul.go.kr 데이터 10045)",
            endpoint="https://t-data.seoul.go.kr/dataprovide/download.do?id=11056",
            docs_url="https://t-data.seoul.go.kr/dataprovide/trafficdataviewfile.do?data_id=10045",
            fields=["지하철역ID", "출입구번호", "정류장ID", "주변건물", "출구와정류장간이동거리", "지하철역X좌표", "지하철역Y좌표"],
            update_cycle="일별(수정일 2026-10-17)",
            crs="EPSG:5181(GRS80 중부원점 TM) — 5174 로는 공식 버스정류장과 맞지 않고 5181 로 맞음",
            terms="저작자 표시(BY): 이용·변경·2차적 저작물 작성을 포함한 자유이용 허락(페이지 표기). 이용 조건은 문제 없으나 자료가 출입구 좌표가 아니다",
            verification="api_call_ok",
            status="rejected",
            notes="2026-10-17 내려받아 검증(18,461행·역 624·출입구 번호 22종). '지하철역X/Y좌표'는 출입구마다 하나가 아니라 연결된 버스정류장마다 하나다 — 같은 출입구에 좌표가 중앙값 3개, 버스정류장ID 하나당 좌표 하나가 97%, 공식 버스정류장과 중앙값 20m. 역 이름·기준일 칼럼도 없어 출입구 좌표로 쓸 수 없고 쓰지 않았다. 원본 data/raw/rail/seoul_entrc_20261017/.",
        ),
        DataSource(
            key="juso_coordinate_api",
            title="행정안전부 주소기반산업지원서비스 — 도로명주소 좌표제공 API(검색 API)",
            provider="행정안전부 (business.juso.go.kr)",
            endpoint="https://business.juso.go.kr/addrlink/addrCoordApi.do",
            docs_url="https://business.juso.go.kr/jst/jstCoordApiSearch",
            fields=["admCd", "rnMgtSn", "bdMgtSn", "udrtYn", "buldMnnm", "buldSlno", "entX", "entY", "bdNm"],
            update_cycle="상시",
            crs="미확인(문서에 좌표계 명시 없음 — 호출 후 확인 필요)",
            terms="미확인 — 승인키(신청·가입 필요)가 없어 호출하지 않았다. 이용약관(juso.go.kr/Terms)은 사이트 이용 일반 조항뿐이고 API 응답의 저장·재배포 조건이 없다. 신청 화면의 개별 약관은 열람하지 못했다. 좌표 없는 공식 시설에 쓰지 않는다",
            verification="docs_only",
            status="pending",
            notes="응답 좌표 entX/entY 는 이름상 건물 출입구 좌표로 보이나(미확인) 요청에 행정구역코드·도로명코드·건물번호가 필요하다. 쓰게 되면 건물 중심점과 출입구를 구분해 coordinate_source 에 남기고 승인·약관 확인 뒤에만 쓴다.",
        ),
        DataSource(
            key="kakao_maps_sdk",
            title="카카오맵 JavaScript SDK — 지도 표시",
            provider="카카오 (Kakao Developers)",
            endpoint="https://dapi.kakao.com/v2/maps/sdk.js",
            docs_url="https://apis.map.kakao.com/web/",
            fields=["지도 타일", "CustomOverlay·Circle·Polygon 그리기"],
            update_cycle="상시",
            crs="WGS84",
            terms="지도 표시(SDK 사용)는 앱 키·도메인 등록 범위의 정상 사용으로 보며, 로컬 API 검색 결과의 저장과는 별개다. 서비스 약관·운영정책의 로고·저작권 표기 유지 조항은 이번에 원문으로 확인하지 못함(미확인) — 공개 배포 전 확인",
            verification="docs_only",
            status="connected",
            notes="우리 데이터(공식 시설·역·반경 원)를 SDK 오버레이로 그리는 것이고 카카오 장소 데이터를 지도에 올리지 않는다.",
        ),
        DataSource(
            key="mois_large_retail",
            title="행정안전부 생활 대규모점포 조회서비스(전국 대형마트·백화점·쇼핑센터·복합쇼핑몰 인허가)",
            provider="행정안전부 (공공데이터포털 15154948)",
            endpoint="https://apis.data.go.kr/1741000/large_scale_retail_stores/info",
            docs_url="https://www.data.go.kr/data/15154948/openapi.do",
            fields=["MNG_NO", "BPLC_NM", "BZSTAT_SE_NM(등록 구분)", "STOR_SE_NM(준대규모점포 여부)", "SALS_STTS_NM", "CRD_INFO_X/Y(TM)", "ROAD_NM_ADDR", "LCPMT_YMD", "CLSBIZ_YMD", "LAST_MDFCN_PNT"],
            update_cycle="일간",
            crs="EPSG:5174(TM) → WGS84 변환",
            terms="이용허락범위 제한 없음(공공데이터포털 표기)",
            verification="api_call_ok",
            status="active",
            notes="2026-10-17 호출 성공(전국 4,190건, 1,000건×5쪽, 기본 경로가 아니라 /info). 좌표가 없는 행이 있어 좌표를 만들지 않고 분석에서 뺀다. 준대규모점포(SSM)는 제외, 등록 구분(BZSTAT_SE_NM)을 그대로 따라 종류를 정한다. 원본은 data/raw/facilities/mois_retail_*.json.",
        ),
        DataSource(
            key="mois_movie_theaters",
            title="행정안전부 문화_영화상영관 조회서비스(전국 영화상영관 인허가, 상영관 단위)",
            provider="행정안전부 (공공데이터포털 15154848)",
            endpoint="https://apis.data.go.kr/1741000/movie_theaters/info",
            docs_url="https://www.data.go.kr/data/15154848/openapi.do",
            fields=["MNG_NO(전국 유일하지 않음 — OPN_ATMY_GRP_CD 와 합쳐야 유일)", "BPLC_NM", "SALS_STTS_NM", "CRD_INFO_X/Y(TM)", "ROAD_NM_ADDR", "LCPMT_YMD", "CLSBIZ_YMD", "LAST_MDFCN_PNT"],
            update_cycle="일간",
            crs="EPSG:5174(TM) → WGS84 변환",
            terms="이용허락범위 제한 없음(공공데이터포털 표기)",
            verification="api_call_ok",
            status="active",
            notes="2026-10-17 호출 성공(전국 5,244 상영관, 영업 3,509). 상영관 단위 행이라 같은 좌표·이름 앞부분의 상영관을 영화관 한 곳으로 묶는다. 좌표 없는 315건은 좌표를 만들지 않고 분석에서 뺀다. 원본은 data/raw/facilities/mois_movie_*.json.",
        ),
        DataSource(
            key="hira_hospitals",
            title="건강보험심사평가원 병원정보서비스(상급종합·종합병원)",
            provider="건강보험심사평가원 (공공데이터포털 15001698)",
            endpoint="https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList",
            docs_url="https://www.data.go.kr/data/15001698/openapi.do",
            fields=["yadmNm", "clCd/clCdNm(종별: 01 상급종합·11 종합병원)", "addr", "XPos/YPos(WGS84)", "sidoCdNm", "sgguCdNm", "estbDd"],
            update_cycle="실시간(요양기관 신고 기준)",
            crs="WGS84",
            terms="공공저작물 출처표시 제1유형 — 출처 표시 필수",
            verification="api_call_ok",
            status="active",
            notes="2026-10-17 호출 성공(전국 상급종합 47·종합병원 338). 영업·폐업 상태는 없다(신고 기준 현황). 상급종합 구분은 이 자료에서만 얻는다. 원본은 data/raw/facilities/hira_hospitals_*.json.",
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
