import type { FoodCompareResponse } from "./apiClient";
import { formatMetric } from "./format.ts";

type Comparison = Pick<FoodCompareResponse, "units" | "rows">;
export interface CompareConclusion {
  title: string;
  reading: string;
  evidence: { label: string; text: string; period: string | null }[];
  next: string;
}

/** 서로 같은 범위로 비교 가능한 값만 해석한다. 매출·폐업을 종합점수나 성공 예측으로 바꾸지 않는다. */
export function compareConclusion(data: Comparison): CompareConclusion {
  const row = (key: string) => data.rows.find(r => r.key === key);
  const leader = (key: string, low = false) => {
    const r = row(key);
    if (!r || data.units.length < 2) return null;
    const cells = data.units.map((u, i) => ({ unit: u, cell: r.cells[i] }));
    if (cells.some(x => x.cell?.value == null || !Number.isFinite(x.cell.value) || x.cell.partial || x.cell.caution)) return null;
    const values = cells.map(x => x.cell.value as number);
    const extreme = low ? Math.min(...values) : Math.max(...values);
    if (Math.max(...values) - Math.min(...values) < (r.kind === "money" ? 10000 : 0.1)) return null;
    const best = cells.filter(x => x.cell.value === extreme);
    if (best.length !== 1) return null;
    return { name: best[0].unit.name, code: best[0].unit.code };
  };
  const sales = leader("per_store_month");
  const closure = leader("close_rate_y", true);
  const evidence = ["per_store_month", "close_rate_y", "sales_yoy_pct"].flatMap(key => {
    const r = row(key);
    if (!r) return [];
    return [{ label: r.label, text: data.units.map((u, i) => `${u.name} ${formatMetric(r.kind, r.cells[i]?.value ?? null)}${r.cells[i]?.partial ? " (일부 집계)" : r.cells[i]?.caution ? " (표본 주의)" : ""}`).join(" · "), period: r.as_of }];
  });
  const rent = row("rent_small_shop");
  const missingRent = !rent || data.units.some((_, i) => rent.cells[i]?.value == null);
  const next = missingRent
    ? "비교에 필요한 실제 임대료가 없습니다. 후보 점포의 보증금·월세를 확인해 손익분기 매출을 비교하세요."
    : "임대료는 주변 조사 상권의 참고값입니다. 후보 점포의 실제 월세와 내 예상 비용으로 손익분기를 비교하세요.";
  if (sales && closure && sales.code !== closure.code) return {
    title: `매출은 ${sales.name}, 낮은 폐업률은 ${closure.name}`,
    reading: `점포당 매출 수준을 먼저 보면 ${sales.name}, 최근 폐업 흐름을 먼저 보면 ${closure.name}를 검토하세요. 두 기준의 결과가 갈리므로 실제 임대료·비용을 비교한 뒤 후보를 좁히는 게 좋습니다.`, evidence, next,
  };
  if (sales && closure) return {
    title: `${sales.name}부터 구체적으로 검토하세요`,
    reading: `비교한 지역 중 점포당 추정매출이 가장 높고 최근 폐업률이 가장 낮습니다. 다음 단계는 실제 점포의 비용과 영업 여건 확인입니다.`, evidence, next,
  };
  if (sales) return {
    title: `매출 수준은 ${sales.name}가 높습니다`,
    reading: "점포당 추정매출에서는 차이가 보입니다. 폐업 지표는 뚜렷한 차이가 없거나 비교 자료가 부족해 함께 우열을 정하기 어렵습니다.", evidence, next,
  };
  if (closure) return {
    title: `최근 폐업률은 ${closure.name}가 낮습니다`,
    reading: "폐업 흐름을 우선 본다면 이 지역부터 살펴보세요. 매출 수준은 뚜렷한 차이가 없거나 비교 자료가 부족합니다.", evidence, next,
  };
  return { title: data.units.length < 2 ? "지역을 한 곳 더 선택하세요" : "현재 지표만으로 한 곳을 먼저 고르기 어렵습니다", reading: "매출·폐업률에 뚜렷한 차이가 없거나 비교 가능한 자료가 부족합니다. 실제 월세와 목표 고객의 방문 시간대를 확인해 후보를 좁히세요.", evidence, next };
}
