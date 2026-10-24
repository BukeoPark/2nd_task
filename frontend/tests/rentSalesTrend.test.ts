import assert from "node:assert/strict";
import { test } from "node:test";
import { rentSalesTrend } from "../src/lib/rentSalesTrend.ts";
test("임대료와 매출을 같은 분기·같은 시작값으로 정렬한다", () => {
 const r = rentSalesTrend([{quarter:"202501",value:50},{quarter:"202502",value:55},{quarter:"202503",value:null}], [{quarter:"20251",per_store_month:200},{quarter:"20252",per_store_month:180},{quarter:"20253",per_store_month:0}]);
 assert.deepEqual(r?.labels,["20251","20252","20253"]);
 assert.deepEqual(r?.sales,[100,90,0]);
 assert.equal(r?.rent[0],100); assert.ok(Math.abs(r!.rent[1]! - 110)<1e-8);assert.equal(r?.rent[2],null);
});
test("겹치는 유효 분기가 둘 미만이거나 기준값이 0이면 비교하지 않는다", () => {
 assert.equal(rentSalesTrend([{quarter:"202501",value:50}], [{quarter:"20251",per_store_month:100}]),null);
 assert.equal(rentSalesTrend([{quarter:"202501",value:0},{quarter:"202502",value:0}], [{quarter:"20251",per_store_month:100},{quarter:"20252",per_store_month:110}]),null);
 assert.equal(rentSalesTrend([{quarter:"202501",value:50},{quarter:"202502",value:55}], [{quarter:"20241",per_store_month:100}]),null);
});
