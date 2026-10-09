# 상권 분석 웹 서비스 — 작업 규칙 (루트)

## 프로젝트
전국 상권 데이터 기반 **자영업자·예비 창업자용 상권 분석 웹 서비스**.
호갱노노처럼 직관적인 지도 기반 UI로,
- 자영업자에게: 내 상권 경쟁업체 현황 + 매장별 운영이력·고객평가
- 예비 창업자에게: 안정적인 입지 선택 인사이트

핵심 기능 3가지 + 부가 1가지
1. 지도 기반 상권 시각화 — 매출/증감률, 점포수 변동성, 임대료/공실률을 버블 차트로
2. 앵커 브랜드(스세권/다세권) 지표 — 대형 브랜드와의 거리/밀집도 연산
3. 매장별 세 영역 — 'Google 고객평가'(Places UI Kit 공식 컴포넌트) / '매장 운영이력'(인허가 기준 업력·영업 상태·인증) / '주변 상권 분석'(같은 업종 개폐업·관찰기간을 맞춘 폐업 비율)
4. (부가) 업종별 성공 매뉴얼을 학습한 AI 창업 컨설팅 리포트

**1차 파일럿 범위**: 서울 **양천구(11470) · 영등포구(11560)**. 검증 후 확대.
**스택**: FastAPI + PostgreSQL/PostGIS + React(Vite) + 카카오맵. AI 리포트는 Claude API(claude-sonnet-5).
PostGIS 도입 전까지는 `data/processed/` 파일 기반으로 동작한다.

## 폴더 지도
```
pipelines/     데이터 수집·변환 (Python).            → pipelines/CLAUDE.md
  collect/       공공데이터·카카오·네이버 수집기
  transform/     정제, 상권·행정동 경계, 매출·개폐업·수요 기반 시계열, 앵커 연산, 상가정보 스냅샷
  run_quarterly.py  분기 갱신(수집 → 변환 → backend 테스트)을 순서대로 한 번에
  common/        config, io, geo 공용 유틸
backend/       FastAPI 서버.                         → backend/CLAUDE.md
  app/{routers,services,schemas,core}
  tests/
frontend/      React + 카카오맵 대시보드.            → frontend/CLAUDE.md
  src/{features/{map,food,stores},components,lib,pages}
data/
  raw/           API/다운로드 원본. 수정·덮어쓰기 금지.
  external/       경계 GeoJSON, 코드 매핑 등 외부 참조자료.
  interim/        파이프라인 중간 산출물(재생성 가능).
  processed/      분석·API용 최종 산출물. backend 가 소비.
outputs/{tables,figures}   분석 표·그래프.
infra/         docker-compose, DB init SQL 등.
scripts/       일회성 운영 스크립트.
notebooks/, docs/   탐색·메모용. git 에 커밋하지 않음.
```
폴더에서 작업할 때는 그 폴더의 `CLAUDE.md`를 함께 따른다. 없으면 이 파일만 적용.

## 전역 규칙
- **경로**: 항상 프로젝트 루트 기준 상대경로. Python 은 `pipelines/common/config.py`의 경로 상수를 쓴다.
- **venv 실행**: `.venv/bin/python -m <모듈>` 형태로만 실행한다. `.venv/bin/uvicorn`·`.venv/bin/pytest` 같은 콘솔 스크립트는 설치 시점 절대경로가 셔뱅에 박혀서 프로젝트 폴더명이 바뀌면 깨진다.
- **비밀키**: 실제 키는 `.env`에만 두고 절대 커밋하지 않는다. 새 키가 생기면 `.env.example`에 빈 항목을 추가한다.
- **원본 불변**: `data/raw/`, `data/external/`는 읽기 전용으로 취급한다. 가공물은 `interim/`·`processed/`에 쓴다.
- **재현성**: 처음부터 다시 실행해도 같은 결과가 나오도록 작성한다(고정 시드, 결정적 정렬, 파라미터는 코드/설정에 명시).
- **산출물 최소화**: 요청하지 않은 Markdown 문서·노트북·중간 파일을 repo 에 만들지 않는다. 탐색물은 `notebooks/`·`docs/`(git 제외)에 둔다.
- **언어**: 코드 주석·문서·커밋 메시지는 한국어 기본.
- **데이터 누수 금지**: 식별자, 예측 시점 이후에만 알 수 있는 정보, 목표값을 직·간접적으로 알려주는 변수를 모델 입력에 넣지 않는다.
- **분리 원칙**: 학습 데이터에서 정한 변환 기준을 검증·테스트에 동일 적용한다. 모델·판단 기준 확정 전에는 최종 테스트 데이터를 쓰지 않는다.
- **기록**: 제외·대체한 데이터가 있으면 기준과 건수를 분석 출력(로그/표)에 남긴다.
- 처음 실행 전 실제 파일명·구분자·인코딩·열 이름·자료형을 확인한다.
- **리뷰·평점**: 스크래핑하지 않는다. Google 평점·리뷰는 Places UI Kit 컴포넌트로만 표시하고 DB·로그·외부 AI 로 보내지 않는다(Place ID 만 저장). 자체 감성점수·리뷰 순위·'매장 신뢰도 점수'를 만들지 않는다.
- **업종**: 소상공인 공식 분류(대·중·소) 전체를 지원한다. 원천별 업종 코드는 `pipelines/common/industry_crosswalk.py` 대응표로만 연결한다.
