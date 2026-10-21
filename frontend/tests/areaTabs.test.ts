import assert from "node:assert/strict";
import { test } from "node:test";
import { AREA_QUESTION, AREA_TAB_LABEL, AREA_TAB_STYLE, areaTabsFor } from "../src/lib/areaTabs.ts";

test("요약이 첫 항목이고 행정동에만 세부 상권이 있으며 매장 목록은 항상 마지막이다", () => {
  for (const mode of ["owner", "founder"] as const) {
    const dong = areaTabsFor("dong", mode), trdar = areaTabsFor("trdar", mode);
    assert.equal(dong[0], "summary"); assert.equal(trdar[0], "summary");
    assert.equal(dong.at(-1), "stores"); assert.equal(trdar.at(-1), "stores");
    assert.ok(dong.includes("trdars") && !trdar.includes("trdars" as never));
  }
});

test("모드마다 먼저 보는 순서가 다르다: 자영업자는 경쟁 변화·시간대 수요, 예비 창업자는 성장성·경쟁·수요·입지 → 비용", () => {
  assert.deepEqual(areaTabsFor("trdar", "owner"), ["summary", "stability", "demand", "growth", "location", "traits", "stores"]);
  assert.deepEqual(areaTabsFor("trdar", "founder"), ["summary", "growth", "stability", "demand", "location", "cost", "traits", "stores"]);
});

test("예비 창업자 모드에만 비용 점검이 있고, 현장 확인 메뉴는 없다", () => {
  assert.ok(!areaTabsFor("dong", "owner").includes("cost" as never) && !areaTabsFor("dong", "founder").includes("visit" as never));
  assert.ok(areaTabsFor("dong", "founder").includes("cost"));
});

test("모든 항목에 질문형 제목이 있고(물음표가 있음) 두 모드의 관점이 다른 항목이 있다", () => {
  const ids = Object.keys(AREA_TAB_LABEL) as (keyof typeof AREA_QUESTION)[];
  for (const id of ids) for (const m of ["owner", "founder"] as const) assert.ok(AREA_QUESTION[id][m].includes("?"), `${id}/${m}`);
  assert.ok(ids.some((id) => AREA_QUESTION[id].owner !== AREA_QUESTION[id].founder));
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

test("유형은 요약에 통합되어 별도 메뉴가 없다", () => {
  for (const mode of ["owner", "founder"] as const) for (const level of ["dong", "trdar"] as const) assert.ok(!areaTabsFor(level, mode).includes("type"));
});
