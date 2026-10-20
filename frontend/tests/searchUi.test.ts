import assert from "node:assert/strict";
import { test } from "node:test";
import { addRecent, groupByKind, highlight, parseRecent, RECENT_MAX } from "../src/lib/searchUi.ts";

test("일치한 글자만 강조하고 나머지는 그대로 둔다", () => {
  assert.deepEqual(highlight("본죽&비빔밥 여의도점", "본죽"), [{ text: "본죽", hit: true }, { text: "&비빔밥 여의도점", hit: false }]);
  assert.deepEqual(highlight("영등포 청과시장", "청과"), [{ text: "영등포 ", hit: false }, { text: "청과", hit: true }, { text: "시장", hit: false }]);
});

test("공백·가운뎃점·대소문자를 무시하고 일치 범위는 원문 기준이다", () => {
  assert.deepEqual(highlight("영등포 청과", "영등포청과"), [{ text: "영등포 청과", hit: true }]);
  assert.deepEqual(highlight("Starbucks 당산점", "starbucks"), [{ text: "Starbucks", hit: true }, { text: " 당산점", hit: false }]);
  assert.deepEqual(highlight("스타·벅스", "벅스"), [{ text: "스타·", hit: false }, { text: "벅스", hit: true }]);
});

test("맞는 글자가 없거나 검색어가 비면 강조하지 않는다", () => {
  assert.deepEqual(highlight("가비1896", "본죽"), [{ text: "가비1896", hit: false }]);
  assert.deepEqual(highlight("가비1896", "  "), [{ text: "가비1896", hit: false }]);
});

test("종류별로 묶되 전체 위치(index)를 남긴다", () => {
  const g = groupByKind([{ kind: "dong" }, { kind: "brand" }, { kind: "store" }, { kind: "store" }]);
  assert.deepEqual(g.map((x) => [x.kind, x.items.map((i) => i.index)]), [["dong", [0]], ["brand", [1]], ["store", [2, 3]]]);
});

test("최근 검색어: 맨 앞에 더하고 중복은 앞으로 옮기며 개수를 제한한다", () => {
  assert.deepEqual(addRecent(["a", "b"], "b"), ["b", "a"]);
  assert.deepEqual(addRecent(["a"], "  "), ["a"]);
  const many = ["1", "2", "3", "4", "5", "6"];
  assert.equal(addRecent(many, "7").length, RECENT_MAX);
  assert.equal(addRecent(many, "7")[0], "7");
});

test("저장된 값이 깨져 있어도 빈 목록으로 돌아온다", () => {
  assert.deepEqual(parseRecent(null), []);
  assert.deepEqual(parseRecent("{oops"), []);
  assert.deepEqual(parseRecent('{"a":1}'), []);
  assert.deepEqual(parseRecent('["본죽", 3, " "]'), ["본죽"]);
});
