import assert from "node:assert/strict";
import { test } from "node:test";
import { flowStatus } from "../src/lib/flow.ts";
import { searchTarget } from "../src/lib/searchTarget.ts";

test("흐름: 검색 → 위치 선택 → 업종 선택 → 후보 지역 비교 순서로 다음 단계를 가리킨다", () => {
  assert.equal(flowStatus({ placeChosen: false, svcChosen: false, basketCount: 0 }).current, 0);
  assert.equal(flowStatus({ placeChosen: true, svcChosen: false, basketCount: 0 }).current, 2);
  assert.equal(flowStatus({ placeChosen: true, svcChosen: true, basketCount: 1 }).current, 3);
  const done = flowStatus({ placeChosen: true, svcChosen: true, basketCount: 2 });
  assert.equal(done.current, 3);
  assert.deepEqual(done.done, [true, true, true, true]);
});

test("앞 단계를 건너뛰어도 막지 않고 비어 있는 첫 단계를 안내한다", () => {
  const f = flowStatus({ placeChosen: false, svcChosen: true, basketCount: 0 });
  assert.equal(f.current, 0);
  assert.deepEqual(f.done, [false, false, true, false]);
});

test("검색 결과 종류별 이동: 매장은 상세로, 상권·행정동은 요약을 열고, 주소·역은 위치만", () => {
  assert.deepEqual(searchTarget({ kind: "store", store_id: "S1" }), { level: 3, open: null, storeId: "S1" });
  assert.deepEqual(searchTarget({ kind: "trdar", level: "trdar", code: "3120148" }), { level: 4, open: { unit: "trdar", code: "3120148" }, storeId: null });
  assert.deepEqual(searchTarget({ kind: "dong", level: "dong", code: "11470510" }), { level: 6, open: { unit: "dong", code: "11470510" }, storeId: null });
  assert.deepEqual(searchTarget({ kind: "address" }), { level: 3, open: null, storeId: null });
  assert.deepEqual(searchTarget({ kind: "station" }), { level: 4, open: null, storeId: null });
});
