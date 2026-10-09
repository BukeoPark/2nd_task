# frontend/ — React + 카카오맵 대시보드 규칙

루트 `CLAUDE.md`의 전역 규칙 위에 다음을 더한다.

## 스택
- React + Vite + TypeScript. 패키지 매니저는 npm.
- 지도: 카카오맵 JS SDK. 앱 키는 `import.meta.env.VITE_KAKAO_JS_APP_KEY`로 주입하고 코드에 하드코딩하지 않는다(카카오 콘솔에 도메인 등록 필요).
- 서버 상태: React Query. 클라이언트 전역 상태가 필요하면 zustand(가볍게).

## 구조
- `src/features/<기능>/` 단위로 컴포넌트·훅·API 호출을 함께 둔다.
  - `features/map`: 카카오맵 바탕(`KakaoMap`)·행정동 경계·R-ONE 임대료 마커
  - `features/food`: 요식업·카페 지도 — 확대 단계별 버블(구·행정동·상권·매장 점), 업종·지표 필터, 범례, 스타벅스·다이소 표시, 입지 비교(`ComparePanel`)
  - `features/stores`: 매장 상세 서랍 — 동네 매출 비교·프랜차이즈·매출 개선 리포트·Google 고객평가·매장 운영이력·주변 상권 분석
- `src/components/`는 기능 독립적인 공용 UI 만.
- `src/lib/`는 apiClient(백엔드 `/api` 베이스), 지도 헬퍼, 포맷터.
- 페이지 조립은 `src/pages/`.

## 규약
- 백엔드 호출은 `src/lib/apiClient` 를 통해서만. 컴포넌트에서 `fetch` 직접 호출 금지.
- 지도 레이어(버블 등)는 별도 컴포넌트로 분리하고, 데이터→시각 속성(크기·색) 매핑 함수는 `lib/`에 순수 함수로 둔다.
- 색상·구간 기준은 상수 모듈 한 곳에서 관리(범례와 지도가 같은 값을 쓴다).
- 좌표는 `{ lon, lat }` 객체로 다루고, 카카오 SDK 가 요구하는 `(lat, lng)` 변환은 헬퍼에서만 한다.
- Google 고객평가는 `<gmp-place-details>`(Places UI Kit)로만 표시한다. 내용을 읽어 저장·재가공·점수화하지 않고, 테두리로 우리 콘텐츠와 구분한다.
- 값 0 / 정보 없음 / 해당 없음 / 조회 실패 / 연동 준비 중을 서로 다른 문구로 구분한다(`components/Notice`). 정보가 부족한 매장도 기본정보는 보여준다.
- 각 정보에는 출처·기준일(`SourceNote`)을 붙인다.
- API 키·개인정보를 URL 쿼리스트링에 넣지 않는다.
