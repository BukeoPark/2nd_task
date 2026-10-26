// 상권·행정동 '집객시설'에서 이름까지 보여 줄 대표 시설을 고른다 — 보고서의 시설 지도(report-extras 의 facility_map)와 같은 값이다.
// 병원·의원은 수가 많고 대부분 개인의원이라 빼고, 규모가 큰 곳만 '중형병원'(병원급 의료기관)·'대형병원'(종합병원)으로 보인다. 은행·약국과 앵커 브랜드(스타벅스·다이소·올리브영, 스세권·다세권에서 따로 봄)도 뺀다.
// 서버의 '병원' 종류에는 의원·한의원·치과의원이 섞여 있어서, 이름이 '병원'으로 끝나는 곳(병원·한방병원·치과병원·요양병원 등 병원급)만 중형병원으로 센다.
// 다른 모듈을 import 하지 않는 순수 함수(tests/areaFacilityNames.test.ts).

export interface FacilityPoint { name: string; category: string }

/** 이름으로 보일 종류와 순서(앞일수록 먼저) */
export const NAMED_CATEGORY_ORDER = ["백화점", "복합쇼핑몰", "대형마트", "영화관", "문화시설", "대형병원", "중형병원"] as const;
export type NamedCategory = (typeof NAMED_CATEGORY_ORDER)[number];

/** 서버 종류 + 이름 → 화면에 보일 종류(대표 시설이 아니면 null). */
export function displayCategory(p: FacilityPoint): NamedCategory | null {
  if (p.category === "종합병원") return "대형병원";
  if (p.category === "병원") return p.name.trim().endsWith("병원") ? "중형병원" : null;
  return (NAMED_CATEGORY_ORDER as readonly string[]).includes(p.category) ? (p.category as NamedCategory) : null;
}

export function namedFacilities<T extends FacilityPoint>(points: readonly T[] | null | undefined): (T & { shown: NamedCategory })[] {
  const rank = new Map<string, number>(NAMED_CATEGORY_ORDER.map((c, i) => [c, i]));
  const out: (T & { shown: NamedCategory })[] = [];
  for (const p of points ?? []) { const shown = displayCategory(p); if (shown) out.push({ ...p, shown }); }
  return out.sort((a, b) => (rank.get(a.shown) as number) - (rank.get(b.shown) as number) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));   // 로캘에 따라 순서가 달라지지 않게 글자 코드 순
}

/** 종류별 개수(개수 표에 쓴다). */
export function namedCounts(points: readonly FacilityPoint[] | null | undefined): Partial<Record<NamedCategory, number>> {
  const c: Partial<Record<NamedCategory, number>> = {};
  for (const p of namedFacilities(points)) c[p.shown] = (c[p.shown] ?? 0) + 1;
  return c;
}
