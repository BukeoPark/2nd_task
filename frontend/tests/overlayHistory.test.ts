import assert from "node:assert/strict";
import { test } from "node:test";
import { OverlayHistory, type EnvLike } from "../src/lib/overlayHistory.ts";

/** 브라우저 기록 흉내 — back() 은 실제처럼 popstate 를 부르지만 여기서는 바로 부른다. */
function fakeEnv(initial: unknown = { seq: 0 }) {
  const entries: unknown[] = [initial];
  let idx = 0;
  const subs = new Set<() => void>();
  const env: EnvLike = {
    history: {
      get state() { return entries[idx]; },
      pushState(s) { entries.splice(idx + 1); entries.push(s); idx++; },
      replaceState(s) { entries[idx] = s; },
      back() { if (idx > 0) { idx--; subs.forEach((f) => f()); } },
    },
    location: { href: "http://x/?mode=owner" },
    addEventListener: (_t, f) => { subs.add(f); },
    removeEventListener: (_t, f) => { subs.delete(f); },
  };
  return { env, entries, idx: () => idx, forward: () => { if (idx < entries.length - 1) { idx++; subs.forEach((f) => f()); } } };
}

test("창을 열면 기록 한 칸이 쌓이고, 브라우저 뒤로가 그 창을 닫는다", () => {
  const f = fakeEnv(); const oh = new OverlayHistory(f.env);
  let closed = 0;
  const lv = oh.open(() => closed++);
  assert.equal(f.entries.length, 2);
  assert.equal((f.entries[1] as { ov: number; seq: number }).ov, lv);
  assert.equal((f.entries[1] as { seq: number }).seq, 0);       // 원래 화면 표시(seq)는 이어받는다
  f.env.history.back();
  assert.equal(closed, 1);
  assert.equal(oh.depth, 0);
});

test("'← 뒤로' 단추(requestClose)도 같은 길: history.back 으로 닫혀 단추와 브라우저 뒤로 결과가 같다", () => {
  const f = fakeEnv(); const oh = new OverlayHistory(f.env);
  let closed = 0;
  const lv = oh.open(() => closed++);
  oh.requestClose(lv);
  assert.equal(closed, 1);
  assert.equal(f.idx(), 0);
});

test("여러 창은 위에서부터 하나씩만 닫힌다(뒤로 한 번에 한 창)", () => {
  const f = fakeEnv(); const oh = new OverlayHistory(f.env);
  const order: string[] = [];
  oh.open(() => order.push("A"));
  oh.open(() => order.push("B"));
  f.env.history.back();
  assert.deepEqual(order, ["B"]);
  f.env.history.back();
  assert.deepEqual(order, ["B", "A"]);
});

test("앞으로 가기는 창을 다시 열지 않는다", () => {
  const f = fakeEnv(); const oh = new OverlayHistory(f.env);
  let closed = 0;
  oh.open(() => closed++);
  f.env.history.back();
  f.forward();
  assert.equal(closed, 1);
  assert.equal(oh.depth, 0);
});

test("부모가 창을 직접 닫으면(forget) 되감지 않고 기록의 창 표시만 지운다", () => {
  const f = fakeEnv(); const oh = new OverlayHistory(f.env);
  const lv = oh.open(() => undefined);
  oh.forget(lv);
  assert.equal(f.idx(), 1);                                   // 기록 위치는 그대로
  assert.equal((f.entries[1] as { ov?: number }).ov, undefined);
  assert.equal(oh.depth, 0);
  oh.forget(lv);                                              // 두 번 불러도 안전
});

test("기록에 칸이 없는데 닫기를 요청하면(직접 접속·새로고침 뒤 등) 바로 닫는다", () => {
  const f = fakeEnv(); const oh = new OverlayHistory(f.env);
  let closed = 0;
  const lv = oh.open(() => closed++);
  f.entries[1] = { seq: 0 };                                  // 칸의 창 표시가 사라진 상황
  oh.requestClose(lv);
  assert.equal(closed, 1);
  assert.equal(oh.depth, 0);
});

test("Esc 는 가장 위 창만 닫는다(isTop)", () => {
  const f = fakeEnv(); const oh = new OverlayHistory(f.env);
  const a = oh.open(() => undefined), b = oh.open(() => undefined);
  assert.equal(oh.isTop(b), true);
  assert.equal(oh.isTop(a), false);
  f.env.history.back();
  assert.equal(oh.isTop(a), true);
});
