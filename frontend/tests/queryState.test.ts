import assert from "node:assert/strict";
import { test } from "node:test";
import { canAct, classifyBubbles, viewState } from "../src/lib/queryState.ts";

const ok = { isPending: false, isError: false, isPlaceholderData: false, hasData: true };

test("최초 로딩은 보여줄 데이터가 없을 때만", () => {
  assert.equal(viewState({ ...ok, isPending: true, hasData: false }), "loading");
});

test("조건 변경 후 재조회: 이전 조건의 데이터가 남아 있으면 refetching 이고 눌러서 진행할 수 없다", () => {
  const s = viewState({ ...ok, isPlaceholderData: true });
  assert.equal(s, "refetching");
  assert.equal(canAct(s), false);
});

test("정상 결과 0곳, 자료 없음, 정상은 서로 다르다", () => {
  assert.equal(viewState(ok, { empty: true }), "empty");
  assert.equal(viewState(ok, { noData: true }), "no-data");
  assert.equal(viewState(ok), "ready");
  assert.ok(canAct("ready") && canAct("empty") && canAct("no-data"));
});

test("조회 실패는 데이터가 남아 있어도 error — 이전 결과로 계속 진행하지 않는다", () => {
  assert.equal(viewState({ ...ok, isError: true }), "error");
  assert.equal(viewState({ ...ok, isError: true, isPlaceholderData: true }), "error");
  assert.equal(canAct("error"), false);
  assert.equal(viewState({ isPending: false, isError: false, isPlaceholderData: false, hasData: false }), "error");
});

test("로딩·재조회 중에는 비교·상세로 진행할 수 없다", () => {
  assert.equal(canAct("loading"), false);
});

test("버블 분류: 점포 0곳과 값 없음을 구분한다", () => {
  assert.deepEqual(classifyBubbles("stores", [{ size: 0, value: 0 }, { size: 0, value: 0 }]), { empty: true });
  assert.deepEqual(classifyBubbles("per_store_month", [{ size: 3, value: null }, { size: 8, value: null }]), { noData: true });
  assert.deepEqual(classifyBubbles("per_store_month", [{ size: 3, value: null }, { size: 8, value: 120 }]), {});
  assert.deepEqual(classifyBubbles("stores", [{ size: 3, value: 3 }]), {}); // 점포 수 지표는 값이 곧 점포 수라 '자료 없음'이 없다
  assert.deepEqual(classifyBubbles("stores", []), { empty: true });
});
