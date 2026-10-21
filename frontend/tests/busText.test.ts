import assert from "node:assert/strict";
import { test } from "node:test";
import { busCountNote, busCountText, busLinkedText, busUsageLines } from "../src/lib/busText.ts";

test("정류장 수: 0곳(범위 안)과 확인 불가(범위 밖)와 이상(일부 범위 밖)을 구분한다", () => {
  assert.equal(busCountText({ count: 0, count_state: "zero" }), "0곳");
  assert.equal(busCountText({ count: 0, count_state: "incomplete_zero" }), "확인 불가");
  assert.equal(busCountText({ count: 7, count_state: "lower_bound" }), "7곳 이상");
  assert.equal(busCountText({ count: 7, count_state: "ok" }), "7곳");
  assert.match(busCountNote({ radius_m: 250, count_state: "zero" }, null), /자료 누락 아님/);
  assert.match(busCountNote({ radius_m: 1000, count_state: "incomplete_zero" }, null), /수집 범위를 벗어나/);
  assert.match(busCountNote({ radius_m: 1000, count_state: "lower_bound" }, 40), /더 많을 수/);
  assert.equal(busCountNote({ radius_m: 500, count_state: "ok" }, 1234), "가장 가까운 곳 1,234m(직선)");
});

test("연결 비율: 정류장이 없으면 만들지 않는다", () => {
  assert.equal(busLinkedText({ count: 19, linked: 13, linked_ratio: 0.6842 }), "이용량 연결 13/19곳 (68%)");
  assert.equal(busLinkedText({ count: 0, linked: 0, linked_ratio: null }), "");
});

test("이용량: 승차·하차를 따로, 일부 연결이면 확인된 정류장만 더한 값, 연결 0이면 0명이 아니라 자료 없음", () => {
  const partial = busUsageLines({ usage_state: "partial", boardings_observed: 16904, alightings_observed: 15777 });
  assert.equal(partial.boardings, "16,904명 (이용량이 확인된 정류장만 더한 값)");
  assert.equal(partial.alightings, "15,777명 (이용량이 확인된 정류장만 더한 값)");
  assert.equal(partial.partial, true);
  const full = busUsageLines({ usage_state: "all_linked", boardings_observed: 100, alightings_observed: 0 });
  assert.deepEqual(full, { boardings: "100명", alightings: "0명", partial: false });   // 실제 0명은 0명
  const none = busUsageLines({ usage_state: "none_linked", boardings_observed: null, alightings_observed: null });
  assert.equal(none.boardings, "이용량 자료 없음");
  assert.equal(busUsageLines({ usage_state: "no_stops", boardings_observed: null, alightings_observed: null }).boardings, "해당 없음");
  assert.ok(!Object.keys(partial).some((k) => /total|sum|transfer/.test(k)));   // 합계·환승 칸을 만들지 않는다
});
