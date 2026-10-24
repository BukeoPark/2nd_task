// 예비 창업자 '창업 비용 점검' — 사용자가 입력한 값만으로 영업손익·손익분기를 계산하는 시뮬레이션이다(실제 매출 예측이 아니다).
// 계산은 기존 lib/breakeven 을 그대로 쓴다. 저장은 '내 가게' 실제 기록(myStoreStorage)과 다른 키를 쓰고, 이 브라우저에만 둔다.
// 내 월급은 운영비에 포함한다. 대출 상환 필요 매출과 초기 자금은 월 손익에서 분리한다.
import { PLAN_FIELDS, type PlanKey } from "./startupPlan.ts";
import { breakeven, parseNum, type CostInput } from "./breakeven.ts";
import { readJson, removeKey, writeJson } from "./localState.ts";

export const COST_CHECK_KEY = "founderCostCheck:v1";

export type CostCheckKey = "revenue" | "rent" | "labor" | "otherFixed" | "cogsPct" | "feePct" | "ownerPay" | "loanPayment" | "maintenance" | "floorArea" | "legacyRentCombined" | PlanKey;
export type CostCheckDraft = Record<CostCheckKey, string>;

export const COST_CHECK_FIELDS: { key: CostCheckKey; label: string; unit: string; placeholder: string; help: string }[] = [
  { key: "revenue", label: "예상 월매출", unit: "만원", placeholder: "3000", help: "내가 목표로 하는 월 매출. 서비스가 예측한 값이 아닙니다." },
  { key: "rent", label: "월세", unit: "만원/월", placeholder: "250", help: "관리비를 제외한 월세입니다. 보증금·권리금은 초기 자금에 따로 입력합니다." },
  { key: "maintenance", label: "관리비", unit: "만원/월", placeholder: "30", help: "매달 별도로 내는 관리비입니다. 월세에 포함했다면 중복 입력하지 마세요." },
  { key: "labor", label: "인건비", unit: "만원/월", placeholder: "500", help: "직원 급여를 입력하세요. 내 월급은 별도 항목에 넣고 여기에는 중복 입력하지 마세요." },
  { key: "ownerPay", label: "내 월급", unit: "만원/월", placeholder: "300", help: "내가 매달 가져갈 금액입니다. 입력하면 필요 매출에 포함합니다. 직원 인건비에 이미 포함했다면 중복 입력하지 마세요." },
  { key: "loanPayment", label: "대출 월 상환액", unit: "만원/월", placeholder: "100", help: "원금과 이자를 합한 매달 상환액입니다. 대출 상환까지 필요한 매출을 따로 계산합니다. 기타 고정비에 중복 입력하지 마세요." },
  { key: "otherFixed", label: "기타 고정비", unit: "만원/월", placeholder: "80", help: "통신·보험·광고·기계 리스 등 매출과 상관없이 나가는 비용." },
  { key: "cogsPct", label: "원가율", unit: "% (매출 대비)", placeholder: "35", help: "재료비 등 매출에 비례해 드는 비용의 비율." },
  { key: "feePct", label: "수수료율", unit: "% (매출 대비)", placeholder: "3", help: "카드·배달앱 등 매출에 비례해 나가는 수수료의 비율." },
];

/** 계산에 넣지 않는 항목 — 화면에 그대로 밝힌다. */
export const COST_CHECK_EXCLUDED = ["세금(부가가치세·소득세 등)", "대출 원금·이자는 월 손익에 섞지 않고 상환 필요 매출로 별도 계산", "초기 투자비는 준비 자금으로 별도 계산하며 월 손익에는 미반영"];

export function emptyDraft(): CostCheckDraft {
  return { maintenance: "", floorArea: "", legacyRentCombined: "", revenue: "", rent: "", labor: "", otherFixed: "", cogsPct: "", feePct: "", ownerPay: "", loanPayment: "", deposit: "", keyMoney: "", interior: "", equipment: "", initialStock: "", setupOther: "", reserve: "", openDays: "", averageTicket: "" };
}

export function sanitizeDraft(value: unknown): CostCheckDraft {
  const d = emptyDraft();
  if (value && typeof value === "object") {
    for (const f of [...COST_CHECK_FIELDS, ...PLAN_FIELDS]) {
      const v = (value as Record<string, unknown>)[f.key];
      if (typeof v === "string") d[f.key] = v.slice(0, 12);
    }
    const raw = value as Record<string, unknown>;
    if (typeof raw.floorArea === "string") d.floorArea = raw.floorArea.slice(0, 12);
    d.legacyRentCombined = raw.legacyRentCombined === "1" || (!("maintenance" in raw) && typeof raw.rent === "string" && raw.rent.trim() !== "") ? "1" : "";
  }
  return d;
}

// 후보 지역별 저장: 같은 입력이라도 지역마다 임대료·매출 가정이 다르니 `founderCostCheck:v1:<단위>:<코드>` 에 따로 둔다.
// 기존 전역 키(`founderCostCheck:v1`)는 그대로 두고 '가장 최근 입력'으로 새 지역의 기본값이 된다(기존 기록 유지).
const unitStoreKey = (unitKey: string) => `${COST_CHECK_KEY}:${unitKey}`;

/** 그 지역에 저장된 입력(없으면 null). 지웠다면 '비어 있는 입력'이 저장돼 있다. */
export function loadUnitDraft(unitKey: string): CostCheckDraft | null {
  const raw = readJson(unitStoreKey(unitKey));
  return raw === null || raw === undefined ? null : sanitizeDraft(raw);
}
/** 지역 키가 있으면 그 지역 입력, 없으면 전역(가장 최근) 입력. */
export const loadDraft = (unitKey?: string): CostCheckDraft => (unitKey ? loadUnitDraft(unitKey) : null) ?? sanitizeDraft(readJson(COST_CHECK_KEY));
/** 지역 키가 있는데 그 지역에 저장한 입력이 없고, 최근(전역) 입력이 있어 그 값을 대신 쓰고 있는지. */
export function isInheritedDraft(unitKey?: string): boolean {
  if (!unitKey || loadUnitDraft(unitKey) !== null) return false;
  return Object.values(sanitizeDraft(readJson(COST_CHECK_KEY))).some((v) => v !== "");
}
export function saveDraft(d: CostCheckDraft, unitKey?: string): boolean {
  const okUnit = unitKey ? writeJson(unitStoreKey(unitKey), d) : true;
  return writeJson(COST_CHECK_KEY, d) && okUnit;
}
/** 지역 키가 있으면 그 지역 입력만 비운다(전역 값은 그대로 — 다른 지역의 기본값). 없으면 전역을 지운다. */
export const clearDraft = (unitKey?: string): boolean => (unitKey ? writeJson(unitStoreKey(unitKey), emptyDraft()) : removeKey(COST_CHECK_KEY));

export type CostCheckStatus = "empty" | "invalid" | "no_margin" | "no_revenue" | "ok";

export interface CostCheckResult {
  status: CostCheckStatus;
  ownerPay: number | null;
  loanPayment: number | null;
  cashBep: number | null;
  cashSurplus: number | null;
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
  const cost: CostInput = { rent: parsed.rent === null && parsed.maintenance === null ? null : (parsed.rent ?? 0) + (parsed.maintenance ?? 0), labor: parsed.labor === null && parsed.ownerPay === null ? null : (parsed.labor ?? 0) + (parsed.ownerPay ?? 0), otherFixed: parsed.otherFixed === null && parsed.loanPayment !== null ? 0 : parsed.otherFixed, cogsPct: parsed.cogsPct, feePct: parsed.feePct };
  const anyNaN = Object.values(parsed).some((v) => v !== null && (!Number.isFinite(v) || v < 0));
  const bad = { status: "invalid" as const, fixed: 0, bep: null, profit: null, gap: null, safetyPct: null, vsBenchPct: null, ownerPay: parsed.ownerPay, loanPayment: parsed.loanPayment, cashBep: null, cashSurplus: null };
  if (anyNaN || (parsed.ownerPay !== null && parsed.ownerPay < 0) || (parsed.loanPayment !== null && parsed.loanPayment < 0)) return bad;
  const revenue = parsed.revenue;
  if (revenue !== null && revenue < 0) return bad;
  const b = breakeven(cost, revenue, bench);
  if (b.status === "empty") return { ...bad, status: "empty" };
  if (b.status === "invalid") return bad;
  if (b.status === "no_margin") return { ...bad, status: "no_margin", fixed: b.fixed };
  return {
    status: revenue === null ? "no_revenue" : "ok",
    ownerPay: parsed.ownerPay, loanPayment: parsed.loanPayment,
    cashBep: (b.fixed + (parsed.loanPayment ?? 0)) / (1 - b.variableRatio),
    cashSurplus: b.profit === null ? null : b.profit - (parsed.loanPayment ?? 0),
    fixed: b.fixed, bep: b.bep, profit: b.profit, gap: revenue !== null && b.bep !== null ? revenue - b.bep : null, safetyPct: b.safetyPct, vsBenchPct: b.vsBenchPct,
  };
}

/** 면적은 비용 계산과 분리하고, 월세 단가만 실제 입력으로 계산한다. */
export function computeRentDetail(d: CostCheckDraft) {
  const area = parseNum(d.floorArea);
  const rent = parseNum(d.rent);
  const invalidArea = area !== null && (!Number.isFinite(area) || area <= 0);
  const rentPerSqm = !invalidArea && area !== null && rent !== null && Number.isFinite(rent) && rent >= 0 && d.legacyRentCombined !== "1" ? rent * 10000 / area : null;
  return { area, invalidArea, rentPerSqm };
}
