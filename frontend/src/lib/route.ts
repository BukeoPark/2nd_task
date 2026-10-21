// 앱 안 주소 규칙 — 한 주소(5173)에서 랜딩('/')과 지도('/map')를 함께 낸다. 라우터 라이브러리 없이 경로(pathname)만 본다.
//  · '/'            랜딩(서비스 홈)
//  · '/map?mode=…'  지도·보고서 앱(mode = owner | founder)
//  · 예전 주소('/?mode=…'·'/?unit=…' 처럼 '/' 에 지도용 검색값이 붙은 링크·공유 주소)는 같은 검색값 그대로 '/map' 으로 보낸다.
// 다른 모듈을 import 하지 않는 순수 함수(tests/route.test.ts).

export type Page = "landing" | "map";

export const HOME_PATH = "/";
export const MAP_PATH = "/map";

/** '/' 에 붙어 있으면 지도 앱용 주소로 보는 검색값 — mode(이용 모드)·unit/svc/scls(공유 링크의 지역·업종). */
const MAP_PARAMS = ["mode", "unit", "svc", "scls"];

export interface Route {
  page: Page;
  /** 주소창을 이 값으로 바꿔야 하면(예전 주소·모르는 경로) 그 경로+검색값. 해시는 호출한 쪽이 붙인다. */
  canonical: string | null;
}

const stripSlash = (p: string) => (p.length > 1 ? p.replace(/\/+$/, "") : p) || "/";

export function resolveRoute(pathname: string, search: string): Route {
  const path = stripSlash(pathname);
  if (path === MAP_PATH) return { page: "map", canonical: pathname === MAP_PATH ? null : `${MAP_PATH}${search}` };
  if (path === "/" || path === "/index.html") {
    const p = new URLSearchParams(search);
    if (MAP_PARAMS.some((k) => p.has(k))) return { page: "map", canonical: `${MAP_PATH}${search}` };   // 예전 '/?mode=…' 링크
    return { page: "landing", canonical: path === "/" && pathname === "/" ? null : HOME_PATH };
  }
  return { page: "landing", canonical: HOME_PATH };   // 모르는 경로는 홈으로
}

/** 랜딩의 모드 버튼이 가는 지도 주소 */
export function mapHref(mode: "owner" | "founder"): string {
  return `${MAP_PATH}?mode=${mode}`;
}

/** 안에서 이동해도 되는 주소인가 — 같은 사이트의 경로('/…')만(외부 주소·'//host'·javascript: 는 막는다). */
export function isInternalPath(to: string): boolean {
  return /^\/(?!\/)/.test(to);
}
