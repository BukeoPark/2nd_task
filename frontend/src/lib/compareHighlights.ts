// 지역 비교 상단의 '차이가 큰 핵심 지표 3개' — 비교 중인 지역들 사이에서 값이 가장 크게 벌어진 지표를 골라 보여 준다.
// 유리한 지역을 고르거나 점수·순위로 합치지 않는다(값이 가장 큰 곳·가장 작은 곳을 말할 뿐). 같은 비교 호출의 행만 쓰므로 기간·업종·공간 단위가 같다.
// 일부 업종만 반영한 칸(partial)은 다른 지역과 같은 범위가 아니라서 뺀다. 값이 하나뿐인 지표는 대상이 아니다.
// 다른 모듈은 format 만 가져오는 순수 함수(tests/compareHighlights.test.ts).
import { formatMetric } from "./format.ts";

export interface HighlightCell { value: number | null; note?: string; partial?: boolean; caution?: boolean }
export interface HighlightRow { key: string; label: string; kind: string; scope?: string | null; as_of: string | null; cells: HighlightCell[] }
export interface HighlightInput { units: { code: string; name: string }[]; rows: HighlightRow[] }

/** 후보 지표 — 개수·면적처럼 규모에 따라 당연히 벌어지는 값(점포 수 등)은 뺀다. */
const KEYS = ["per_store_month", "sales_yoy_pct", "stores_change_2y", "open_rate_y", "close_rate_y", "frc_share", "stores_volatility", "sales_per_10k_flpop"];
/** 비율·증감(%)은 %p 차이가 이 값 이상일 때, 금액·인원은 큰 값 대비 이 비율 이상 벌어질 때만 '차이가 크다'고 본다. */
const MIN_PP = 3;
const MIN_REL = 0.25;
const PP_SCALE = 20;

export interface Highlight {
  key: string;
  label: string;
  asOf: string | null;
  scope: string | null;
  high: { name: string; text: string };
  low: { name: string; text: string };
  /** '약 2.3배' 또는 '12.4%p 차이' */
  gap: string;
  /** 차이를 어떻게 셌는지(근거) — '가장 높은 값 ÷ 가장 낮은 값' 같은 한 줄 */
  basis: string;
  /** 값이 있는 모든 지역의 값(큰 순) — 높음·낮음만이 아니라 전체를 보인다 */
  values: { name: string; text: string }[];
  /** 정렬에 쓴 0~1 값(점수가 아니라 차이 크기) */
  size: number;
}

export function compareHighlights(inp: HighlightInput, limit = 3): Highlight[] {
  if (inp.units.length < 2) return [];
  const out: Highlight[] = [];
  for (const key of KEYS) {
    const row = inp.rows.find((r) => r.key === key);
    if (!row) continue;
    const vals = inp.units
      .map((u, i) => ({ name: u.name, v: row.cells[i]?.value ?? null, usable: !(row.cells[i]?.partial) }))
      .filter((x): x is { name: string; v: number; usable: boolean } => x.v !== null && x.usable);
    if (vals.length < 2) continue;
    const hi = vals.reduce((m, x) => (x.v > m.v ? x : m));
    const lo = vals.reduce((m, x) => (x.v < m.v ? x : m));
    const spread = hi.v - lo.v;
    const pct = row.kind === "growth" || row.kind === "rate";
    let size: number;
    let gap: string;
    let basis: string;
    if (pct) {
      if (spread < MIN_PP) continue;
      size = Math.min(1, spread / PP_SCALE);
      gap = `${spread.toFixed(1)}%p 차이`;
      basis = "가장 높은 지역 − 가장 낮은 지역(%p = 퍼센트포인트)";
    } else {
      const maxAbs = Math.max(Math.abs(hi.v), Math.abs(lo.v));
      if (maxAbs <= 0 || spread / maxAbs < MIN_REL) continue;
      size = spread / maxAbs;
      gap = lo.v > 0 ? `약 ${(hi.v / lo.v).toFixed(1)}배` : `${formatMetric(row.kind, spread)} 차이`;
      basis = lo.v > 0 ? "가장 높은 값 ÷ 가장 낮은 값" : "가장 높은 값 − 가장 낮은 값";
    }
    out.push({ key, label: row.label, asOf: row.as_of, scope: row.scope ?? null, high: { name: hi.name, text: formatMetric(row.kind, hi.v) }, low: { name: lo.name, text: formatMetric(row.kind, lo.v) }, gap, basis, values: [...vals].sort((a, b) => b.v - a.v).map((x) => ({ name: x.name, text: formatMetric(row.kind, x.v) })), size });
  }
  return out.sort((a, b) => b.size - a.size).slice(0, limit);
}
