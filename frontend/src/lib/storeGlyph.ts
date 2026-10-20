// 지도의 매장 점 모양 — 서울시 외식 업종(10개)마다 알아보기 쉬운 작은 이모티콘을 쓴다. 모두 같은 색 점이면 업종이 헷갈리기 때문이다.
// 업종 대응이 없는 세부 업종(외국식·구내식당·뷔페 등)은 일반 식당 모양을 쓴다. 이모티콘 하나로 정확히 담기지 않는 업종(자장면 등)은 가장 가까운 모양을 쓴다.
// 다른 모듈을 import 하지 않는 순수 데이터(tests/storeGlyph.test.ts).

export interface StoreGlyph {
  /** 점 안에 그리는 이모티콘 */
  glyph: string;
  /** 범례·툴팁에 쓰는 이름 */
  label: string;
}

/** 서울시 외식 업종 코드 → 모양. 코드·이름은 /api/food/categories 와 같다. */
export const SVC_GLYPHS: Record<string, StoreGlyph> = {
  CS100001: { glyph: "🍚", label: "한식" },
  CS100002: { glyph: "🍜", label: "중식" },
  CS100003: { glyph: "🍣", label: "일식" },
  CS100004: { glyph: "🍝", label: "양식" },
  CS100005: { glyph: "🥐", label: "제과·베이커리" },
  CS100006: { glyph: "🍔", label: "패스트푸드" },
  CS100007: { glyph: "🍗", label: "치킨" },
  CS100008: { glyph: "🍢", label: "분식" },
  CS100009: { glyph: "🍺", label: "호프·주점" },
  CS100010: { glyph: "☕", label: "커피·음료" },
};

export const FALLBACK_GLYPH: StoreGlyph = { glyph: "🍽️", label: "기타 음식점" };

export function glyphFor(svc: string | null | undefined): StoreGlyph {
  return (svc && SVC_GLYPHS[svc]) || FALLBACK_GLYPH;
}

/** 범례에 늘어놓는 순서(서울시 업종 코드 순 + 기타). */
export const LEGEND_GLYPHS: StoreGlyph[] = [...Object.keys(SVC_GLYPHS).sort().map((k) => SVC_GLYPHS[k]), FALLBACK_GLYPH];

/** 점 크기(px)에 맞는 이모티콘 글자 크기 — 너무 작으면 알아볼 수 없어 하한을 둔다. */
export function glyphFontSize(pointSize: number): number {
  return Math.max(9, Math.round(pointSize * 0.62));
}
