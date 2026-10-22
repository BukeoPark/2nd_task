// 행정동·상권 종합분석 패널의 레일 메뉴 — 어떤 항목이 어떤 순서로 있는지.
// 요약(핵심 카드·기준 안내·지도 버튼)이 첫 항목이고, 항목은 한 번에 하나씩 보인다. 어느 항목이든 맨 위에 어떤 상권인지가 나온다.
// 예비 창업자 모드에는 '비용 점검'(내가 입력한 비용으로 손익분기)이 더 있다.
// 다른 모듈을 import 하지 않는 순수 데이터(tests/areaTabs.test.ts).

export type AreaTabId = "summary" | "type" | "growth" | "stability" | "demand" | "location" | "cost" | "trdars" | "stores";

export const AREA_TAB_LABEL: Record<AreaTabId, string> = {
  summary: "요약",
  type: "유형",
  growth: "매출 흐름",
  stability: "경쟁·개폐업",
  demand: "소비 수요",
  location: "주변 환경",
  cost: "비용·임대",
  trdars: "세부 상권",
  stores: "매장 목록",
};

/** 항목별 색 — 레일에서 고른 항목과 내용 맨 위 제목이 같은 색이다(배경은 옅게, 글자는 같은 계열의 진한 색). */
export const AREA_TAB_STYLE: Record<AreaTabId, { bg: string; fg: string }> = {
  summary: { bg: "#E0E7FF", fg: "#3730A3" },
  type: { bg: "#EDE9FE", fg: "#5B21B6" },
  growth: { bg: "#DCFCE7", fg: "#166534" },
  stability: { bg: "#DBEAFE", fg: "#1D4ED8" },
  demand: { bg: "#FEF3C7", fg: "#92400E" },
  location: { bg: "#FFE4E6", fg: "#BE123C" },
  cost: { bg: "#ECFCCB", fg: "#3F6212" },
  trdars: { bg: "#F3E8FF", fg: "#6B21A8" },
  stores: { bg: "#CCFBF1", fg: "#0F766E" },
};

/** 항목마다 사용자가 궁금해하는 질문 — 전문 용어 대신 제목으로 쓴다(자세한 지표 이름은 제목 아래 작은 글씨로 남긴다). 모드마다 묻는 관점이 다르다. */
export const AREA_QUESTION: Record<AreaTabId, { owner: string; founder: string }> = {
  summary: { owner: "우리 지역 상권은 지금 어떤 상태일까?", founder: "이 지역은 지금 어떤 상태일까?" },
  type: { owner: "우리 지역은 어떤 성격의 상권일까?", founder: "이 지역은 어떤 성격의 상권일까?" },
  growth: { owner: "우리 상권 매출은 늘고 있을까, 줄고 있을까?", founder: "이 지역 매출은 늘고 있을까?" },
  stability: { owner: "가게가 얼마나 모여 있고, 어떻게 바뀔까?", founder: "가게가 얼마나 모여 있고, 어떻게 바뀔까?" },
  demand: { owner: "손님이 언제 많이 오갈까?", founder: "사람들은 언제, 얼마나 오갈까?" },
  location: { owner: "교통과 주변 시설은 어떨까?", founder: "교통과 주변 시설은 어떨까?" },
  cost: { owner: "주변 임대시장 상황은 어떨까?", founder: "창업 비용과 임대시장 상황은 어떨까?" },
  trdars: { owner: "이 행정동 안에는 어떤 상권이 있을까?", founder: "이 행정동 안에는 어떤 상권이 있을까?" },
  stores: { owner: "이 지역에는 어떤 가게들이 있을까?", founder: "이 지역에는 어떤 가게들이 있을까?" },
};

/** 레일 항목과 순서 — 모드마다 먼저 궁금한 것이 다르다.
 *  · 자영업자(우리 가게 장사 점검): 경쟁·개폐업 → 소비 수요 → 매출 흐름 → 입지·교통
 *  · 예비 창업자(창업할 자리 찾기): 매출 흐름 → 경쟁·개폐업 → 소비 수요 → 입지·교통 → 비용 점검
 * 세부 상권은 행정동에서만 있다(상권 안에는 하위 상권이 없다). 매장 목록은 항상 마지막, 요약은 항상 첫 항목. */
export function areaTabsFor(level: "dong" | "trdar", mode: "owner" | "founder" = "owner"): AreaTabId[] {
  const body: AreaTabId[] = mode === "founder"
    ? ["growth", "stability", "demand", "location", "cost"]
    : ["stability", "demand", "growth", "location", "cost"];
  return level === "dong" ? ["summary", ...body, "trdars", "stores"] : ["summary", ...body, "stores"];
}
