// 비용·임대 탭의 요약 줄 계산 — 입력이 얼마나 채워졌는지, 필요 매출·내 월세가 참고값과 어떻게 다른지.
// 새 점수·판정은 만들지 않고, 입력값과 서울시·R-ONE 참고값의 비율만 말한다(예측 아님).
// 다른 모듈은 타입만 import 하는 순수 함수(tests/costSummary.test.ts).
import type { CostCheckDraft } from "./costCheck.ts";

/** 필요한 매출을 정확히 내려면 있어야 하는 월 비용 칸 — 대출 상환액은 선택이라 세지 않는다. */
export const BASE_COST_FIELDS: { key: keyof CostCheckDraft; label: string }[] = [
  { key: "rent", label: "월세" },
  { key: "maintenance", label: "관리비" },
  { key: "labor", label: "인건비" },
  { key: "ownerPay", label: "내 월급" },
  { key: "otherFixed", label: "기타 고정비" },
  { key: "cogsPct", label: "원가율" },
  { key: "feePct", label: "수수료율" },
];

const num = (s: string | undefined) => {
  const t = (s ?? "").replace(/,/g, "").trim();
  if (t === "") return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
};

export interface CostFill { filled: number; total: number; missing: string[] }

/** 월 비용 칸 중 몇 칸이 채워졌고 어느 칸이 비었는지. 월세·관리비를 합쳐 적은 옛 기록은 관리비를 채운 것으로 본다. */
export function costFill(d: CostCheckDraft): CostFill {
  const missing = BASE_COST_FIELDS
    .filter((f) => num(d[f.key]) === null && !(f.key === "maintenance" && d.legacyRentCombined === "1"))
    .map((f) => f.label);
  return { filled: BASE_COST_FIELDS.length - missing.length, total: BASE_COST_FIELDS.length, missing };
}

export type Level = "low" | "similar" | "high";

export interface SalesBenchmark { benchManwon: number; pct: number; level: Level }

/** 필요한 월매출(만원)이 같은 업종 점포당 월평균 추정매출(원)의 몇 %인지. 평균 자료가 없으면 null. ±10% 안은 비슷함. */
export function salesBenchmark(requiredManwon: number | null, benchWon: number | null): SalesBenchmark | null {
  if (requiredManwon === null || benchWon === null || !(benchWon > 0) || !Number.isFinite(requiredManwon)) return null;
  const benchManwon = benchWon / 1e4;
  const ratio = requiredManwon / benchManwon;
  return { benchManwon, pct: Math.round(ratio * 100), level: ratio < 0.9 ? "low" : ratio > 1.1 ? "high" : "similar" };
}

export const BENCH_LEVEL_TEXT: Record<Level, string> = { low: "평균보다 낮은 수준", similar: "평균과 비슷한 수준", high: "평균보다 높은 수준" };

export interface RentVsReference { mine: number; ref: number; diffPct: number; level: Level }

/** 내 ㎡당 월세(원)를 인근 조사상권 참고값(천원/㎡)과 견준다. ±5% 안은 비슷함. 둘 중 하나라도 없으면 null. */
export function rentVsReference(rentPerSqm: number | null, refThousandPerSqm: number | null): RentVsReference | null {
  if (rentPerSqm === null || refThousandPerSqm === null || !Number.isFinite(rentPerSqm) || !(refThousandPerSqm > 0)) return null;
  const mine = rentPerSqm / 1000;
  const diffPct = Math.round((mine / refThousandPerSqm - 1) * 100);
  return { mine, ref: refThousandPerSqm, diffPct, level: Math.abs(diffPct) < 5 ? "similar" : diffPct > 0 ? "high" : "low" };
}

/** 하루 필요 주문이 비었을 때 왜 비었는지 — 계산됐으면 null. */
export function orderHint(openDays: string, averageTicket: string, invalidOrders: boolean, dailyOrders: number | null): string | null {
  if (dailyOrders !== null) return null;
  if (invalidOrders) return "영업일은 1~31일, 주문 금액은 0원 초과로 입력해 주세요.";
  const days = num(openDays) !== null, ticket = num(averageTicket) !== null;
  if (!days && !ticket) return "월 영업일과 주문 1건당 결제액을 넣으면 계산돼요.";
  if (!days) return "월 영업일을 넣으면 계산돼요.";
  if (!ticket) return "주문 1건당 결제액을 넣으면 계산돼요.";
  return null;
}
