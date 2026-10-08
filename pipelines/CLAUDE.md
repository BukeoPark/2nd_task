# pipelines/ — 데이터 수집·변환 규칙

루트 `CLAUDE.md`의 전역 규칙 위에 다음을 더한다.

## 실행
- 항상 프로젝트 루트에서 모듈로 실행: `.venv/bin/python -m pipelines.transform.build_regions`
- 스크립트는 `from pipelines.common import config` 로 경로·상수를 가져온다. 하드코딩 금지.
- 각 스크립트는 `--help` 로 입력·출력·옵션을 설명하고, 무엇을 몇 건 읽어 몇 건 썼는지 stdout 에 로그한다.

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
→ `transform.build_industry_crosswalk` → `transform.compute_store_density` → `transform.link_store_licenses` → `transform.export_source_registry`

## 추정매출 시계열 실행 순서
`collect_seoul_trdar --datasets sales stores --quarter <분기>` 를 분기마다(2021Q1~최신) → `transform.build_sales_timeseries`
→ `transform.build_sales_crosswalk` → `transform.build_dong_metrics`
- 추정매출(THSMON_SELNG_AMT)은 분기 합계로 해석, 점포당 평균 분모는 유사업종 점포수(일반+프랜차이즈).
- 소분류→서울시 업종 대응은 `common/sales_industry_crosswalk.py` 에서만 한다.
- 상권 단위: `transform.build_trdar_areas`(경계 data/external/seoul_trdar_area) → `collect_seoul_trdar --datasets trdar_sales trdar_stores trdar_flpop` → `transform.build_sales_timeseries --level trdar`

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
