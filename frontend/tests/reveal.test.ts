import assert from "node:assert/strict";
import { test } from "node:test";
import { revealDelta } from "../src/lib/reveal.ts";

const view = { w: 1000, h: 800 };
const safe = { left: 408, top: 104, right: 48, bottom: 48 }; // 패널 360 + 여백, 상단 바 56 + 여백

test("잘 보이는 곳에 있으면 움직이지 않는다", () => {
  assert.equal(revealDelta({ x: 700, y: 400 }, view, safe), null);
  assert.equal(revealDelta({ x: 408, y: 104 }, view, safe), null); // 경계 포함
});

test("왼쪽 패널 뒤에 가려졌으면 보이는 영역 가운데로 오도록 중심을 점 쪽으로 옮긴다", () => {
  // 보이는 영역 가운데 = ((408+952)/2, (104+752)/2) = (680, 428)
  assert.deepEqual(revealDelta({ x: 100, y: 428 }, view, safe), { dx: -580, dy: 0 });
});

test("화면 밖(오른쪽·아래)에 있어도 가운데로 가져온다", () => {
  assert.deepEqual(revealDelta({ x: 1200, y: 900 }, view, safe), { dx: 520, dy: 472 });
});

test("상단 바에 가려진 점도 옮긴다", () => {
  const d = revealDelta({ x: 700, y: 20 }, view, safe);
  assert.deepEqual(d, { dx: 20, dy: -408 });
});

test("보이는 영역이 없을 만큼 좁은 화면이면 옮기지 않는다", () => {
  assert.equal(revealDelta({ x: 10, y: 10 }, { w: 400, h: 300 }, safe), null);
});
