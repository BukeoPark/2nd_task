// 선택한 매장 주변의 같은 업종 매장 목록 — 지도 점(/api/food/stores)을 반경으로 걸러 거리순으로 나열한다.
// 새 자료·계산식 없이 이미 있는 매장 좌표만 쓴다. 영업 여부·리뷰·평점은 여기서 만들지 않는다(영업 상태는 인허가 기록을 매장 상세에서 읽어 온다).
// 다른 모듈을 import 하지 않는 순수 함수(tests/competitors.test.ts).

export interface PointLike { store_id: string; name: string; branch: string | null; category: string; svc: string | null; lon: number; lat: number }

export interface Competitor extends PointLike { distance_m: number }

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;

/** 두 좌표 사이 직선거리(m, 구면). */
export function distanceM(a: { lon: number; lat: number }, b: { lon: number; lat: number }): number {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 반경을 감싸는 사각형(지도 점 조회용). 조회는 사각형이고 실제 거름은 distanceM 으로 한다. */
export function radiusBounds(center: { lon: number; lat: number }, radiusM: number): { minLon: number; minLat: number; maxLon: number; maxLat: number } {
  const dLat = (radiusM / R) * (180 / Math.PI);
  const dLon = dLat / Math.max(0.01, Math.cos(rad(center.lat)));
  return { minLon: center.lon - dLon, minLat: center.lat - dLat, maxLon: center.lon + dLon, maxLat: center.lat + dLat };
}

/** 반경 안 매장(자기 자신 제외)을 가까운 순으로. 같은 거리는 id 순으로 항상 같은 결과. */
export function withinRadius(points: PointLike[], center: { lon: number; lat: number }, radiusM: number, selfId: string): Competitor[] {
  return points
    .filter((p) => p.store_id !== selfId)
    .map((p) => ({ ...p, distance_m: Math.round(distanceM(center, p)) }))
    .filter((p) => p.distance_m <= radiusM)
    .sort((a, b) => a.distance_m - b.distance_m || a.store_id.localeCompare(b.store_id));
}

export type CompetitorSort = "distance" | "category";

/** 세부 업종별로 묶는다 — 묶음은 매장이 많은 순(같으면 이름 순), 묶음 안은 가까운 순. */
export function groupByCategory(list: Competitor[]): { category: string; items: Competitor[] }[] {
  const m = new Map<string, Competitor[]>();
  for (const c of list) m.set(c.category, [...(m.get(c.category) ?? []), c]);
  return [...m.entries()]
    .map(([category, items]) => ({ category, items }))
    .sort((a, b) => b.items.length - a.items.length || a.category.localeCompare(b.category, "ko"));
}

/** 거리를 읽기 쉽게: 100m 미만은 그대로, 이상은 10m 단위로 반올림하지 않고 'm' 로(1km 이상은 km). */
export function distanceLabel(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m)}m`;
}
