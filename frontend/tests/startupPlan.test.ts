import assert from "node:assert/strict";
import { test } from "node:test";
import { computeStartupPlan, PLAN_FIELDS, type PlanDraft } from "../src/lib/startupPlan.ts";
const draft = (v: Partial<PlanDraft> = {}): PlanDraft => ({ ...Object.fromEntries(PLAN_FIELDS.map(f => [f.key, ""])) as PlanDraft, ...v });
test("초기 자금은 보증금·개업 준비비·운영자금으로 구분한다", () => {
  const r = computeStartupPlan(draft({ deposit: "3000", keyMoney: "1000", interior: "2000", equipment: "1000", initialStock: "200", setupOther: "100", reserve: "1000" }), 1200);
  assert.equal(r.setup, 4300); assert.equal(r.total, 8300); assert.equal(r.deposit, 3000); assert.equal(r.partial, false);
});
test("만원 월매출과 원 객단가를 환산하고 주문 수를 올림한다", () => {
  const r = computeStartupPlan(draft({ openDays: "26", averageTicket: "12000" }), 1200);
  assert.equal(r.dailyOrders, 39); assert.equal(r.dailyRevenue, 1200 / 26);
});
test("빈 값·0·잘못된 입력을 구분한다", () => {
  assert.equal(computeStartupPlan(draft(), null).total, null);
  assert.equal(computeStartupPlan(draft({ deposit: "0" }), null).total, 0);
  assert.equal(computeStartupPlan(draft({ deposit: "-1" }), null).invalid, true);
  for (const openDays of ["0", "32", "2.5", "abc"]) assert.equal(computeStartupPlan(draft({ openDays, averageTicket: "10000" }), 1000).invalidOrders, true);
  assert.equal(computeStartupPlan(draft({ openDays: "26", averageTicket: "0" }), 1000).dailyOrders, null);
  assert.equal(computeStartupPlan(draft({ openDays: "26", averageTicket: "10000" }), null).dailyOrders, null);
});
