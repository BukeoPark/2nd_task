// 매장 상세의 접히는 섹션 id 와, 다른 곳(요약)에서 그 섹션을 펼치며 이동하는 헬퍼.
export const SECTION_IDS = {
  sales: "sec-sales",
  checkup: "sec-checkup",
} as const;

/** 접혀 있는 섹션을 펼치고 그 위치로 이동한다. */
export function openSection(id: string): void {
  const el = document.getElementById(id);
  const details = el?.querySelector("details");
  if (details) details.open = true;
  el?.scrollIntoView({ behavior: "smooth", block: "start" });
}
