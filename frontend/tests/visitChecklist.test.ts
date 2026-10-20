import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_UNITS, MEMO_MAX, VISIT_ITEMS, VISIT_KEY, doneCount, emptyVisit, loadVisit, sanitizeVisit, saveVisit, unitKey } from "../src/lib/visitChecklist.ts";
import { installFakeStorage } from "./_fakeStorage.ts";

test("점검 항목 6개: 보행 동선·가시성·경쟁·실제 영업 상태·임대 조건·시간대별 분위기", () => {
  assert.deepEqual(VISIT_ITEMS.map((i) => i.title), ["보행 동선·접근성", "매장 가시성", "유사 업종 경쟁 현황", "실제 영업 상태", "임대 조건·관리비", "주중·주말·시간대별 분위기"]);
});

test("체크와 메모는 지역(단위:코드)별로 따로 저장·복원한다", () => {
  installFakeStorage();
  saveVisit("trdar", "A", { checked: { walk: true }, memo: { walk: "역에서 6분" } });
  saveVisit("dong", "A", { checked: { view: true }, memo: {} });
  assert.deepEqual(loadVisit("trdar", "A"), { checked: { walk: true }, memo: { walk: "역에서 6분" } });
  assert.equal(doneCount(loadVisit("dong", "A")), 1);
  assert.equal(doneCount(loadVisit("trdar", "B")), 0);
  assert.equal(unitKey("trdar", "A"), "trdar:A");
});

test("모르는 항목·긴 메모·잘못된 모양은 걸러 내고 메모는 200자로 자른다", () => {
  const s = sanitizeVisit({ checked: { walk: true, nope: true, view: "yes" }, memo: { walk: "x".repeat(500), nope: "z", lease: "   " } });
  assert.deepEqual(s.checked, { walk: true });
  assert.equal(s.memo.walk.length, MEMO_MAX);
  assert.deepEqual(Object.keys(s.memo), ["walk"]);
  assert.deepEqual(sanitizeVisit(null), emptyVisit());
});

test("비운 지역은 저장소에서 지우고, 지역이 너무 많이 쌓이면 오래된 것부터 지운다", () => {
  const { data } = installFakeStorage();
  saveVisit("trdar", "A", { checked: { walk: true }, memo: {} });
  saveVisit("trdar", "A", emptyVisit());
  assert.equal(JSON.stringify(JSON.parse(data.get(VISIT_KEY) as string)), "{}");
  for (let i = 0; i < MAX_UNITS + 5; i++) saveVisit("trdar", `U${i}`, { checked: { walk: true }, memo: {} });
  const all = JSON.parse(data.get(VISIT_KEY) as string);
  assert.equal(Object.keys(all).length, MAX_UNITS);
  assert.ok(!("trdar:U0" in all) && "trdar:U" + (MAX_UNITS + 4) in all);
});

test("저장소가 막히면 저장 실패(false), 읽기는 빈 상태", () => {
  installFakeStorage({ failWrite: true, failRead: true });
  assert.equal(saveVisit("trdar", "A", { checked: { walk: true }, memo: {} }), false);
  assert.deepEqual(loadVisit("trdar", "A"), emptyVisit());
});
