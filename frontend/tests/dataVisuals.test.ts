import assert from "node:assert/strict";
import { test } from "node:test";
import { breakevenScale, populationShares } from "../src/lib/dataVisuals.ts";

test("인구 비중은 상주·직장 합계를 같은 축으로 나눈다", () => {
  assert.deepEqual(populationShares(750, 250), { residentPct: 75, workerPct: 25 });
  assert.deepEqual(populationShares(0, 100), { residentPct: 0, workerPct: 100 });
});
test("인구 자료 없음과 합계 0은 비중 그래프를 만들지 않는다", () => {
  assert.equal(populationShares(null, 250), null);
  assert.equal(populationShares(100, undefined), null);
  assert.equal(populationShares(0, 0), null);
  assert.equal(populationShares(-1, 50), null);
  assert.equal(populationShares(Infinity, 50), null);
});
test("손익분기와 매출을 같은 축으로 표현하고 부족액을 계산한다", () => {
  const scale = breakevenScale(1500, 1200)!;
  assert.equal(scale.gap, -300);
  assert.ok(scale.revenuePct! < scale.targetPct);
  assert.ok(Math.abs(scale.revenuePct! / scale.targetPct - 0.8) < 1e-12);
});
test("매출이 손익분기를 넘어도 막대가 축을 벗어나지 않는다", () => {
  const scale = breakevenScale(1500, 3000)!;
  assert.equal(scale.gap, 1500);
  assert.ok(scale.revenuePct! > scale.targetPct && scale.revenuePct! <= 100);
});
test("매출 미입력은 매출 0으로 그리지 않는다", () => {
  const scale = breakevenScale(1500, null)!;
  assert.equal(scale.revenuePct, null);
  assert.equal(scale.gap, null);
  assert.equal(breakevenScale(1500, 0)!.revenuePct, 0);
});
test("유효하지 않은 비용·매출은 시각화를 보류한다", () => {
  assert.equal(breakevenScale(-1, 0), null);
  assert.equal(breakevenScale(1500, NaN), null);
  assert.equal(breakevenScale(Infinity, null), null);
  assert.equal(breakevenScale(0, 0)!.targetPct, 0);
});
