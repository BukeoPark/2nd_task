// 랜딩에서 지도 앱으로 가는 주소 — 모드(?mode=)를 붙여 지도가 그 모드로 열리게 한다(frontend/src/lib/mode.ts 와 같은 값).
// 다른 모듈을 import 하지 않는 순수 함수(tests/links.test.ts).

export type Mode = "owner" | "founder";

export const DEFAULT_APP_URL = "http://localhost:5173";

/** 지도 앱 주소(NEXT_PUBLIC_APP_URL). 끝의 슬래시와 공백은 정리하고, 비어 있으면 로컬 개발 주소를 쓴다. */
export function normalizeAppUrl(raw: string | undefined): string {
  const v = (raw ?? "").trim().replace(/\/+$/, "");
  return v === "" ? DEFAULT_APP_URL : v;
}

export function appLink(base: string, mode: Mode): string {
  return `${normalizeAppUrl(base)}/?mode=${mode}`;
}
