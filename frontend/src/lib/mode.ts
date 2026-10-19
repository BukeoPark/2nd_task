// 이용 모드 — 자영업자(내 가게를 점검) / 예비 창업자(후보 지역·업종을 고름). 모드에 따라 이용 순서 안내와 매장 상세의 구성이 달라진다.
// 랜딩페이지는 주소에 ?mode=owner|founder 를 붙여 보내고, 사용자가 고른 모드는 이 브라우저에 기억한다.
// 다른 모듈을 import 하지 않는 순수 함수(tests/mode.test.ts).

export type Mode = "owner" | "founder";

export const MODES: Mode[] = ["owner", "founder"];
export const DEFAULT_MODE: Mode = "owner";
export const MODE_STORAGE_KEY = "appMode:v1";

export const MODE_LABEL: Record<Mode, string> = { owner: "자영업자", founder: "예비 창업자" };
export const MODE_HINT: Record<Mode, string> = {
  owner: "운영 중인 내 가게를 상권 평균과 견줘 봅니다",
  founder: "창업을 고민하는 지역·업종의 후보를 비교합니다",
};

export function isMode(v: unknown): v is Mode {
  return v === "owner" || v === "founder";
}

/** 주소의 검색 문자열(?mode=...)에서 모드를 읽는다. 없거나 모르는 값이면 null. */
export function parseMode(search: string): Mode | null {
  const v = new URLSearchParams(search).get("mode");
  return isMode(v) ? v : null;
}

/** 주소의 모드 > 이 브라우저에 기억한 모드 > 기본(자영업자) 순으로 정한다. */
export function resolveMode(search: string, stored: string | null): Mode {
  return parseMode(search) ?? (isMode(stored) ? stored : DEFAULT_MODE);
}

/** 모드를 바꾼 주소의 검색 문자열 — 다른 검색 값은 그대로 두고 mode 만 바꾼다. */
export function withMode(search: string, mode: Mode): string {
  const p = new URLSearchParams(search);
  p.set("mode", mode);
  return `?${p.toString()}`;
}
