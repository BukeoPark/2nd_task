import assert from "node:assert/strict";
import { test } from "node:test";
import { BLOCKS, blocksOf, GROUP_IDS } from "../src/lib/panelGroups.ts";
import { SCOPE_ORDER } from "../src/lib/scope.ts";

test("묶음은 범위 라벨의 네 범위와 같고 순서도 같다", () => {
  assert.deepEqual(GROUP_IDS, SCOPE_ORDER);
});

test("모든 블록은 정확히 한 묶음에 있고, 묶음마다 블록이 하나 이상이다", () => {
  const ids = BLOCKS.map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length, "블록 id 중복");
  for (const g of GROUP_IDS) assert.ok(blocksOf(g).length >= 1, `${g} 묶음이 비어 있음`);
  assert.equal(GROUP_IDS.flatMap(blocksOf).length, BLOCKS.length);
});

test("묶음별 블록 순서", () => {
  assert.deepEqual(blocksOf("store"), ["basic", "google", "history"]);
  assert.deepEqual(blocksOf("radius"), ["competition", "radius"]);
  assert.deepEqual(blocksOf("area"), ["area-links", "area-model", "area-extra"]);
  assert.deepEqual(blocksOf("mine"), ["checkup", "benchmark"]);
});
