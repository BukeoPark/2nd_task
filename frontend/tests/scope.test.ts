import assert from "node:assert/strict";
import { test } from "node:test";
import { SCOPE_GROUP, SCOPE_ORDER, SCOPE_STYLE } from "../src/lib/scope.ts";

test("범위 4종은 각각 고유한 묶음 이름과 색을 갖고 순서가 고정이다", () => {
  assert.deepEqual(SCOPE_ORDER, ["store", "radius", "area", "mine"]);
  assert.deepEqual(SCOPE_ORDER.map((k) => SCOPE_GROUP[k]), ["이 매장", "주변", "상권", "내 가게"]);
  assert.equal(new Set(SCOPE_ORDER.map((k) => SCOPE_STYLE[k].bg)).size, 4);
  for (const k of SCOPE_ORDER) assert.match(SCOPE_STYLE[k].fg, /^#[0-9A-F]{6}$/i);
});

test("묶음 한 줄 설명이 네 범위 모두에 있다", async () => {
  const { SCOPE_HINT } = await import("../src/lib/scope.ts");
  for (const k of SCOPE_ORDER) assert.ok(SCOPE_HINT[k].length >= 8, k);
});
