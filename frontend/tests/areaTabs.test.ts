import assert from "node:assert/strict";
import { test } from "node:test";
import { AREA_TAB_LABEL, areaTabsFor } from "../src/lib/areaTabs.ts";

test("행정동에만 세부 상권 항목이 있고, 매장 목록은 항상 마지막이다", () => {
  assert.deepEqual(areaTabsFor("dong"), ["growth", "stability", "demand", "location", "trdars", "stores"]);
  assert.deepEqual(areaTabsFor("trdar"), ["growth", "stability", "demand", "location", "stores"]);
});

test("모든 항목에 레일 이름이 있다", () => {
  for (const id of areaTabsFor("dong")) assert.ok(AREA_TAB_LABEL[id].length > 0);
});
