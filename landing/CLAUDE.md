# landing/ — 랜딩페이지 (Next.js) 규칙

루트 `CLAUDE.md`의 전역 규칙 위에 다음을 더한다.

## 스택·실행
- Next.js(App Router, TypeScript) + React 19. **정적 내보내기**(`output: "export"` → `out/`)라 서버 없이 어디서나 호스팅한다.
- 실행: `npm --prefix landing run dev`(3000), 빌드: `npm --prefix landing run build`, 타입: `npm --prefix landing run typecheck`, 테스트: `npm --prefix landing test`.
- 지도 앱 주소는 빌드할 때 `NEXT_PUBLIC_APP_URL`(없으면 `http://localhost:5173`)로 정한다. 시작 버튼은 `?mode=owner|founder` 를 붙여 지도 앱으로 보낸다(`lib/links.ts`, 값은 `frontend/src/lib/mode.ts` 와 같다).

## 내용 규칙
- 문구와 예시 값은 `lib/content.ts` 한 곳에서 고친다. 화면 코드(`app/`, `components/`)에 문구를 흩뿌리지 않는다.
- **랜딩에는 업소 이름을 싣지 않는다.** 예시 숫자는 상권·행정동 단위의 공식 통계 집계 값이고, 화면에 '예시'임을 밝힌다.
- 서비스 범위(지금은 영등포구·양천구 외식업)를 숨기거나 부풀리지 않는다. 가격·성과 같은 확인되지 않은 약속을 쓰지 않는다.
- 매출은 카드 결제 기반 추정이고 개별 가게의 실제 매출이 아니라는 점, 내 매출은 브라우저에만 저장된다는 점은 지도 앱과 같은 표현을 쓴다.
- 이미지 파일 없이 SVG 그림(`components/Art.tsx`)으로 그린다. 새 그림은 접근성 이름(`aria-label`)을 단다.
- 색·글꼴은 `app/globals.css` 의 토큰(`--blue`·`--orange` 등)만 쓴다. 지도 앱의 파랑·리포트의 주황과 맞춘다.
