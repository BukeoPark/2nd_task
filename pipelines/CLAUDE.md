# pipelines/ — 데이터 수집·변환 규칙

루트 `CLAUDE.md`의 전역 규칙 위에 다음을 더한다.

## 실행
- 항상 프로젝트 루트에서 모듈로 실행: `.venv/bin/python -m pipelines.transform.build_regions`
- 스크립트는 `from pipelines.common import config` 로 경로·상수를 가져온다. 하드코딩 금지.
- 각 스크립트는 `--help` 로 입력·출력·옵션을 설명하고, 무엇을 몇 건 읽어 몇 건 썼는지 stdout 에 로그한다.

## 외부 참조 파일 (`data/external/`, git 제외 — 새 PC 에서는 직접 받아 넣는다)
수집기가 없어서 파이프라인이 자동으로 받지 않는다. 없으면 아래처럼 실패하거나 대체된다.
- `seoul_admin_dong.geojson` — 서울 행정동 경계. GitHub `raqoon886/Local_HangJeongDong` 의 `hangjeongdong_서울특별시.geojson` 을 이 이름으로 저장.
  없으면 `build_regions` 가 상가업소 convex hull 로 근사 경계를 만들고, `build_dong_crosswalk` 가 `adm_nm` 없음으로 실패한다.
- `seoul_trdar_area/trdar_area.shp` (+ `.dbf` `.shx` `.prj` `.cpg`) — 서울시 상권 영역. 서울 열린데이터광장 OA-15560 '서울시 상권분석서비스(영역-상권)'.
  파일은 `seoul_trdar_area/` 바로 아래에 둔다(압축을 풀며 폴더가 한 겹 더 생기기 쉽다). 없으면 `build_trdar_areas` 가 실패한다.
- 키·`.env` 는 `.env.example`·`frontend/.env.example` 을 복사해 채운다. Windows 는 `uvloop` 가 설치되지 않아 `requirements.txt` 에서 제외돼 있다.

## collect/ (수집)
- 출력은 `data/raw/<source>/<dataset>_<수집일 YYYYMMDD>.<ext>` 형식. 기존 파일을 덮어쓰지 않는다.
- 원본 응답을 최대한 가공 없이 저장한다(스키마 변경·컬럼 선택은 transform 단계에서).
- HTTP: 타임아웃 지정, 실패 시 지수 백오프 재시도(`tenacity`), 요청 간 지연을 둔다.
- 페이지네이션·쿼터: 총 건수와 수집 건수를 로그하고, 중단 지점부터 이어받을 수 있게 한다.
- **리뷰·평점은 수집하지 않는다**(네이버·카카오 지도는 robots.txt 로 금지 확인). 새 원천은 robots·약관부터 확인한다.
- **서울 열린데이터 LOCALDATA**: 페이지 정렬이 요청마다 달라 한 번 순회하면 누락된다 → `collect_seoul_localdata` 처럼 여러 번 순회해 합친다.
- 키가 없으면 명확한 메시지와 함께 종료한다(빈 파일 생성 금지).
- 새 원천은 `common/sources.py` 등록부에 API·필드·갱신주기·좌표계·이용조건·검증상태(실호출/문서만)를 적고, 업종 연결은 `common/industry_crosswalk.py` 에서 한다.

## 인허가·업종 파이프라인 실행 순서
`collect_sbiz_upjong` → `collect_seoul_localdata` (→ `collect_neis_academy`, 키 있을 때) → `transform.build_licenses`
→ `transform.build_industry_crosswalk` → `transform.compute_store_density` → `transform.link_store_licenses` → `transform.build_closure_evidence` → `transform.export_source_registry`
- `build_closure_evidence`: `closed_only` 매장 중 보수적 근거(상가정보 기준월 이후 폐업 / 폐업 이후 같은 건물에 다른 상호의 새 인허가가 생기고 상가정보에도 등재)가 있고 결격(상호 불일치·폐업 인허가 여러 건·폐업일 결측·취소·말소·같은 상호 영업 인허가 병존·중복 등록)이 없는 매장만 '인허가상 폐업 기록 확인'으로 저장한다(`store_closure_evidence.parquet`). 현장 폐업 확정이 아니다.

## 추정매출 시계열 실행 순서
`collect_seoul_trdar --datasets sales stores --quarter <분기>` 를 분기마다(2021Q1~최신) → `transform.build_sales_timeseries`
→ `transform.build_sales_crosswalk` → `transform.build_dong_metrics`
- 추정매출(THSMON_SELNG_AMT)은 분기 합계로 해석, 점포당 평균 분모는 유사업종 점포수(일반+프랜차이즈).
- 소분류→서울시 업종 대응은 `common/sales_industry_crosswalk.py` 에서만 한다.
- 상권 단위: `transform.build_trdar_areas`(경계 data/external/seoul_trdar_area) → `collect_seoul_trdar --datasets trdar_sales trdar_stores trdar_flpop` → `transform.build_sales_timeseries --level trdar`

## 상권 수요 기반(직장·상주인구·집객시설)
`collect_seoul_trdar --datasets trdar_workplace trdar_resident trdar_facility dong_facility` → `transform.build_hinterland`
- 이 넷은 API 가 분기 파라미터를 무시하고 전 분기를 돌려줘 `_all_` 태그로 전량 받고 변환에서 최신 분기를 고른다.
- 소득·소비는 서울시가 공급·갱신을 중단(API ERROR-500)해 연결하지 않는다.

## 입지 영향력 모델(수요 유형·입지 요인 회귀)
`transform.build_location_model` (build_hinterland·상권 매출·앵커 연산 뒤) → `location_features.parquet`(상권·행정동별 직장·상주인구, 수요 유형), `location_model_rows.parquet`(상권×음식 업종 모델 입력), `location_model.json`(계수·검증·제외 건수)
- 수요 유형: 직장인구 ÷ (직장+상주인구) 60% 이상 업무형, 30% 이하 주거형, 사이 혼합형. 기준은 코드 상수(`WORKER_TYPE_MIN`·`RESIDENT_TYPE_MAX`)와 `frontend/src/lib/glossary.ts` 가 같아야 한다.
- 목표값은 점포당 추정매출(로그)이라 그 분모인 서울시 점포 수는 입력에 쓰지 않는다 — 경쟁 밀도는 상가정보 점포 수로 만든다(데이터 누수 방지).
- 검증은 행정동 단위 GroupKFold, 표준화 기준은 학습 분할에서만 계산. 요인이 '업종만 넣은 기준 모델'보다 나아지지 않으면 `useful=false` 로 기록하고 화면은 참고용으로 낮춘다.
- 상관이지 인과가 아니며 매장 매출 예측이 아니다. 지하철은 역 좌표가 없어 영역 안 유무(집객시설 수)만 쓴다.

## 상가정보 스냅샷(점포수 변동성)
`collect_sbiz_stores` 를 분기마다 → `transform.build_store_snapshots` (스냅샷을 쌓아 두 스냅샷 사이 신규·소멸 매장 수)
- 스냅샷 이름은 API 기준월(stdrYm). 같은 기준월을 30일 이상 뒤에 다시 받으면 `기준월#2` 로 별도 스냅샷, 30일 안 재실행은 나중 파일로 대체.

## 분기 갱신 한 번에 돌리기
`.venv/bin/python -m pipelines.run_quarterly --quarter <YYYYQ>` — 위 순서 전체(수집 → 변환 → backend 테스트).
`--dry-run` 으로 순서 확인, `--skip-collect` 로 변환만, 실패하면 `--from <단계>` 로 이어서.
새 수집·변환 모듈을 만들면 `STEPS` 에 넣거나(의존 순서 지켜서) `NOT_IN_QUARTERLY` 에 이유와 함께 적는다.
`.venv/bin/python -m pytest pipelines/tests` 가 둘 다 빠진 모듈과 순서 어긋남을 잡는다(분기 갱신 마지막 단계에서도 돈다).

## 결측 처리와 R-ONE 기준 분기
- 서울시 매출·점포 표(`build_sales_timeseries`)는 점포 수·개업·폐업이 비면 0 이 아니라 NaN, 점포 수 0 은 0 으로 둔다(둘을 구분해 backend 가 계산에서 제외하고 사유를 표시).
  시간대·연령 구성비는 칸이 하나라도 비면 NaN. 제외·결측 건수는 로그에 남긴다.
- R-ONE 임대료·공실률(`build_reb_zone_metrics`)은 분기를 코드에 박지 않고 통계표마다 원천의 실제 최신 분기를 쓴다. 지표별 `<지표>_quarter` 칸에 분기를 기록하고,
  그 분기에 값이 없는 상권은 NaN(이전 분기로 채우지 않음).

## 버스 교통(정류장 위치·이용량) 실행 순서 — 1차 검증 단계
`collect_bus_transit`(위치정보·이용량·TAGO 격자) → `transform.build_bus_stops` (키: `.env` 의 `DATA_GO_KR_KEY`, 키·원천·파생 데이터는 git 에 올리지 않는다)
- 위치정보와 이용량은 모바일 번호(ARS)+정류장명이 맞는 유일한 쌍만 연결하고(좌표 근접만으로는 연결하지 않음), 같은 정류장의 BIS 별 중복은 `is_primary` 로 한 곳만 남긴다.
  연결 안 된 이용량은 비워 둔다(임의로 채우지 않음). 이용량은 정류장별 일일 평균 승하차 인원이며 유동인구·방문객 수가 아니다.
- 연결 건수·매칭률·중복·누락률은 `outputs/tables/bus_transit_report.csv`.
- **자동 갱신(`run_quarterly`) 대상이 아니다**(`NOT_IN_QUARTERLY`). 위치정보는 연 단위, 이용량은 연간 갱신 자료라 분기마다 돌릴 필요가 없고, 새 버전이 공개됐을 때 직접 다시 돌린다.
  수동 재실행(프로젝트 루트에서, 순서대로):
  1. `.venv/bin/python -m pipelines.collect.collect_bus_transit` — `data/raw/bus_transit/` 에 수집일 이름으로 새 파일을 쌓는다(기존 파일은 덮어쓰지 않음).
  2. `.venv/bin/python -m pipelines.transform.build_bus_stops` — `bus_stops.parquet`·`bus_usage_match.parquet`·`bus_meta.json` 과 보고서를 다시 만든다. 가장 최근 원본을 쓰므로 연결률·중복 수를 보고서에서 확인한다.
  3. `.venv/bin/python -m pytest backend/tests pipelines/tests` — 백엔드가 이 파일을 읽으므로(`bus_access`) 파일이 없으면 버스 블록은 '확인 불가'로 나온다.
  (이용량 기준연도와 위치정보 기준일은 `bus_meta.json` 에 기록되고 화면의 출처 줄에 그대로 나온다.)

## 지하철·도시철도(역 좌표·출구·이용량) 실행 순서 — 1차 검증 단계
`collect_rail_transit`(서울 역사 마스터·월별 승하차·카카오 역/출구·광역/고속철도·대구 메타) → `transform.build_rail_stations` (키: `.env` 의 `SEOUL_OPENAPI_KEY`·`KAKAO_REST_API_KEY`·`DATA_GO_KR_KEY`, 키·원천·파생 데이터는 git 에 올리지 않는다)
- **자동 갱신(`run_quarterly`) 대상이 아니다**(`NOT_IN_QUARTERLY`). 서울 이용량은 월별이라 새 달이 올라오면, 카카오 출구 검색(수백 회 호출)은 필요할 때 직접 다시 돈다.
  수동 재실행(프로젝트 루트에서, 순서대로): `.venv/bin/python -m pipelines.collect.collect_rail_transit` (기존 파일은 덮어쓰지 않음, 같은 날 다시 받으려면 `--force`) → `.venv/bin/python -m pipelines.transform.build_rail_stations` → `.venv/bin/python -m pytest pipelines/tests`.
- 역 좌표의 기준은 서울 열린데이터광장 마스터(공식)이고 카카오 역은 대조용이다. 출구 좌표는 카카오 '지하철출구'뿐이라 공식 자료가 아니고 누락될 수 있다 — 출구가 없는 역사는 `has_entrance_data=False`(역 중심점 기준만).
  '<역> 출구' 한 번 검색은 결과가 2~3건이라 번호별 검색('<역> N번출구')을 쓴다. 역 좌표(`rail_complexes`)와 출구 좌표(`rail_entrances`)는 다른 표에 둔다.
- 환승: 같은 정규화 역명이 400m 안이면 한 역사(`complex_id`)로 묶고 노선별 행(`rail_stations`)은 그대로 둔다. 역 수는 역사 단위로 센다.
- 이용량은 서울 교통카드 월별 승·하차(환승 칸 없음). 승차와 하차를 더하지 않고, 역명+노선이 맞는 유일한 쌍만 연결하며, 완전히 같은 중복 행(원천이 월을 두 번 담음)은 하나로 줄이고 건수를 남긴다.
  연결 안 된 값은 비워 둔다. 고속철도(KTX·SRT)는 `rail_hs_usage` 로 따로 두고 합치지 않는다. 버스(`bus_*`)와는 합치거나 중복 제거하지 않는다(교통수단이 다른 측정치).
- 수집 범위는 버스와 같은 파일럿 구역 + 1.1km 이고, 반경 N m 계산은 5179 좌표(`x_5179`·`y_5179`)의 직선거리다. 연결률·중복·출구 현황은 `outputs/tables/rail_transit_report.csv`, 공식 제공처 조사는 `outputs/tables/rail_source_survey.csv`.

### 전국 철도 위치(공식 XLSX)·운영기관별 승하차 통합
`data/raw/전체_도시철도역사정보_20260630.xlsx`(국가철도공단 표준데이터 15013205 — 사람이 data.go.kr 에서 내려받아 둔다, API 가 아님. 읽기 전용) + `collect_rail_transit --datasets seoul_daily busan incheon` → `transform.build_rail_national`
- 새 XLSX 로 바꾸면 `build_rail_national.XLSX` 상수의 파일 이름을 고치고 다시 실행한다. 기존 `rail_*.parquet`(파일럿)는 건드리지 않고 `rail_official_stations`·`rail_station_crosswalk`·`rail_entrance_links`·`rail_usage_operator_monthly`·`rail_usage_overlap`·`rail_usage_complex_2025`·`rail_national_meta.json` 을 새로 만든다.
- 좌표 우선순위: 공식 XLSX > 서울 열린데이터광장 마스터 > 카카오(차이는 crosswalk 에만 남김). 공식 표에는 출구 좌표가 없어 출구는 기존 카카오 보조 자료로만 두고 `rail_entrance_links` 로 연결한다.
- 역 식별은 (운영기관, 역번호, 노선번호, 표준 노선)이고 같은 이름이라도 400m 밖이면 다른 역사다. 같은 키·50m 안 중복 행은 최신 기준일 하나만 남긴다(건수·행 번호는 meta). 행별 데이터기준일자는 형식이 섞여 있어 `base_date_flag` 로 구분한다.
- 이용량은 승차·하차를 따로, 원천별 관측 기간이 달라(서울 카드 2025-01~, 서울 일별 2024, 부산 2025-01~2026-08, 인천 2024-07~2026-06) 같은 기간처럼 비교하지 않는다. 역사 요약은 2025 달력 연도만 쓴다.
  연결은 원천이 가진 식별자만 쓴다(부산=역번호+이름 검증, 서울·인천=노선+역명, 좌표 금지). 같은 역·월을 여러 원천이 담으면 운영기관 자체 자료를 대표로 하고 나머지는 `is_primary=False`(`rail_usage_overlap`)로 두어 합산하지 않는다.
  대구·대전·광주 등 이용량 자료를 아직 받지 않은 지역은 `no_source_for_operator` 로 '자료 없음'이다(0 이 아니다). 대구교통공사 월별 자료(15002503)는 승인돼 있어 필요하면 `USAGE_VERSIONS` 에 더해 받는다.
- 자동 갱신 대상이 아니다(`NOT_IN_QUARTERLY`). 수동 재실행은 위 순서(수집 → 변환 → `.venv/bin/python -m pytest pipelines/tests`)이며 `requirements.txt` 의 `openpyxl` 이 필요하다.

## 주요 집객시설(개별 시설 좌표) 실행 순서 — 1차 구축
`collect_facilities`(서울시 문화공간·대학 목록·행안부 대규모점포·행안부 영화상영관·건강보험심사평가원 병원정보·카카오 시설 검색) → `transform.build_facilities` (키: `.env` 의 `SEOUL_OPENAPI_KEY`·`DATA_GO_KR_KEY`·`KAKAO_REST_API_KEY`, 키·원천·파생 데이터는 git 에 올리지 않는다)
- 서울시 행정동·상권 단위 시설 **수**(`*_hinterland.fac_*`)와 개별 시설 **좌표**는 집계 기준이 달라 섞지 않는다(변환이 행정동별 차이만 보고서에 남긴다).
- 종류: 종합병원·대학교 캠퍼스·백화점·복합쇼핑몰·아울렛·대형마트(슈퍼마켓/SSM 제외)·영화관·문화시설. 승인된 공식 좌표 자료는 종합병원(건강보험심사평가원 전국·LOCALDATA·상가정보)·서울시 문화공간·행안부 대규모점포(백화점·쇼핑센터/복합쇼핑몰·대형마트, 전국, 준대규모점포 제외)·행안부 영화상영관(전국)이고, 대학교·아울렛은 카카오 보조 출처뿐이다(`facility_source_survey.csv` 에 조사 결과).
  시설 이용객 수는 없고 추정하지 않는다. 상급종합 구분은 건강보험심사평가원 자료(종별코드)에서만 온다(영업상태는 없어 LOCALDATA 가 있을 때만 상태를 정함). 행안부 대규모점포는 등록 구분(`BZSTAT_SE_NM`)을 그대로 따르고(상호와 어긋나 보여도 바꾸지 않음), 준대규모점포(SSM)는 제외하며, 좌표 없는 행은 좌표를 만들지 않고 분석에서 뺀다. 영화상영관은 상영관 단위 행이라 같은 좌표·같은 이름 앞부분을 영화관 한 곳으로 묶고(관리번호 MNG_NO 는 전국 유일하지 않아 개방자치단체코드와 합친 키를 쓴다), 상가정보에만 있는 병원 등재가 100m 안의 심평원·인허가 병원과 이름이 겹치면 독립 시설로 세지 않고 연결만 한다. 좌표가 없는 공식 행은 주소가 파일럿 두 구 또는 맞닿은 구·시일 때만 남기고(그 밖은 건수만 기록), 파일럿 구 주소의 좌표 없는 공식 시설은 meta 의 `unlocated_official`·`coord_coverage` 에 남겨 반경 분석이 '확인 불가'로 표시하게 한다. 공식 목록에 없는 시설이 카카오에만 보일 수 있어 `facility_source_diagnostic.csv`·meta 의 `reconciliation` 으로 차이를 본다.
- 같은 시설 묶기: 종류·수준이 같고 이름이 일치/포함이며 150m 이내일 때만. 이름이 같아도 150m 밖이면 다른 지점·캠퍼스, 대학 캠퍼스와 단과대학은 따로. 좌표가 없는 행은 만들지 않고 누락으로 둔다. 다른 이름 30m 이내·다른 원천은 합치지 않고 `dup_suspect` 로 표시한다.
- 서울시 문화공간은 X_COORD 가 위도·Y_COORD 가 경도로 뒤바뀌어 온다(범위로 확인해 바로잡음). 수집 범위는 파일럿 구역 + 1.1km(버스·철도와 같음)이고, 카카오 검색은 45건 초과 구역을 4등분하며 그래도 넘는 구역은 원본 meta 의 `capped_rects` 에 남는다.
- **출처·이용 권한은 시설마다 남긴다**(`source_name`·`source_type`(official/supplementary)·`reference_date`·`coordinate_source`·`coverage_status`·`usage_permission_status`·`attribution`).
  서비스 분석 대상(`analysis_eligible`)은 공식 좌표 + 공개 이용 권한 확인 + 폐업·취소 아님 + 독립 시설뿐이다. **카카오 로컬 데이터는 이용 권한 미확인**(운영정책 제5조 제20·30호, 플랫폼 서비스 약관 제11조 제3항, 카카오 개발자 포럼 공식 계정 답변: 저장 불가·실시간 호출만)이라 서비스용 확정 DB·공개 API 에 쓰지 않는다(진단용으로만).
  카카오 검색 한도에 닿은 구역은 `incomplete_zones` 와 시설별 `coverage_status` 로 기록하고, 대학 단과대학 건물은 `counts_as_independent=False`·`parent_facility_id` 로 캠퍼스에 연결만 한다. 중복 의심은 `facility_dup_review.csv` 에 근거만 남기고 자동 병합하지 않는다.
  권한 미확인 자료를 뺀 영향은 `facility_source_diagnostic.csv`. 반경 계산 준비 함수는 `backend/app/services/facility_access.py`(아직 공개 API 에 연결하지 않음).
- 자동 갱신 대상이 아니다(`NOT_IN_QUARTERLY`). 수동 재실행: `.venv/bin/python -m pipelines.collect.collect_facilities` → `.venv/bin/python -m pipelines.transform.build_facilities` → `.venv/bin/python -m pytest pipelines/tests`.

## 프랜차이즈(공정위) 실행 순서
`collect_ftc_franchise` → `transform.build_franchise` (매장↔브랜드는 상호+업종으로 추정 연결, 규칙은 모듈 docstring)

## transform/ (변환)
- 입력은 `data/raw/`·`data/external/`, 출력은 `data/interim/`·`data/processed/`.
- 좌표: 저장은 WGS84(EPSG:4326) `lon`/`lat`, 거리·면적 연산은 EPSG:5179 로 투영. (`config.CRS_*`)
- 격자 ID·정렬은 결정적으로. 부동소수 결과는 자리수를 고정해 저장한다.
- 결측·이상치·중복 처리 시 적용 기준과 건수를 로그와 `outputs/tables/`에 남긴다.
- 목표값(매출 등)을 알려주는 파생변수, 예측 시점 이후 정보, 식별자를 모델 입력 피처에 넣지 않는다.
- train 에서 학습한 인코딩·스케일·구간 기준을 그대로 저장해 valid/test 에 적용한다.

## common/
- 순수 함수 위주. I/O·경로·좌표 변환 등 재사용 유틸만 둔다. 특정 데이터셋 로직은 넣지 않는다.
