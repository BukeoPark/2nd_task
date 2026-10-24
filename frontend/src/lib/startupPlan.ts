// 초기 자금(만원)과 주문 목표(객단가는 원)를 월 손익과 분리해 계산한다.
export const STARTUP_FIELDS = [
  { key: "deposit", label: "보증금", unit: "만원", placeholder: "3000" },
  { key: "keyMoney", label: "권리금", unit: "만원", placeholder: "1000" },
  { key: "interior", label: "인테리어", unit: "만원", placeholder: "2000" },
  { key: "equipment", label: "설비·집기", unit: "만원", placeholder: "1000" },
  { key: "initialStock", label: "초기 재고", unit: "만원", placeholder: "200" },
  { key: "setupOther", label: "기타 준비비", unit: "만원", placeholder: "100" },
  { key: "reserve", label: "운영 여유자금", unit: "만원", placeholder: "1000" },
] as const;
export const ORDER_FIELDS = [
  { key: "openDays", label: "월 영업일", unit: "일", placeholder: "26" },
  { key: "averageTicket", label: "주문 1건당 평균 결제액", unit: "원", placeholder: "12000" },
] as const;
export const PLAN_FIELDS = [...STARTUP_FIELDS, ...ORDER_FIELDS];
export type PlanKey = typeof PLAN_FIELDS[number]["key"];
export type PlanDraft = Record<PlanKey, string>;
const parse = (s: string | undefined) => !s?.trim() ? null : Number(s.replace(/,/g, "").trim());
export function computeStartupPlan(d: PlanDraft, bepManwon: number | null) {
  const values = STARTUP_FIELDS.map(f => parse(d[f.key]));
  const invalid = values.some(v => v !== null && (!Number.isFinite(v) || v < 0));
  const hasStartup = values.some(v => v !== null);
  const deposit = parse(d.deposit);
  const reserve = parse(d.reserve);
  const setup = invalid || !hasStartup ? null : values.slice(1, 6).reduce<number>((sum, v) => sum + (v ?? 0), 0);
  const total = setup === null ? null : setup + (deposit ?? 0) + (reserve ?? 0);
  const days = parse(d.openDays), ticket = parse(d.averageTicket);
  const invalidOrders = (days !== null && (!Number.isInteger(days) || days < 1 || days > 31)) || (ticket !== null && (!Number.isFinite(ticket) || ticket <= 0));
  const dailyRevenue = !invalidOrders && bepManwon !== null && Number.isFinite(bepManwon) && bepManwon >= 0 && days !== null ? bepManwon / days : null;
  const dailyOrders = dailyRevenue !== null && ticket !== null ? Math.ceil(dailyRevenue * 10000 / ticket) : null;
  return { invalid, hasStartup, partial: hasStartup && values.some(v => v === null), deposit, reserve, setup, total, invalidOrders, dailyRevenue, dailyOrders };
}
