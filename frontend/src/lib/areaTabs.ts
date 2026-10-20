// 행정동·상권 종합분석 패널의 레일 메뉴 — 어떤 항목이 어떤 순서로 있는지.
// 요약(핵심 카드·기준 안내·지도 버튼)이 첫 항목이고, 항목은 한 번에 하나씩 보인다. 어느 항목이든 맨 위에 어떤 상권인지가 나온다.
// 다른 모듈을 import 하지 않는 순수 데이터(tests/areaTabs.test.ts).

export type AreaTabId = "summary" | "type" | "traits" | "growth" | "stability" | "demand" | "location" | "trdars" | "stores";

export const AREA_TAB_LABEL: Record<AreaTabId, string> = {
  summary: "요약",
  type: "유형",
  traits: "특성",
  growth: "성장성",
  stability: "안정·경쟁",
  demand: "소비 수요",
  location: "입지",
  trdars: "세부 상권",
  stores: "매장 목록",
};

/** 항목별 색 — 레일에서 고른 항목과 내용 맨 위 제목이 같은 색이다(배경은 옅게, 글자는 같은 계열의 진한 색). */
export const AREA_TAB_STYLE: Record<AreaTabId, { bg: string; fg: string }> = {
  summary: { bg: "#E0E7FF", fg: "#3730A3" },
  type: { bg: "#EDE9FE", fg: "#5B21B6" },
  traits: { bg: "#E0F2FE", fg: "#075985" },
  growth: { bg: "#DCFCE7", fg: "#166534" },
  stability: { bg: "#DBEAFE", fg: "#1D4ED8" },
  demand: { bg: "#FEF3C7", fg: "#92400E" },
  location: { bg: "#FFE4E6", fg: "#BE123C" },
  trdars: { bg: "#F3E8FF", fg: "#6B21A8" },
  stores: { bg: "#CCFBF1", fg: "#0F766E" },
};

/** 레일 항목. 세부 상권은 행정동에서만 있다(상권 안에는 하위 상권이 없다). */
export function areaTabsFor(level: "dong" | "trdar"): AreaTabId[] {
  const base: AreaTabId[] = ["summary", "type", "traits", "growth", "stability", "demand", "location"];
  return level === "dong" ? [...base, "trdars", "stores"] : [...base, "stores"];
}
