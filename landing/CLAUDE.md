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
- 이미지 파일 없이 SVG 그림(`components/Art.tsx`)으로 그린다. 새 그림은 접근성 이름(`aria-label`)을 단다. 지도 앱 화면의 구성을 보여 줄 때는 캡처 이미지(카카오 지도 타일이 섞임) 대신 HTML 로 본뜬 `components/SummaryPreview.tsx` 를 쓰고, 값은 `lib/content.ts` 의 `SUMMARY_PREVIEW`(지도 앱 요약에 실제로 나오는 공식 집계 값)만 쓴다. 임의의 수치·가상 실적은 싣지 않는다.
- 색·글꼴은 `app/globals.css` 의 토큰(`--blue`·`--orange` 등)만 쓴다. 지도 앱의 파랑·리포트의 주황과 맞춘다.

## 배포
랜딩은 정적 파일(`out/`)이라 Vercel·Netlify·Cloudflare Pages·GitHub Pages·S3+CDN 어디에든 올린다. 빌드 명령은 `npm --prefix landing run build`, 배포 폴더는 `landing/out`이다.
- 빌드할 때 환경변수 두 개를 정한다(`landing/.env.example` 참고): `NEXT_PUBLIC_APP_URL`(지도 앱 주소 — 시작 버튼이 `?mode=` 를 붙여 보낸다), `NEXT_PUBLIC_SITE_URL`(이 랜딩 주소 — canonical·sitemap·공유 미리보기).
  **`NEXT_PUBLIC_SITE_URL` 을 정하지 않거나 localhost 면 robots.txt 가 전부 막고 `noindex` 가 붙는다**(로컬·미리보기가 검색에 잡히지 않게). 실제 주소로 배포할 때만 색인을 허용한다.
- `public/_headers` 는 Netlify·Cloudflare Pages 가 읽는 응답 헤더다. 다른 호스팅이면 같은 값(nosniff·Referrer-Policy·X-Frame-Options·정적 파일 캐시)을 그 호스팅 설정에 옮긴다.
- 404 는 `app/not-found.tsx`, 아이콘은 `app/icon.svg`. 공유 미리보기 이미지(og:image)는 아직 없다.
- 랜딩만 올려서는 서비스가 열리지 않는다. 시작 버튼이 가는 **지도 앱 배포가 따로 필요**하다: ① `frontend` 빌드(`VITE_API_BASE_URL`·`VITE_KAKAO_JS_APP_KEY`·구글 브라우저 키 — 카카오 콘솔에 앱 도메인 등록, 구글 키는 HTTP 리퍼러 제한),
  ② 백엔드 호스팅(`data/processed/` 산출물이 git 에 없어 서버에서 파이프라인을 돌리거나 산출물을 올려야 하고, `backend/app/config.py` 의 `cors_origins` 에 앱 주소를 넣어야 한다).
