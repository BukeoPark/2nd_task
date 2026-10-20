import assert from "node:assert/strict";
import { test } from "node:test";
import { MONTHLY_ITEMS, loadMonth, loadMyStores, monthOf, monthlyDone, noteMyStore, recordSummary, saveMonth } from "../src/lib/monthlyCheck.ts";
import { emptyRecord, type StoreRecord } from "../src/lib/myStoreStorage.ts";
import { installFakeStorage } from "./_fakeStorage.ts";

const NOW = new Date(2026, 9, 21);   // 2026-10
const rec = (months: Record<string, number>, costs: Partial<StoreRecord["costs"]> = {}): StoreRecord => ({ months, costs: { ...emptyRecord().costs, ...costs } });

test("기록이 없으면 0원이 아니라 비어 있는 요약(최근 달·변화율·손익분기 모두 null)", () => {
  const s = recordSummary(emptyRecord(), NOW);
  assert.deepEqual([s.months.length, s.latest, s.momPct, s.hasThisMonth, s.costsFilled, s.bepMan, s.profitMan], [0, null, null, false, 0, null, null]);
});

test("직전 달 대비는 연속한 두 달이 모두 있을 때만 구한다", () => {
  assert.ok(Math.abs((recordSummary(rec({ "2026-09": 2000, "2026-10": 2200 }), NOW).momPct as number) - 10) < 1e-9);
  assert.equal(recordSummary(rec({ "2026-08": 2000, "2026-10": 2200 }), NOW).momPct, null);   // 9월이 비어 있으면 비교하지 않는다
  assert.equal(recordSummary(rec({ "2026-10": 2200 }), NOW).hasThisMonth, true);
  assert.equal(recordSummary(rec({ "2026-09": 2200 }), NOW).hasThisMonth, false);
});

test("최근 6개월만 오래된 순으로, 비용이 있으면 가장 최근 달 매출 기준 손익분기·영업손익을 기존 계산으로 구한다", () => {
  const months = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`2026-0${i + 1}`, 1000 + i * 100]));
  const s = recordSummary(rec(months, { rent: "250", labor: "500", otherFixed: "80", cogsPct: "35", feePct: "3" }), NOW);
  assert.deepEqual(s.months.map((m) => m.month), ["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"]);
  assert.equal(s.costsFilled, 5);
  assert.equal(Math.round(s.bepMan as number), 1339);
  assert.equal(Math.round(s.profitMan as number), Math.round(1700 * 0.62 - 830));   // 최근 달(8월) 매출 1,700
});

test("이번 달 확인 체크는 가게별·달별로 저장·복원되고, 비우면 지워진다", () => {
  installFakeStorage();
  assert.ok(saveMonth("S1", "2026-10", { done: { cost: true, rivals: true }, memo: "메뉴 가격 점검" }));
  assert.ok(saveMonth("S2", "2026-10", { done: { hours: true }, memo: "" }));
  assert.deepEqual(loadMonth("S1", "2026-10"), { done: { cost: true, rivals: true }, memo: "메뉴 가격 점검" });
  assert.deepEqual(loadMonth("S1", "2026-09"), { done: {}, memo: "" });       // 다른 달과 분리
  assert.equal(loadMonth("S2", "2026-10").done.cost, undefined);               // 다른 가게와 분리
  saveMonth("S1", "2026-10", { done: {}, memo: "  " });
  assert.deepEqual(loadMonth("S1", "2026-10"), { done: {}, memo: "" });
});

test("확인 개수: 기록 항목은 이번 달 기록이 있으면 자동으로 센다", () => {
  assert.equal(monthlyDone({ done: { cost: true }, memo: "" }, false), 1);
  assert.equal(monthlyDone({ done: { cost: true }, memo: "" }, true), 2);
  assert.equal(MONTHLY_ITEMS.length, 5);
  assert.ok(MONTHLY_ITEMS.every((i) => i.title.endsWith("?")));
});

test("점검한 가게 목록: 이름만 저장하고 최근 본 순, 같은 가게는 한 번만", () => {
  installFakeStorage();
  noteMyStore({ storeId: "A", name: "가게A", dong: "당산동" }, 100);
  noteMyStore({ storeId: "B", name: "가게B", dong: "여의동" }, 200);
  noteMyStore({ storeId: "A", name: "가게A", dong: "당산동" }, 300);
  assert.deepEqual(loadMyStores().map((x) => x.storeId), ["A", "B"]);
  assert.equal(monthOf(new Date(2026, 0, 5)), "2026-01");
});
