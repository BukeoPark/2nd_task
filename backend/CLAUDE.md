# backend/ — FastAPI 서버 규칙

루트 `CLAUDE.md`의 전역 규칙 위에 다음을 더한다.

## 실행
- 루트에서: `.venv/bin/python -m uvicorn app.main:app --reload --app-dir backend`
  (`.venv/bin/uvicorn`처럼 venv의 콘솔 스크립트를 직접 부르지 않는다 — 셔뱅에 설치 시점 절대경로가 박혀서, 이 폴더 이름이 한 번이라도 바뀌면 깨진다. `python -m <모듈>` 형태만 쓴다.)
- 테스트도 동일하게: `.venv/bin/python -m pytest backend`
- 설정은 `app/core` 또는 `app/config.py`의 `settings`(pydantic-settings)에서만 읽는다. `os.environ` 직접 접근 금지.

## 레이어
- `routers/`  : 경로·검증·직렬화만. 비즈니스 로직을 두지 않는다.
- `services/` : 실제 로직. 데이터 접근은 `services/data_store.py`(파일 기반)를 통해서만 한다.
- `schemas/`  : 요청·응답 pydantic 모델. 응답은 항상 스키마로 타입을 고정한다.
- `core/`     : 설정, (도입 시) DB 세션, 공통 의존성.

## 데이터 접근
- 지금은 `data/processed/`의 Parquet/GeoJSON 을 읽는다. 산출물이 없으면 503 + "파이프라인 먼저 실행" 메시지.
- PostGIS 도입 시 `data_store.py` 구현만 교체하고 라우터·서비스 시그니처는 유지한다.
- `pipelines/`를 backend 에서 import 하지 않는다(단방향 의존: pipelines → data → backend).

## 규약
- 경로 접두사 `/api`, 리소스명은 복수형·kebab 없이 소문자.
- 에러는 `HTTPException`(4xx/5xx)로, `detail`에 원인·다음 행동을 한국어로.
- 좌표는 응답에서도 `lon`/`lat`(WGS84). GeoJSON 은 표준 `[lon, lat]` 순서.
- 새 엔드포인트에는 `tests/`에 최소 1개의 정상·1개의 예외 테스트를 추가한다.
- 비밀키·내부 경로를 응답 본문이나 로그에 노출하지 않는다.
