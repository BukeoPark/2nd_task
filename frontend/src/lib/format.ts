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
