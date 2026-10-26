// 매장 상세의 모든 블록이 '어느 범위의 정보인지' — 이 매장 / 주변 환경(반경) / 경쟁(반경) / 소속 상권 / 내 입력.
// 이 다섯 가지가 상세 패널을 나누는 묶음이고, 범위 라벨 색과 이후 레일 메뉴가 같은 값을 쓴다.
// 다른 모듈을 import 하지 않는 순수 데이터(tests/scope.test.ts).

export type ScopeKind = "store" | "radius" | "compete" | "area" | "mine";

/** 묶음 이름(레일 메뉴 글자와 같다). */
export const SCOPE_GROUP: Record<ScopeKind, string> = {
  store: "이 매장",
  radius: "주변 환경",
  compete: "경쟁",
  area: "상권",
  mine: "내 가게",
};

/** 라벨 색 — 배경(bg)은 옅게, 글자(fg)는 같은 계열의 진한 색(흰 배경·옅은 배경 모두 대비 4.5:1 이상). */
export const SCOPE_STYLE: Record<ScopeKind, { bg: string; fg: string }> = {
  store: { bg: "#DCFCE7", fg: "#166534" },
  radius: { bg: "#FFE4E6", fg: "#BE123C" },
  compete: { bg: "#DBEAFE", fg: "#1D4ED8" },
  area: { bg: "#F3E8FF", fg: "#6B21A8" },
  mine: { bg: "#FEF3C7", fg: "#92400E" },
};

/** 묶음 맨 위 제목 — 상권 페이지(lib/areaTabs 의 AREA_QUESTION)처럼 궁금한 것을 질문으로 묻는다. 주변 환경·경쟁은 상권 페이지의 같은 이름 항목과 색·아이콘이 같다. */
export const SCOPE_QUESTION: Record<ScopeKind, string> = {
  store: "이 매장은 지금 어떤 상태일까?",
  radius: "이 매장 주변 교통과 시설은 어떨까?",
  compete: "주변 같은 업종 가게는 얼마나 있을까?",
  area: "이 매장이 속한 상권은 어떨까?",
  mine: "내 가게 매출과 비용은 어떨까?",
};

export const SCOPE_ORDER: ScopeKind[] = ["store", "radius", "compete", "area", "mine"];
