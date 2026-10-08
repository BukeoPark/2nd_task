export function formatDistance(m: number | null): string {
  if (m === null) return "정보 없음";
  return m < 1000 ? `${m.toFixed(0)}m` : `${(m / 1000).toFixed(1)}km`;
}

export function formatWon(value: number | null): string {
  if (value === null) return "정보 없음";
  return `${(value / 1e8).toLocaleString("ko-KR", { maximumFractionDigits: 0 })}억원`;
}

export function formatCount(value: number | null, unit = "개"): string {
  if (value === null) return "정보 없음";
  return `${Math.round(value).toLocaleString("ko-KR")}${unit}`;
}

export function formatPercent(value: number | null): string {
  if (value === null) return "정보 없음";
  return `${value.toFixed(1)}%`;
}

export function formatPerArea(value: number | null): string {
  if (value === null) return "정보 없음";
  return `${value.toFixed(1)}천원/㎡`;
}

/** 금액을 억/만원 단위로 짧게. 1억 이상은 소수 한 자리 억원, 그 아래는 만원. */
export function formatKrw(value: number | null | undefined): string {
  if (value === null || value === undefined) return "정보 없음";
  if (Math.abs(value) >= 1e8) return `${(value / 1e8).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}억원`;
  return `${Math.round(value / 1e4).toLocaleString("ko-KR")}만원`;
}

/** 증감률(%) — 부호를 붙이고, 값이 없으면 '비교 불가'. */
export function formatSignedPct(value: number | null | undefined): string {
  if (value === null || value === undefined) return "비교 불가";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

/** '3,500' 같은 만원 단위 입력을 원 단위로. 비었거나 숫자가 아니면 null. */
export function parseManwon(input: string): number | null {
  const s = input.replace(/,/g, "").trim();
  if (s === "") return null;
  const v = Number(s) * 1e4;
  return Number.isFinite(v) && v >= 0 ? v : null;
}

/** 외식 지도 버블 안 숫자. */
export function formatMetric(kind: string, value: number | null): string {
  if (value === null) return "자료 없음";
  if (kind === "count") return `${value.toLocaleString("ko-KR")}곳`;
  if (kind === "money") return formatKrw(value);
  if (kind === "growth") return formatSignedPct(value);
  return `${value.toFixed(1)}%`;
}
