// 간이 손익분기 — 사장님이 입력한 비용만으로 계산한다(동네 평균 비용 자료는 없다). 만원 단위.
// 손익분기 매출 = 월 고정비 ÷ (1 − 변동비율). 세금·대출 원리금은 '기타 고정비'에 넣어야 반영된다.
// 다른 모듈을 import 하지 않는 순수 함수(tests/breakeven.test.ts).

export interface CostInput {
  rent: number | null; // 임대료·관리비
  labor: number | null; // 인건비(본인 몫 포함 여부는 사장님 판단)
  otherFixed: number | null; // 기타 고정비(대출 원리금·보험·통신 등)
  cogsPct: number | null; // 재료비·원가율 (매출 대비 %)
  feePct: number | null; // 카드·배달앱 등 수수료율 (매출 대비 %)
}

export type BreakevenStatus = "ok" | "empty" | "invalid" | "no_margin";

export interface Breakeven {
  status: BreakevenStatus;
  fixed: number; // 월 고정비 합
  variableRatio: number; // 변동비율(0~1)
  bep: number | null; // 손익분기 월 매출
  profit: number | null; // 월 매출을 넣었을 때 예상 월 이익
  safetyPct: number | null; // 안전마진 = (매출 − 손익분기) ÷ 매출 × 100
  vsBenchPct: number | null; // 손익분기 ÷ 동네 같은 업종 점포당 평균 × 100
}

const EMPTY: Breakeven = { status: "empty", fixed: 0, variableRatio: 0, bep: null, profit: null, safetyPct: null, vsBenchPct: null };

function ok(v: number | null): boolean {
  return v === null || (Number.isFinite(v) && v >= 0);
}

/** revenue·bench 는 만원. 입력이 하나도 없으면 'empty', 음수·퍼센트 범위 밖이면 'invalid', 변동비율이 100% 이상이면 'no_margin'. */
export function breakeven(cost: CostInput, revenue: number | null, bench: number | null): Breakeven {
  const { rent, labor, otherFixed, cogsPct, feePct } = cost;
  if ([rent, labor, otherFixed, cogsPct, feePct].every((v) => v === null)) return EMPTY;
  if (![rent, labor, otherFixed, cogsPct, feePct].every(ok) || (cogsPct ?? 0) > 100 || (feePct ?? 0) > 100) {
    return { ...EMPTY, status: "invalid" };
  }
  const fixed = (rent ?? 0) + (labor ?? 0) + (otherFixed ?? 0);
  const variableRatio = ((cogsPct ?? 0) + (feePct ?? 0)) / 100;
  if (variableRatio >= 1) return { ...EMPTY, status: "no_margin", fixed, variableRatio };
  const bep = fixed / (1 - variableRatio);
  const hasRevenue = revenue !== null && Number.isFinite(revenue) && revenue >= 0;
  return {
    status: "ok",
    fixed,
    variableRatio,
    bep,
    profit: hasRevenue ? revenue * (1 - variableRatio) - fixed : null,
    safetyPct: hasRevenue && revenue > 0 ? ((revenue - bep) / revenue) * 100 : null,
    vsBenchPct: bench !== null && Number.isFinite(bench) && bench > 0 ? (bep / bench) * 100 : null,
  };
}

/** 입력칸 문자열 → 숫자. 비었으면 null, 숫자가 아니면 NaN(= 잘못된 입력으로 취급). */
export function parseNum(input: string): number | null {
  const s = input.replace(/,/g, "").trim();
  if (s === "") return null;
  return Number(s);
}
