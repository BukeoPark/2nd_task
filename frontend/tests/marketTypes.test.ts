import assert from "node:assert/strict";
import { test } from "node:test";
import { marketType } from "../src/lib/marketTypes.ts";
test("원천의 상권 유형은 이름·코드로 연결하고 행정동을 상권으로 오분류하지 않는다", () => {
 assert.equal(marketType("D")?.label,"발달상권");
 assert.equal(marketType("골목상권")?.code,"A");
 assert.equal(marketType("전통시장상권")?.code,"R");
 assert.equal(marketType("관광특구")?.code,"U");
 assert.equal(marketType("행정동"),null);
});
