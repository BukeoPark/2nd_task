// 매장 상세의 모든 블록이 '어느 범위의 정보인지' — 이 매장 / 주변(반경) / 소속 상권 / 내 입력.
// 이 네 가지가 상세 패널을 나누는 묶음이고, 범위 라벨 색과 이후 레일 메뉴가 같은 값을 쓴다.
// 다른 모듈을 import 하지 않는 순수 데이터(tests/scope.test.ts).

export type ScopeKind = "store" | "radius" | "area" | "mine";

/** 묶음 이름(레일 메뉴 글자와 같다). */
export const SCOPE_GROUP: Record<ScopeKind, string> = {
  store: "이 매장",
  radius: "주변",
  area: "상권",
  mine: "내 가게",
};

/** 라벨 색 — 배경(bg)은 옅게, 글자(fg)는 같은 계열의 진한 색(흰 배경·옅은 배경 모두 대비 4.5:1 이상). */
export const SCOPE_STYLE: Record<ScopeKind, { bg: string; fg: string }> = {
  store: { bg: "#F3F4F6", fg: "#374151" },
  radius: { bg: "#DBEAFE", fg: "#1E3A8A" },
  area: { bg: "#F3E8FF", fg: "#6B21A8" },
  mine: { bg: "#FEF3C7", fg: "#92400E" },
};

export const SCOPE_ORDER: ScopeKind[] = ["store", "radius", "area", "mine"];
