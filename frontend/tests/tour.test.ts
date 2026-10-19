import assert from "node:assert/strict";
import { test } from "node:test";
import { MODES } from "../src/lib/mode.ts";
import { placeTip, shouldWelcome, TOURS, tourStorageKey } from "../src/lib/tour.ts";

test("모드마다 튜토리얼이 있고, 단계 id 는 겹치지 않으며, 대상이 없을 때 말할 문구가 있다", () => {
  for (const m of MODES) {
    const steps = TOURS[m];
    assert.ok(steps.length >= 6, m);
    assert.equal(new Set(steps.map((s) => s.id)).size, steps.length, m);
    for (const s of steps) {
      assert.ok(s.title.length > 0 && s.body.length > 0, `${m}/${s.id}`);
      assert.ok(s.target.length > 0);
    }
  }
  // 매장·후보를 먼저 골라야 나타나는 요소는 지금 없을 때를 위한 문구를 갖는다
  for (const id of ["report"]) assert.ok(TOURS.owner.find((s) => s.id === id)?.fallback);
  for (const id of ["compare-add", "compare-open"]) assert.ok(TOURS.founder.find((s) => s.id === id)?.fallback);
});

test("처음 방문이면 환영 팝업을 띄우고, 끝낸 모드는 다시 띄우지 않는다(모드별로 따로 기억)", () => {
  assert.equal(shouldWelcome(null), true);
  assert.equal(shouldWelcome("done"), false);
  assert.notEqual(tourStorageKey("owner"), tourStorageKey("founder"));
});

test("말풍선은 원하는 방향에 들어가면 그대로, 모자라면 반대쪽으로, 항상 화면 안에 둔다", () => {
  const view = { width: 1000, height: 700 };
  const tip = { width: 300, height: 140 };
  const bottom = placeTip({ left: 400, top: 10, width: 100, height: 40 }, tip, view, "bottom");
  assert.equal(bottom.placement, "bottom");
  assert.equal(bottom.top, 10 + 40 + 12);
  const flipped = placeTip({ left: 400, top: 600, width: 100, height: 40 }, tip, view, "bottom");
  assert.equal(flipped.placement, "top");
  assert.ok(flipped.top + tip.height <= 600);
  const edge = placeTip({ left: 960, top: 300, width: 30, height: 30 }, tip, view, "bottom");
  assert.ok(edge.left + tip.width <= view.width - 8 && edge.left >= 8);
  const right = placeTip({ left: 20, top: 300, width: 300, height: 100 }, tip, view, "right");
  assert.equal(right.placement, "right");
  assert.equal(right.left, 20 + 300 + 12);
});
