import assert from "node:assert/strict";
import { test } from "node:test";
import { AREA_TAB_LABEL, AREA_TAB_STYLE, areaTabsFor } from "../src/lib/areaTabs.ts";

test("요약이 첫 항목이고 행정동에만 세부 상권이 있으며 매장 목록은 항상 마지막이다", () => {
  assert.deepEqual(areaTabsFor("dong"), ["summary", "type", "traits", "growth", "stability", "demand", "location", "trdars", "stores"]);
  assert.deepEqual(areaTabsFor("trdar"), ["summary", "type", "traits", "growth", "stability", "demand", "location", "stores"]);
});

test("예비 창업자 모드에만 비용 점검·현장 확인이 있고, 위치는 입지 다음이다", () => {
  assert.deepEqual(areaTabsFor("trdar", "founder"), ["summary", "type", "traits", "growth", "stability", "demand", "location", "cost", "visit", "stores"]);
  assert.deepEqual(areaTabsFor("dong", "founder").slice(-3), ["visit", "trdars", "stores"]);
  assert.ok(!areaTabsFor("dong", "owner").includes("cost" as never) && !areaTabsFor("dong").includes("visit" as never));
});

test("모든 항목에 레일 이름이 있다", () => {
  for (const id of areaTabsFor("dong", "founder")) assert.ok(AREA_TAB_LABEL[id].length > 0);
});

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

test("항목마다 다른 색을 쓰고, 글자색은 배경과 대비 4.5:1 이상이다", () => {
  const ids = areaTabsFor("dong", "founder");
  assert.equal(new Set(ids.map((id) => AREA_TAB_STYLE[id].fg)).size, ids.length);
  for (const id of ids) assert.ok(contrast(AREA_TAB_STYLE[id].fg, AREA_TAB_STYLE[id].bg) >= 4.5, id);
});
