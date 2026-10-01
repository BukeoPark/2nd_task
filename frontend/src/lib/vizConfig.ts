/** 버블 크기·색 기준 — 지도 레이어와 범례가 항상 이 상수만 참조하도록 한 곳에 모은다. */

export const BUBBLE_MIN_RADIUS_PX = 4;
export const BUBBLE_MAX_RADIUS_PX = 26;

/** 면적이 값에 비례하도록 sqrt 스케일(표준 버블차트 관례)로 반지름을 계산한다. */
export function storeCountToRadiusPx(count: number, maxCount: number): number {
  if (maxCount <= 0 || count <= 0) return BUBBLE_MIN_RADIUS_PX;
  const ratio = Math.sqrt(count / maxCount);
  return BUBBLE_MIN_RADIUS_PX + ratio * (BUBBLE_MAX_RADIUS_PX - BUBBLE_MIN_RADIUS_PX);
}

export const ZONE_COLORS = {
  starbucks: "#00704A", // 스타벅스 브랜드 그린 = 스세권
  daiso: "#E4002B", // 다이소 브랜드 레드 = 다세권
  base: "#3B82F6", // 앵커 존 밖(기본 점포 밀도) = 파랑
} as const;

/** 카카오맵이 내부적으로 그리는 SVG 레이어(z-index 미지정)보다 위에 뜨도록,
 * 지도 위 플로팅 UI(컨트롤·범례·상세패널)는 전부 이 값을 z-index 로 쓴다. */
export const OVERLAY_Z_INDEX = 10;

export const REGION_OUTLINE = {
  strokeColor: "#374151",
  strokeWeight: 1.5,
  strokeOpacity: 0.6,
  fillColor: "#374151",
  fillOpacity: 0.02,
} as const;

// 상승/하강/보합 3색 — 지도(전년 동기 대비 추정매출)와 행정동 분기 추이 점(상권변화지표)이 같은 색을 쓴다.
export const TREND_COLORS = {
  up: "#EF4444",
  down: "#3B82F6",
  flat: "#9CA3AF",
} as const;

/** 전년 동기 대비 증감률이 ±이 값(%) 안이면 보합으로 본다. */
export const SALES_FLAT_PCT = 3;

export function salesGrowthToColor(pct: number | null | undefined): string {
  if (pct === null || pct === undefined) return "#e5e7eb";
  if (pct >= SALES_FLAT_PCT) return TREND_COLORS.up;
  if (pct <= -SALES_FLAT_PCT) return TREND_COLORS.down;
  return TREND_COLORS.flat;
}

// 상권변화지표(TRDAR_CHNGE_IX): LH(상권확장)=상승, HL(상권축소)=하강, HH(정체)·LL(다이나믹)·결측=보합.
export function changeIndexToTrendColor(changeIndex: string | null | undefined): string {
  if (changeIndex === "LH") return TREND_COLORS.up;
  if (changeIndex === "HL") return TREND_COLORS.down;
  return TREND_COLORS.flat;
}

// R-ONE 임대동향 상권 포인트 마커
export const REB_ZONE_COLOR = "#7C3AED";
export const REB_ZONE_MIN_RADIUS_PX = 8;
export const REB_ZONE_MAX_RADIUS_PX = 20;

export function rentToRadiusPx(rentPerM2: number | null, maxRent: number): number {
  if (rentPerM2 === null || maxRent <= 0) return REB_ZONE_MIN_RADIUS_PX;
  const ratio = Math.sqrt(rentPerM2 / maxRent);
  return REB_ZONE_MIN_RADIUS_PX + ratio * (REB_ZONE_MAX_RADIUS_PX - REB_ZONE_MIN_RADIUS_PX);
}
