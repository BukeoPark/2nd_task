import assert from "node:assert/strict";
import { test } from "node:test";
import { breakeven, parseNum } from "../src/lib/breakeven.ts";

const none = { rent: null, labor: null, otherFixed: null, cogsPct: null, feePct: null };

test("입력이 하나도 없으면 empty (0 으로 계산하지 않는다)", () => {
  assert.equal(breakeven(none, null, null).status, "empty");
});

test("손익분기 = 고정비 ÷ (1 − 변동비율), 월 이익·안전마진·동네 평균 대비", () => {
  // 고정비 300+500+100 = 900, 변동비율 35%+5% = 40% → 손익분기 1500
  const b = breakeven({ rent: 300, labor: 500, otherFixed: 100, cogsPct: 35, feePct: 5 }, 2000, 2500);
  assert.equal(b.status, "ok");
  assert.equal(b.fixed, 900);
  assert.ok(Math.abs((b.bep ?? 0) - 1500) < 1e-9);
  assert.ok(Math.abs((b.profit ?? 0) - 300) < 1e-9); // 2000×0.6 − 900
  assert.ok(Math.abs((b.safetyPct ?? 0) - 25) < 1e-9); // (2000−1500)/2000
  assert.ok(Math.abs((b.vsBenchPct ?? 0) - 60) < 1e-9); // 1500/2500
});

test("월 매출이 없으면 이익·안전마진은 null, 동네 평균이 없으면 비교는 null", () => {
  const b = breakeven({ ...none, rent: 400, cogsPct: 30 }, null, null);
  assert.equal(b.status, "ok");
  assert.equal(b.profit, null);
  assert.equal(b.safetyPct, null);
  assert.equal(b.vsBenchPct, null);
});

test("변동비율이 100% 이상이면 손익분기가 없다", () => {
  assert.equal(breakeven({ ...none, rent: 400, cogsPct: 90, feePct: 10 }, null, null).status, "no_margin");
});

test("음수·퍼센트 범위 밖·숫자가 아닌 입력은 invalid", () => {
  assert.equal(breakeven({ ...none, rent: -1 }, null, null).status, "invalid");
  assert.equal(breakeven({ ...none, cogsPct: 120 }, null, null).status, "invalid");
  assert.equal(breakeven({ ...none, rent: parseNum("abc") }, null, null).status, "invalid");
});

test("입력칸 파싱", () => {
  assert.equal(parseNum(""), null);
  assert.equal(parseNum(" 1,200 "), 1200);
  assert.ok(Number.isNaN(parseNum("12가")));
});
