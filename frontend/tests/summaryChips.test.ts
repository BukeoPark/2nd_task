import assert from "node:assert/strict";
import { test } from "node:test";
import { buildChips, distanceText, radiusText } from "../src/lib/summaryChips.ts";

const full = {
  sameCategory: { level: "소분류", count: 19, radiusM: 500 },
  anchors: [
    { brand: "starbucks", label: "스타벅스", nearestM: 237 },
    { brand: "daiso", label: "다이소", nearestM: 90 },
  ],
  area: { name: "영등포역(영등포)", kind: "발달상권" },
};

test("주변 경쟁·앵커 거리·소속 상권을 사실 그대로 칩으로 만든다", () => {
  assert.deepEqual(buildChips(full).map((c) => [c.text, c.scope]), [
    ["반경 500m 같은 소분류 19곳", "radius"],
    ["스타벅스 237m", "radius"],
    ["다이소 90m", "radius"],
    ["소속 영등포역(영등포) (발달상권)", "area"],
  ]);
});

test("모르는 값은 칩을 만들지 않는다 — 0 이나 '자료 없음' 칩으로 대신하지 않는다", () => {
  assert.deepEqual(buildChips({ sameCategory: null, anchors: null, area: null }), []);
  const c = buildChips({ ...full, anchors: [{ brand: "starbucks", label: "스타벅스", nearestM: null }, { brand: "daiso", label: "다이소", nearestM: 90 }] });
  assert.deepEqual(c.map((x) => x.key), ["same", "anchor-daiso", "area"]);
});

test("실제 0곳은 0곳으로 보여 준다(없는 것과 다르다)", () => {
  assert.equal(buildChips({ ...full, sameCategory: { level: "소분류", count: 0, radiusM: 250 } })[0].text, "반경 250m 같은 소분류 0곳");
});

test("거리·반경 표기", () => {
  assert.equal(distanceText(237.4), "237m");
  assert.equal(distanceText(1250), "1.3km");
  assert.equal(radiusText(500), "500m");
  assert.equal(radiusText(1000), "1km");
});
