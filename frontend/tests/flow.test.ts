import assert from "node:assert/strict";
import { test } from "node:test";
import { flowStatus, type ProgressKey } from "../src/lib/flow.ts";
import { MODES, parseMode, resolveMode, withMode } from "../src/lib/mode.ts";
import { searchTarget } from "../src/lib/searchTarget.ts";

const seen = (...k: ProgressKey[]) => new Set<ProgressKey>(k);

test("자영업자 흐름: 내 가게 → 상권 → 주변 비교 → 업종 → 내 가게 견주기 → 리포트 순서로 다음 단계를 가리킨다", () => {
  assert.equal(flowStatus("owner", seen()).current, 0);
  assert.equal(flowStatus("owner", seen("store")).current, 1);
  assert.equal(flowStatus("owner", seen("store", "area")).current, 2);
  assert.equal(flowStatus("owner", seen("store", "area", "metric", "svc")).current, 4);
  const all = flowStatus("owner", seen("place", "area", "metric", "svc", "record", "report"));
  assert.equal(all.finished, true);
  assert.equal(all.current, 5);
  assert.equal(all.steps.every((s) => s.done), true);
});

test("예비 창업자 흐름: 지역 → 업종 → 후보 담기 → 입지 비교 → 인사이트 리포트", () => {
  assert.equal(flowStatus("founder", seen()).steps.length, 5);
  assert.equal(flowStatus("founder", seen("place")).current, 1);
  assert.equal(flowStatus("founder", seen("place", "svc")).current, 2);
  assert.equal(flowStatus("founder", seen("area", "svc", "basket2")).current, 3);
  assert.equal(flowStatus("founder", seen("place", "svc", "basket2", "compare")).current, 4);
  assert.equal(flowStatus("founder", seen("place", "svc", "basket2", "compare", "report")).finished, true);
});

test("앞 단계를 건너뛰어도 막지 않고 비어 있는 첫 단계를 안내한다", () => {
  const f = flowStatus("owner", seen("svc"));
  assert.equal(f.current, 0);
  assert.deepEqual(f.steps.map((s) => s.done), [false, false, false, true, false, false]);
  assert.match(f.hint, /검색/);
});

test("모드: 주소 > 기억한 값 > 기본(자영업자) 순으로 정하고, 모르는 값은 무시한다", () => {
  assert.deepEqual(MODES, ["owner", "founder"]);
  assert.equal(parseMode("?mode=founder"), "founder");
  assert.equal(parseMode("?mode=admin"), null);
  assert.equal(parseMode(""), null);
  assert.equal(resolveMode("?mode=founder", "owner"), "founder");
  assert.equal(resolveMode("", "founder"), "founder");
  assert.equal(resolveMode("", "x"), "owner");
  assert.equal(resolveMode("", null), "owner");
  assert.equal(withMode("?a=1", "founder"), "?a=1&mode=founder");
  assert.equal(withMode("?mode=owner&a=1", "founder"), "?mode=founder&a=1");
});

test("검색 결과 종류별 이동: 매장은 상세로, 상권·행정동은 요약을 열고, 주소·역은 위치만", () => {
  assert.deepEqual(searchTarget({ kind: "store", store_id: "S1" }), { level: 3, open: null, storeId: "S1" });
  assert.deepEqual(searchTarget({ kind: "trdar", level: "trdar", code: "3120148" }), { level: 4, open: { unit: "trdar", code: "3120148" }, storeId: null });
  assert.deepEqual(searchTarget({ kind: "dong", level: "dong", code: "11470510" }), { level: 6, open: { unit: "dong", code: "11470510" }, storeId: null });
  assert.deepEqual(searchTarget({ kind: "address" }), { level: 3, open: null, storeId: null });
  assert.deepEqual(searchTarget({ kind: "station" }), { level: 4, open: null, storeId: null });
});
