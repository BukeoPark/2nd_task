/** 브라우저 PDF 저장 대화상자의 기본 파일명(확장자는 브라우저가 붙인다). */
export function reportFilename(area: string, industry?: string | null): string {
  const clean = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
  const region = clean(area) || "지역";
  const category = clean((industry ?? "외식").replace(/\s*전체\s*$/, "")) || "외식";
  return `${region} ${category} 상권분석 보고서`;
}
