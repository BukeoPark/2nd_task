// 매장 상세 헤더 아래 '요약 칩' — 매장 주변·소속 상권의 핵심 사실 몇 개를 한 줄로.
// 점수·좋고 나쁨 판정은 만들지 않고 값 그대로만 말한다. 자료가 없으면 칩을 만들지 않는다(0 이나 '자료 없음' 칩을 대신 두지 않는다).
// 영업 상태·업력은 바로 위 카드가 이미 보여 주므로 여기서 반복하지 않는다. 다른 모듈을 import 하지 않는 순수 함수(tests/summaryChips.test.ts).

export type ChipScope = "radius" | "area";

export interface Chip {
  key: string;
  text: string;
  scope: ChipScope;
}

export interface ChipInput {
  /** 반경 안 같은 소분류 점포 수(선택 매장 제외). 모르면 null */
  sameCategory: { level: string; count: number; radiusM: number } | null;
  /** 앵커 브랜드별 가장 가까운 곳까지 직선거리(m). 거리를 모르면 그 브랜드는 칩을 만들지 않는다 */
  anchors: { brand: string; label: string; nearestM: number | null }[] | null;
  /** 소속 상권(없으면 행정동) */
  area: { name: string; kind: string } | null;
}

export function distanceText(m: number): string {
  return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;
}

export function radiusText(m: number): string {
  return m >= 1000 ? `${m / 1000}km` : `${m}m`;
}

export function buildChips(i: ChipInput): Chip[] {
  const chips: Chip[] = [];
  if (i.sameCategory) {
    chips.push({ key: "same", text: `반경 ${radiusText(i.sameCategory.radiusM)} 같은 ${i.sameCategory.level} ${i.sameCategory.count.toLocaleString("ko-KR")}곳`, scope: "radius" });
  }
  for (const a of i.anchors ?? []) {
    if (a.nearestM !== null && Number.isFinite(a.nearestM)) chips.push({ key: `anchor-${a.brand}`, text: `${a.label} ${distanceText(a.nearestM)}`, scope: "radius" });
  }
  if (i.area) chips.push({ key: "area", text: `소속 ${i.area.name} (${i.area.kind})`, scope: "area" });
  return chips;
}
