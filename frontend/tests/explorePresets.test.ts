import assert from "node:assert/strict";
import { test } from "node:test";
import { candidatesFor, presetById, PRESETS, type BubbleLike } from "../src/lib/explorePresets.ts";

const b = (code: string, value: number | null, size: number | null, name = code): BubbleLike => ({ code, name, type: null, value, size });
const growing = presetById("growing")!;

test("프리셋 4개는 질문형 제목·지표·정렬 방향을 갖고 id 가 겹치지 않는다", () => {
  assert.equal(PRESETS.length, 4);
  assert.equal(new Set(PRESETS.map((p) => p.id)).size, 4);
  for (const p of PRESETS) assert.ok(p.question.endsWith("?") && p.what.length > 0 && p.caveat.length > 0);
});

test("매출 증가: 0% 초과만, 큰 순. 표본(10곳 미만)·자료 없음·조건 불일치는 따로 센다", () => {
  const r = candidatesFor(growing, [b("a", 5, 30), b("b", 12, 25), b("c", -3, 40), b("d", 20, 6), b("e", null, 50), b("f", 0, 30), b("g", 8, 12)]);
  assert.deepEqual(r.candidates.map((c) => c.code), ["b", "g", "a"]);
  assert.equal(r.excludedSmall, 1);     // d: 점포 6곳
  assert.equal(r.excludedMissing, 1);   // e
  assert.equal(r.notMatching, 2);       // c(-3), f(0)
  assert.equal(r.candidates.find((c) => c.code === "g")?.caution, true);   // 12곳 = 10~19곳 주의
  assert.equal(r.candidates.find((c) => c.code === "a")?.caution, false);
});

test("경쟁이 적은 곳: 점포 10곳 이상 중 적은 순, 0곳은 후보가 아님", () => {
  const p = presetById("low_competition")!;
  const r = candidatesFor(p, [b("a", 30, 30), b("b", 12, 12), b("c", 9, 9), b("d", 0, 0), b("e", 100, 100)]);
  assert.deepEqual(r.candidates.map((c) => c.code), ["b", "a", "e"]);
  assert.equal(r.excludedSmall, 2);   // c(9곳)·d(0곳) — 점포가 10곳 미만이면 후보가 아니다
});

test("가게 수 변화가 작은 곳은 작은 순, 값이 같으면 코드 순으로 항상 같은 결과(재현성)", () => {
  const p = presetById("stable_count")!;
  const input = [b("z", 1.2, 30), b("m", 0.5, 30), b("a", 0.5, 30), b("q", null, 30)];
  const a = candidatesFor(p, input).candidates.map((c) => c.code);
  assert.deepEqual(a, ["a", "m", "z"]);
  assert.deepEqual(candidatesFor(p, [...input].reverse()).candidates.map((c) => c.code), a);
});

test("표시 개수를 넘는 후보는 '더 있음'으로만 센다", () => {
  const many = Array.from({ length: 12 }, (_, i) => b(`u${String(i).padStart(2, "0")}`, i + 1, 30));
  const r = candidatesFor(growing, many, 8);
  assert.equal(r.candidates.length, 8);
  assert.equal(r.more, 4);
});
