import assert from "node:assert/strict";
import { test } from "node:test";
import { expandForTour, restoreFolds, type FoldLike, type FoldLog } from "../src/lib/tourFolds.ts";

/** <details> 흉내 — open 을 바꾸면 toggle 이 '나중에' 불린다(브라우저처럼 비동기). 사용자 조작은 user() 로. */
function fakeFold(open: boolean) {
  const subs = new Set<() => void>();
  let value = open;
  const pending: (() => void)[] = [];
  const fold: FoldLike & { flush(): void; user(next: boolean): void } = {
    get open() { return value; },
    set open(v: boolean) { if (v !== value) { value = v; pending.push(() => subs.forEach((f) => f())); } },
    addEventListener: (_t, fn) => { subs.add(fn); },
    removeEventListener: (_t, fn) => { subs.delete(fn); },
    flush() { while (pending.length) pending.shift()!(); },
    user(next: boolean) { fold.open = next; fold.flush(); },
  };
  return fold;
}

test("접혀 있던 영역은 단계 동안 펼치고, 단계가 끝나면 원래대로 접는다", () => {
  const log: FoldLog = new Map();
  const f = fakeFold(false);
  expandForTour(f, log); f.flush();
  assert.equal(f.open, true);
  restoreFolds(log);
  assert.equal(f.open, false);
  assert.equal(log.size, 0);
});

test("원래부터 열려 있던 영역은 건드리지 않는다(되돌릴 때도 열린 채)", () => {
  const log: FoldLog = new Map();
  const f = fakeFold(true);
  expandForTour(f, log); f.flush();
  restoreFolds(log);
  assert.equal(f.open, true);
});

test("튜토리얼 중 사용자가 직접 닫으면 다시 펼치지 않는다", () => {
  const log: FoldLog = new Map();
  const f = fakeFold(false);
  expandForTour(f, log); f.flush();
  f.user(false);                       // 사용자가 닫음
  expandForTour(f, log);               // 주기적 재측정이 다시 불러도
  assert.equal(f.open, false);
  restoreFolds(log);
  assert.equal(f.open, false);
});

test("튜토리얼 중 사용자가 직접 연(펼친 뒤 닫았다 다시 연) 상태는 단계가 끝나도 접지 않는다", () => {
  const log: FoldLog = new Map();
  const f = fakeFold(false);
  expandForTour(f, log); f.flush();
  f.user(false); f.user(true);
  restoreFolds(log);
  assert.equal(f.open, true);
});

test("우리가 펼치며 생긴 toggle 은 사용자 조작으로 세지 않고, 같은 영역을 반복 호출해도 한 번만 기록한다", () => {
  const log: FoldLog = new Map();
  const f = fakeFold(false);
  expandForTour(f, log); expandForTour(f, log); f.flush(); expandForTour(f, log);
  assert.equal(log.size, 1);
  restoreFolds(log);
  assert.equal(f.open, false);
});
