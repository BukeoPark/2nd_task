// 내 가게 월 매출 기록 vs 동네(상권·행정동) 같은 업종 점포당 평균 — 수준이 아니라 '변화율'을 비교한다.
// 서울시 추정매출은 카드 결제 기반이라 현금·배달 매출이 섞인 사장님 매출과 수준 비교는 부정확하지만, 같은 기간의 변화 방향은 견줄 수 있다.
// 다른 모듈을 import 하지 않는 순수 함수(tests/checkup.test.ts).

export interface BenchPoint {
  quarter: string; // "20262" = 2026년 2분기
  per_store_month: number | null; // 원
}

export interface QuarterRow {
  quarter: string;
  mine: number; // 원 — 그 분기에 기록한 달들의 월평균
  months: number; // 기록한 달 수(1~3)
  bench: number | null; // 원 — 동네 같은 업종 점포당 월평균. 서울시가 아직 공개하지 않은 분기는 null
}

export type Verdict = "insufficient" | "lagging" | "similar" | "leading";

export interface Checkup {
  verdict: Verdict;
  basis: "yoy" | "since" | null; // yoy = 전년 같은 분기, since = 가장 가까운 이전 기록 분기
  from: string | null;
  to: string | null;
  myChangePct: number | null;
  benchChangePct: number | null;
  gapPp: number | null; // 내 변화율 − 동네 변화율 (%p)
  partial: boolean; // 비교한 분기 중 기록이 3개월 미만인 분기가 있음
}

/** 동네와 이 값(%p) 이상 차이 나야 '더 낮아짐/더 높아짐'으로 말한다. 그 안쪽은 비슷한 흐름으로 본다. */
export const GAP_PP = 5;

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function quarterOf(month: string): string | null {
  const m = MONTH_RE.exec(month);
  return m ? `${m[1]}${Math.ceil(Number(m[2]) / 3)}` : null;
}

export function quarterLabel(q: string): string {
  return `${q.slice(2, 4)}.${q[4]}Q`;
}

export function shiftQuarter(q: string, delta: number): string {
  const idx = Number(q.slice(0, 4)) * 4 + (Number(q[4]) - 1) + delta;
  return `${Math.floor(idx / 4)}${(idx % 4) + 1}`;
}

/** 월별 매출(만원) → 분기별 월평균(원). 형식이 틀린 달·음수·숫자가 아닌 값은 버린다. */
export function buildRows(months: Record<string, number>, trend: BenchPoint[]): QuarterRow[] {
  const sums = new Map<string, { sum: number; n: number }>();
  for (const [month, manwon] of Object.entries(months)) {
    const q = quarterOf(month);
    if (q === null || !Number.isFinite(manwon) || manwon < 0) continue;
    const cur = sums.get(q) ?? { sum: 0, n: 0 };
    sums.set(q, { sum: cur.sum + manwon * 1e4, n: cur.n + 1 });
  }
  const bench = new Map(trend.map((t) => [t.quarter, t.per_store_month]));
  return [...sums.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([quarter, { sum, n }]) => ({ quarter, mine: sum / n, months: n, bench: bench.get(quarter) ?? null }));
}

const INSUFFICIENT: Checkup = {
  verdict: "insufficient",
  basis: null,
  from: null,
  to: null,
  myChangePct: null,
  benchChangePct: null,
  gapPp: null,
  partial: false,
};

export function assess(rows: QuarterRow[]): Checkup {
  const usable = rows.filter((r) => r.bench !== null && r.bench > 0);
  if (usable.length < 2) return INSUFFICIENT;
  const last = usable[usable.length - 1];
  const yoyBase = usable.find((r) => r.quarter === shiftQuarter(last.quarter, -4));
  const base = yoyBase ?? usable[usable.length - 2];
  if (base.mine <= 0 || base.bench === null || last.bench === null) return INSUFFICIENT;
  const myChangePct = (last.mine / base.mine - 1) * 100;
  const benchChangePct = (last.bench / base.bench - 1) * 100;
  const gapPp = myChangePct - benchChangePct;
  return {
    verdict: gapPp <= -GAP_PP ? "lagging" : gapPp >= GAP_PP ? "leading" : "similar",
    basis: yoyBase ? "yoy" : "since",
    from: base.quarter,
    to: last.quarter,
    myChangePct,
    benchChangePct,
    gapPp,
    partial: last.months < 3 || base.months < 3,
  };
}

function signed(v: number): string {
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
}

/** 점검 결과 문장. 사실과 차이만 말하고 원인·처방은 말하지 않는다. */
export function checkupText(c: Checkup, unitLabel: string): string {
  if (c.verdict === "insufficient" || c.from === null || c.to === null || c.myChangePct === null || c.benchChangePct === null || c.gapPp === null) {
    return "비교하려면 서로 다른 두 분기 이상의 매출 기록이 필요합니다. 달마다 기록을 쌓아 가면 동네와의 흐름 차이를 볼 수 있어요.";
  }
  const span = `${quarterLabel(c.from)}→${quarterLabel(c.to)}`;
  const mine = `내 매출 ${signed(c.myChangePct)}`;
  const bench = `${unitLabel} 같은 업종 평균 ${signed(c.benchChangePct)}`;
  const gap = Math.abs(c.gapPp).toFixed(1);
  if (c.verdict === "lagging") return `${span}: ${mine}, ${bench} — 동네보다 ${gap}%p 더 낮아졌어요.`;
  if (c.verdict === "leading") return `${span}: ${mine}, ${bench} — 동네보다 ${gap}%p 더 높아졌어요.`;
  return `${span}: ${mine}, ${bench} — 동네와 비슷한 흐름이에요(차이 ${gap}%p).`;
}
