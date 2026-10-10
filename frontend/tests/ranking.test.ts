import assert from "node:assert/strict";
import { test } from "node:test";
import { rankBubbles } from "../src/lib/ranking.ts";

const b = (code: string, name: string, value: number | null, size: number | null = 10) => ({ code, name, value, size });

test("값 큰 순으로 세우고 같은 값은 같은 순위(1, 2, 2, 4)", () => {
  const rows = rankBubbles([b("a", "가", 5), b("b", "나", 9), b("c", "다", 5), b("d", "라", 1)]);
  assert.deepEqual(rows.map((r) => [r.item.code, r.rank]), [["b", 1], ["a", 2], ["c", 2], ["d", 4]]);
});

test("값이 없는 항목은 0 이 아니라 맨 아래, 순위 없음", () => {
  const rows = rankBubbles([b("a", "가", null), b("b", "나", 0), b("c", "다", 3)]);
  assert.deepEqual(rows.map((r) => [r.item.code, r.rank]), [["c", 1], ["b", 2], ["a", null]]);
});

test("음수(증감률 하락)도 값 순서대로 — 0 보다 아래", () => {
  const rows = rankBubbles([b("a", "가", -4.2), b("b", "나", 1.1), b("c", "다", -0.5)]);
  assert.deepEqual(rows.map((r) => r.item.code), ["b", "c", "a"]);
});

test("같은 값이면 점포 수 많은 순, 그다음 이름 순이고 입력 배열은 그대로", () => {
  const input = [b("a", "나", 5, 10), b("b", "가", 5, 10), b("c", "다", 5, 30)];
  const rows = rankBubbles(input);
  assert.deepEqual(rows.map((r) => r.item.code), ["c", "b", "a"]);
  assert.deepEqual(input.map((x) => x.code), ["a", "b", "c"]);
});

test("빈 목록", () => {
  assert.deepEqual(rankBubbles([]), []);
});
