import assert from "node:assert/strict";
import { test } from "node:test";
import { compactPeriod } from "../src/lib/format.ts";

test("compactPeriod: 기간 문구를 한 줄로 줄이고, 다른 형식은 그대로 둔다", () => {
  assert.equal(compactPeriod("2025년 3분기~2026년 2분기"), "25.3Q~26.2Q");
  assert.equal(compactPeriod("2026년 2분기"), "26.2Q");
  assert.equal(compactPeriod("2026-06"), "2026-06");
  assert.equal(compactPeriod("기준 시점 없음"), "기준 시점 없음");
});
