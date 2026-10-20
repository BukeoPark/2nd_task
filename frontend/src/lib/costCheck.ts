// 예비 창업자 '창업 비용 점검' — 사용자가 입력한 값만으로 영업손익·손익분기를 계산하는 시뮬레이션이다(실제 매출 예측이 아니다).
// 계산은 기존 lib/breakeven 을 그대로 쓴다. 저장은 '내 가게' 실제 기록(myStoreStorage)과 다른 키를 쓰고, 이 브라우저에만 둔다.
// 세금·금융비용·창업 초기 투자비는 계산에 넣지 않는다(EXCLUDED 에 이름을 적어 화면에 밝힌다).
import { breakeven, parseNum, type CostInput } from "./breakeven.ts";
import { readJson, removeKey, writeJson } from "./localState.ts";

export const COST_CHECK_KEY = "founderCostCheck:v1";

export type CostCheckKey = "revenue" | "rent" | "labor" | "otherFixed" | "cogsPct" | "feePct";
export type CostCheckDraft = Record<CostCheckKey, string>;

export const COST_CHECK_FIELDS: { key: CostCheckKey; label: string; unit: string; placeholder: string; help: string }[] = [
  { key: "revenue", label: "예상 월매출", unit: "만원", placeholder: "3000", help: "내가 목표로 하는 월 매출. 서비스가 예측한 값이 아닙니다." },
  { key: "rent", label: "임대료·관리비", unit: "만원/월", placeholder: "250", help: "월세와 관리비. 보증금·권리금은 아래 '포함하지 않은 항목'에 있습니다." },
  { key: "labor", label: "인건비", unit: "만원/월", placeholder: "500", help: "직원 급여(4대보험 포함 여부는 직접 정합니다). 본인 몫을 넣을지도 직접 정하세요." },
  { key: "otherFixed", label: "기타 고정비", unit: "만원/월", placeholder: "80", help: "통신·보험·광고·기계 리스 등 매출과 상관없이 나가는 비용." },
  { key: "cogsPct", label: "원가율", unit: "% (매출 대비)", placeholder: "35", help: "재료비 등 매출에 비례해 드는 비용의 비율." },
  { key: "feePct", label: "수수료율", unit: "% (매출 대비)", placeholder: "3", help: "카드·배달앱 등 매출에 비례해 나가는 수수료의 비율." },
];

/** 계산에 넣지 않는 항목 — 화면에 그대로 밝힌다. */
export const COST_CHECK_EXCLUDED = ["세금(부가가치세·소득세 등)", "대출 이자·원금 같은 금융비용", "창업 초기 투자비(보증금·권리금·인테리어·장비·인허가 비용)"];

export function emptyDraft(): CostCheckDraft {
  return { revenue: "", rent: "", labor: "", otherFixed: "", cogsPct: "", feePct: "" };
}

export function sanitizeDraft(value: unknown): CostCheckDraft {
  const d = emptyDraft();
  if (value && typeof value === "object") {
    for (const f of COST_CHECK_FIELDS) {
      const v = (value as Record<string, unknown>)[f.key];
      if (typeof v === "string") d[f.key] = v.slice(0, 12);
    }
  }
  return d;
}

export const loadDraft = (): CostCheckDraft => sanitizeDraft(readJson(COST_CHECK_KEY));
export const saveDraft = (d: CostCheckDraft): boolean => writeJson(COST_CHECK_KEY, d);
export const clearDraft = (): boolean => removeKey(COST_CHECK_KEY);

export type CostCheckStatus = "empty" | "invalid" | "no_margin" | "no_revenue" | "ok";

export interface CostCheckResult {
  status: CostCheckStatus;
  /** 월 고정비 합(만원) */
  fixed: number;
  /** 손익분기 월매출(만원) */
  bep: number | null;
  /** 입력한 예상 월매출 기준 예상 영업손익(만원, 음수면 적자) */
  profit: number | null;
  /** 예상 월매출 − 손익분기(만원). 양수면 손익분기보다 높다 */
  gap: number | null;
  /** 안전마진(%) — (매출 − 손익분기) ÷ 매출 */
  safetyPct: number | null;
  /** 손익분기 ÷ 같은 업종 점포당 평균(%) — 평균 자료가 있을 때만 */
  vsBenchPct: number | null;
}

/** 입력칸 문자열 → 결과. bench 는 같은 업종 점포당 월평균 추정매출(만원, 참고용)이고 없으면 null. */
export function computeCostCheck(d: CostCheckDraft, bench: number | null = null): CostCheckResult {
  const parsed = Object.fromEntries(COST_CHECK_FIELDS.map((f) => [f.key, parseNum(d[f.key])])) as Record<CostCheckKey, number | null>;
  const cost: CostInput = { rent: parsed.rent, labor: parsed.labor, otherFixed: parsed.otherFixed, cogsPct: parsed.cogsPct, feePct: parsed.feePct };
  const anyNaN = Object.values(parsed).some((v) => v !== null && !Number.isFinite(v));
  const bad = { status: "invalid" as const, fixed: 0, bep: null, profit: null, gap: null, safetyPct: null, vsBenchPct: null };
  if (anyNaN) return bad;
  const revenue = parsed.revenue;
  if (revenue !== null && revenue < 0) return bad;
  const b = breakeven(cost, revenue, bench);
  if (b.status === "empty") return { ...bad, status: "empty" };
  if (b.status === "invalid") return bad;
  if (b.status === "no_margin") return { ...bad, status: "no_margin", fixed: b.fixed };
  return {
    status: revenue === null ? "no_revenue" : "ok",
    fixed: b.fixed, bep: b.bep, profit: b.profit, gap: revenue !== null && b.bep !== null ? revenue - b.bep : null, safetyPct: b.safetyPct, vsBenchPct: b.vsBenchPct,
  };
}
