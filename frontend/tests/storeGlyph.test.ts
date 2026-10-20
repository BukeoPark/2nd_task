import assert from "node:assert/strict";
import { test } from "node:test";
import { FALLBACK_GLYPH, LEGEND_GLYPHS, SVC_GLYPHS, glyphFontSize, glyphFor } from "../src/lib/storeGlyph.ts";

test("서울시 외식 10개 업종이 모두 서로 다른 모양을 갖는다", () => {
  const codes = Array.from({ length: 10 }, (_, i) => `CS1000${String(i + 1).padStart(2, "0")}`);
  assert.deepEqual(Object.keys(SVC_GLYPHS).sort(), codes);
  assert.equal(new Set(codes.map((c) => SVC_GLYPHS[c].glyph)).size, 10); // 헷갈리지 않게 겹치지 않는다
  assert.equal(new Set(codes.map((c) => SVC_GLYPHS[c].label)).size, 10);
});

test("요청한 업종 모양: 치킨·커피·술집·한식·중식", () => {
  assert.equal(glyphFor("CS100007").glyph, "🍗");
  assert.equal(glyphFor("CS100010").glyph, "☕");
  assert.equal(glyphFor("CS100009").glyph, "🍺");
  assert.equal(glyphFor("CS100001").glyph, "🍚");
  assert.equal(glyphFor("CS100002").glyph, "🍜");
});

test("업종 대응이 없거나 모르는 값은 일반 식당 모양이고, 범례는 업종 10개 + 기타다", () => {
  for (const v of [null, undefined, "", "CS999999"]) assert.deepEqual(glyphFor(v), FALLBACK_GLYPH);
  assert.equal(LEGEND_GLYPHS.length, 11);
  assert.equal(LEGEND_GLYPHS.at(-1), FALLBACK_GLYPH);
});

test("이모티콘 글자 크기는 점 크기에 비례하되 하한이 있다", () => {
  assert.equal(glyphFontSize(30), 19);
  assert.equal(glyphFontSize(22), 14);
  assert.equal(glyphFontSize(10), 9); // 너무 작으면 하한
});
