// 행정동·상권 종합분석 패널의 레일 메뉴 — 어떤 항목이 어떤 순서로 있는지.
// 상단 요약 카드·기준 안내는 레일과 상관없이 항상 위에 보이고, 아래 항목만 한 번에 하나씩 보인다.
// 다른 모듈을 import 하지 않는 순수 데이터(tests/areaTabs.test.ts).

export type AreaTabId = "growth" | "stability" | "demand" | "location" | "trdars" | "stores";

export const AREA_TAB_LABEL: Record<AreaTabId, string> = {
  growth: "성장성",
  stability: "안정·경쟁",
  demand: "소비 수요",
  location: "입지",
  trdars: "세부 상권",
  stores: "매장 목록",
};

/** 레일 항목. 세부 상권은 행정동에서만 있다(상권 안에는 하위 상권이 없다). */
export function areaTabsFor(level: "dong" | "trdar"): AreaTabId[] {
  const base: AreaTabId[] = ["growth", "stability", "demand", "location"];
  return level === "dong" ? [...base, "trdars", "stores"] : [...base, "stores"];
}
