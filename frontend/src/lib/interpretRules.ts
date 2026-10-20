// 요약 해석(areaBrief)이 리포트(areaLens·areaReport·insightReport)와 같은 말을 하도록 맞춘 공통 규칙 — 임계값을 한 곳에 둔다.
//  · 눈에 띄게 높다: 기준값의 1.25배 이상(areaLens 의 CLEAR_MARGIN). 조금 넘는 정도는 '높다'고 하지 않는다.
//  · 증감 부호: 0 보다 크면 늘었고 작으면 줄었다(areaLens 와 같음). 변화 폭이 1% 미만이면 '작다'고 덧붙이기만 한다.
//  · 표본 점포: 서울시 집계 최근 분기 점포 수, 없으면 상가정보 점포 수(areaReport 의 unitSample 과 같은 기준).
// 값이 drift 하지 않도록 tests/interpretRules.test.ts 가 areaLens·insightReport 의 원문 상수와 맞는지 확인한다. 다른 모듈은 import 하지 않는다.

export const CLEAR_MARGIN = 1.25;
/** 변화 폭이 이보다 작으면 문장에 '변화 폭이 작습니다'를 덧붙인다(증감 방향 자체는 부호를 따른다). */
export const SMALL_CHANGE_PCT = 1;

export const clearlyHigher = (v: number | null | undefined, ref: number | null | undefined): boolean =>
  v != null && ref != null && ref > 0 && v >= ref * CLEAR_MARGIN;

/** 전년 동기 증감(%) → '늘었습니다/줄었습니다/같습니다' */
export function yoyWord(v: number): string {
  return v > 0 ? "늘었습니다" : v < 0 ? "줄었습니다" : "같습니다";
}

/** 개업률·폐업률 비교 문장 조각 — 눈에 띄게 차이 날 때만 방향을 말한다. */
export function openCloseRelation(open: number, close: number): "close_higher" | "open_higher" | "similar" {
  if (clearlyHigher(close, open)) return "close_higher";
  if (clearlyHigher(open, close)) return "open_higher";
  return "similar";
}

/** 표본 점포 수 — areaReport 의 unitSample 과 같은 순서(서울시 집계 최근 분기 → 상가정보). */
export function unitSampleStores(trend: { stores: number | null }[], sbizStores: number | null): number | null {
  const withStores = trend.filter((t) => t.stores !== null);
  return withStores.length ? (withStores.at(-1)?.stores as number) : sbizStores;
}
