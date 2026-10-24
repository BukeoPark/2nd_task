/** 화면에 사용하는 비중·공통축. 자료 없음은 0으로 바꾸지 않는다. */
export function populationShares(residents: number | null | undefined, workers: number | null | undefined) {
  if (residents == null || workers == null || !Number.isFinite(residents) || !Number.isFinite(workers) || residents < 0 || workers < 0 || residents + workers <= 0) return null;
  const residentPct = residents / (residents + workers) * 100;
  return { residentPct, workerPct: 100 - residentPct };
}

export function breakevenScale(bep: number, revenue: number | null) {
  if (!Number.isFinite(bep) || bep < 0 || (revenue != null && (!Number.isFinite(revenue) || revenue < 0))) return null;
  const ceiling = Math.max(bep, revenue ?? 0, 1) * 1.2;
  return { targetPct: bep / ceiling * 100, revenuePct: revenue == null ? null : revenue / ceiling * 100, gap: revenue == null ? null : revenue - bep };
}
