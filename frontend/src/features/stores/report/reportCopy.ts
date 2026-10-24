/** 카드에는 짧은 문구를 쓰고 원문은 제목 속성에 남긴다. 숫자·단위를 자르지 않는다. */
export function shortReportLabel(text: string): string {
  const named: Record<string,string> = {
    "점포당 월평균 추정매출 전년 동기 대비":"점포당 매출 증감",
    "유동인구 지수 전년 동기 대비":"유동인구 증감",
    "총매출 전년 동기 대비":"총매출 증감",
    "최근 5년 폐업 가게 영업 기간(중앙값)":"폐업 가게 영업기간",
    "영업 중 가게 업력(중앙값)":"영업 중 가게 업력",
  };
  return named[text] ?? text.replace(/\([^)]*\)/g, "").trim().replace("점포당 월평균 추정매출", "월평균 추정매출");
}
export function shortReportNote(text:string):string {
  if (/조사값이 없|조사자료.*없/.test(text)) return "해당 분기 조사자료 없음";
  if (/5곳 미만/.test(text)) return "표본 5곳 미만 · 참고용";
  if (/매출.*예측|개별.*매출.*아/.test(text)) return "상권 평균 · 개별 매출과 다름";
  const first = text.split(" · ")[0].replace(/\([^)]*\)/g, "").trim();
  return first.length <= 32 ? first : "집계 기준은 상세 설명에서 확인";
}
