import assert from "node:assert/strict";
import { test } from "node:test";
import { SCOPE_GROUP, SCOPE_ORDER, SCOPE_STYLE } from "../src/lib/scope.ts";

test("범위 5종은 각각 고유한 묶음 이름과 색을 갖고 순서가 고정이다", () => {
  assert.deepEqual(SCOPE_ORDER, ["store", "radius", "compete", "area", "mine"]);
  assert.deepEqual(SCOPE_ORDER.map((k) => SCOPE_GROUP[k]), ["이 매장", "주변 환경", "경쟁", "상권", "내 가게"]);
  assert.equal(new Set(SCOPE_ORDER.map((k) => SCOPE_STYLE[k].bg)).size, 5);
  for (const k of SCOPE_ORDER) assert.match(SCOPE_STYLE[k].fg, /^#[0-9A-F]{6}$/i);
});

test("묶음 한 줄 설명이 다섯 범위 모두에 있다", async () => {
  const { SCOPE_HINT } = await import("../src/lib/scope.ts");
  for (const k of SCOPE_ORDER) assert.ok(SCOPE_HINT[k].length >= 8, k);
});

test("범위 라벨 글자색은 배경과 대비 4.5:1 이상이다", () => {
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  for (const k of SCOPE_ORDER) {
    const { fg, bg } = SCOPE_STYLE[k];
    assert.ok((Math.max(lum(fg), lum(bg)) + 0.05) / (Math.min(lum(fg), lum(bg)) + 0.05) >= 4.5, k);
  }
});
