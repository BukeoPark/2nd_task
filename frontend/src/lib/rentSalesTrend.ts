/** 같은 분기를 맞추고 첫 공통 유효 분기=100으로 환산한다. 결측은 연결하지 않는다. */
export function rentSalesTrend(rent: { quarter: string; value: number | null }[], sales: { quarter: string; per_store_month: number | null }[]) {
  const valid = (v: number | null | undefined): v is number => v != null && Number.isFinite(v) && v >= 0;
  const salesMap = new Map(sales.map(p => [p.quarter, p.per_store_month]));
  const points = rent.map(p => ({ quarter: p.quarter.slice(0, 4) + p.quarter.slice(-1), rent: p.value })).sort((a, b) => a.quarter.localeCompare(b.quarter));
  const base = points.find(p => valid(p.rent) && p.rent > 0 && valid(salesMap.get(p.quarter)) && salesMap.get(p.quarter)! > 0);
  if (!base) return null;
  const aligned = points.filter(p => p.quarter >= base.quarter);
  if (aligned.filter(p => valid(p.rent) && valid(salesMap.get(p.quarter))).length < 2) return null;
  return { baseQuarter: base.quarter, labels: aligned.map(p => p.quarter),
    rent: aligned.map(p => valid(p.rent) ? p.rent / base.rent! * 100 : null),
    sales: aligned.map(p => valid(salesMap.get(p.quarter)) ? salesMap.get(p.quarter)! / salesMap.get(base.quarter)! * 100 : null) };
}
