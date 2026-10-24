import assert from "node:assert/strict";
import { test } from "node:test";
import { compactPeriod, formatPerArea, formatRentWon } from "../src/lib/format.ts";

test("compactPeriod: 기간 문구를 한 줄로 줄이고, 다른 형식은 그대로 둔다", () => {
  assert.equal(compactPeriod("2025년 3분기~2026년 2분기"), "25.3Q~26.2Q");
  assert.equal(compactPeriod("2026년 2분기"), "26.2Q");
  assert.equal(compactPeriod("2026-06"), "2026-06");
  assert.equal(compactPeriod("기준 시점 없음"), "기준 시점 없음");
});

test("R-ONE 임대료는 천원 단위가 아니라 원 단위로 보인다", () => {
  assert.equal(formatRentWon(41.9), "41,900원");
  assert.equal(formatRentWon(38.5), "38,500원");
  assert.equal(formatPerArea(41.9), "41,900원/㎡·월");
  assert.equal(formatPerArea(null), "정보 없음");
});
