# frontend/ — React + 카카오맵 대시보드 규칙

루트 `CLAUDE.md`의 전역 규칙 위에 다음을 더한다.

## 스택
- React + Vite + TypeScript. 패키지 매니저는 npm.
- 지도: 카카오맵 JS SDK. 앱 키는 `import.meta.env.VITE_KAKAO_JS_APP_KEY`로 주입하고 코드에 하드코딩하지 않는다(카카오 콘솔에 도메인 등록 필요).
- 서버 상태: React Query. 클라이언트 전역 상태가 필요하면 zustand(가볍게).

## 구조
- `src/features/<기능>/` 단위로 컴포넌트·훅·API 호출을 함께 둔다.
  - `features/map`: 카카오맵 바탕(`KakaoMap`)·행정동 경계·R-ONE 임대료 마커
  - `features/food`: 요식업·카페 지도 — 확대 단계별 버블(구·행정동·상권·매장 점), 업종·지표 필터, 범례, 스타벅스·다이소 표시,
    위치 검색(`SearchBox`)과 이용 순서 안내(`FlowGuide`: 검색 → 위치 선택 → 업종 선택 → 후보 지역 비교), 입지 비교(`ComparePanel`), 매장 목록 '더 보기'(`UnitStoreList`)
  - `features/stores`: 매장 상세 서랍 — 동네 매출 비교·내 가게 점검·프랜차이즈·상권 운영 점검·Google 고객평가·매장 운영이력·주변 상권 분석
    - 내 가게 점검(`MyStoreCheckupSection`): 월 매출 기록을 동네 같은 업종의 **변화율**과 견주고(금액 수준은 카드 추정과 달라 비교하지 않는다), 비용을 넣어 손익분기를 본다.
      기록은 `lib/myStoreStorage`(localStorage, 가게별)에만 두고 서버로 보내지 않는다. 판단은 `lib/checkup`·`lib/breakeven` 순수 함수.
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
- 조회 화면은 최초 로딩 / 조건 변경 후 재조회 / 정상 0곳 / 자료 없음 / 조회 실패를 구분한다(`lib/queryState`). 새 조건의 결과를 기다리며 이전 결과를
  남겨 두면(`keepPreviousData`) 흐리게 표시하고 클릭·비교·상세 진행을 막으며, 실패에는 '다시 시도'를 둔다.
- 지표 숫자 가까이에 그 값이 적용된 업종 범위('커피-음료 전체 기준')를 항상 표시한다(툴팁·하단 안내에만 두지 않는다). 원천에 없는 세부 업종 값은 추정·배분하지 않는다.

## 테스트
- `npm test` (= `node --test tests/*.test.ts`) — 새 의존성 없이 Node 의 타입 제거 실행으로 돈다. 그래서 검증할 판단 로직(`lib/queryState`·`flow`·`searchTarget`·`foodText`)은
  다른 모듈을 import 하지 않는 순수 함수로 두고, 테스트는 `tests/` 에 `.ts` 확장자로 import 한다(`erasableSyntaxOnly` 범위의 문법만 사용).
- 빌드 확인: `npm run build` (= `tsc -b && vite build`), 린트: `npm run lint`.
