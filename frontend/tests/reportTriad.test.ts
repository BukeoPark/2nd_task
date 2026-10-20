import assert from "node:assert/strict";
import { test } from "node:test";
import { STANDING_CAUTIONS, buildTriad } from "../src/lib/reportTriad.ts";

const tiles = [1, 2, 3, 4].map((n) => ({ label: `지표${n}`, value: `${n}만원`, note: n === 1 ? "2026년 2분기" : "" }));

test("확인된 사실은 리포트 타일 앞 3개를 그대로 옮기고 값·기간을 함께 쓴다", () => {
  const t = buildTriad({ mode: "founder", tiles, cautions: [], checklist: [] });
  assert.deepEqual(t.facts, ["지표1: 1만원 (2026년 2분기)", "지표2: 2만원", "지표3: 3만원"]);
});

test("주의할 점에는 항상 붙는 경고가 들어가고, 표본 안내가 맨 앞이며 4개를 넘지 않는다", () => {
  const t = buildTriad({ mode: "owner", tiles, cautions: ["신호 A", "신호 B", "신호 C"], checklist: [], sampleNote: "점포가 7곳뿐이라 해석을 보류했어요." });
  assert.equal(t.cautions[0], "점포가 7곳뿐이라 해석을 보류했어요.");
  assert.equal(t.cautions.length, 4);
  const noSignals = buildTriad({ mode: "owner", tiles, cautions: [], checklist: [] });
  for (const c of STANDING_CAUTIONS.owner) assert.ok(noSignals.cautions.includes(c));
  assert.match(noSignals.cautions.join(" "), /실제 매출이 아니에요/);
});

test("모드마다 경고 문구가 다르다(예비 창업자는 성공을 뜻하지 않는다고 말함)", () => {
  assert.match(buildTriad({ mode: "founder", tiles, cautions: [], checklist: [] }).cautions.join(" "), /창업 성공을 뜻하지 않아요/);
  assert.doesNotMatch(buildTriad({ mode: "owner", tiles, cautions: [], checklist: [] }).cautions.join(" "), /창업 성공/);
});

test("직접 확인할 것은 리포트의 확인 목록 앞 4개, 없으면 빈 칸 대신 안내", () => {
  assert.equal(buildTriad({ mode: "owner", tiles, cautions: [], checklist: ["a", "b", "c", "d", "e"] }).todo.length, 4);
  assert.match(buildTriad({ mode: "owner", tiles: [], cautions: [], checklist: [] }).todo[0], /직접 확인/);
  assert.match(buildTriad({ mode: "owner", tiles: [], cautions: [], checklist: [] }).facts[0], /자료 없음/);
});

test("점수·순위·확률 표현이 없다", () => {
  const all = JSON.stringify(STANDING_CAUTIONS);
  assert.doesNotMatch(all, /점수|순위|성공 확률|추천 지역/);
});
