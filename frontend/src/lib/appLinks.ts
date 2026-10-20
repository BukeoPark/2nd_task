// 서비스의 홈(랜딩페이지) 주소 — 지도 앱의 로고·'홈' 단추가 쓴다. 주소를 코드에 박지 않고 환경에서 정한다.
//  · VITE_LANDING_URL 이 있으면 그 주소(운영: 랜딩의 실제 주소, 개발: http://localhost:3000)
//  · 없으면 개발 서버는 기본 랜딩 개발 주소, 운영 빌드는 같은 도메인의 맨 위('/') — 랜딩이 도메인 루트에 있다고 본다
// 랜딩의 시작 버튼은 `?mode=owner|founder` 를 붙여 앱으로 오므로 앱 → 홈 → 앱 흐름이 이어진다. 다른 모듈을 import 하지 않는 순수 함수(tests/appLinks.test.ts).

export const DEV_LANDING_URL = "http://localhost:3000";

export function landingHref(env: string | undefined, isDev: boolean): string {
  const v = (env ?? "").trim().replace(/\/+$/, "");
  if (v !== "") return /^https?:\/\//.test(v) ? v : isDev ? DEV_LANDING_URL : "/";   // http(s) 주소만 믿는다
  return isDev ? DEV_LANDING_URL : "/";
}
