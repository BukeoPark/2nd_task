/** 외식 지도 화면에 쓰는 문구 — 계산 범위·값 없음 사유. 다른 모듈을 import 하지 않는 순수 함수(npm test 로 검증). */

export interface CoverageLike {
  used: number;
  total: number;
  excluded_sales_share: number | null;
}

/** 일부 업종 집단만 계산에 썼을 때의 범위 문구(전체를 썼으면 null). 전체 평균으로 오해하지 않게 화면에 그대로 보인다. */
export function coverageText(c: CoverageLike | null | undefined): string | null {
  if (!c || c.total === 0 || c.used >= c.total) return null;
  const share = c.excluded_sales_share === null ? "" : `, 제외된 업종 매출 ${(c.excluded_sales_share * 100).toFixed(0)}%`;
  return `업종 ${c.total}개 중 ${c.used}개만 반영(필요한 값이 비어 있는 업종은 제외${share})`;
}

/** 값이 없는 이유 문구 — 사유 코드가 서버 목록에 없으면 '자료 없음'으로만 말하고 추측하지 않는다. */
export function reasonText(reason: string | null | undefined, reasons: Record<string, string> | undefined): string {
  return (reason && reasons?.[reason]) || "자료 없음";
}

/** 지표 숫자 옆에 항상 붙는 업종 범위 줄 — '커피-음료 전체 기준' */
export function scopeLine(label: string, metricScope: string): string {
  return `${label}: ${metricScope}`;
}
