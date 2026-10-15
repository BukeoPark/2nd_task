import assert from "node:assert/strict";
import { test } from "node:test";
import { effectSentence, factorValueText, percentileText, radiusLabel } from "../src/lib/locationText.ts";

const base = { label: "직장인구", pct: 41.5, pct_lo: 19, pct_hi: 68.3, significant: true, direction: "positive" as const, binary: false };

test("관계 문장: 유의하면 방향·크기·구간을 쓰고 인과 표현은 쓰지 않는다", () => {
  const s = effectSentence(base);
  assert.match(s, /\+41\.5%/);
  assert.match(s, /높은 경향/);
  assert.match(s, /95% 구간 \+19\.0% ~ \+68\.3%/);
  assert.match(s, /표준편차 1만큼 클 때/);
  assert.doesNotMatch(s, /때문|원인|올린다|높인다/);
});

test("관계 문장: 구간이 0 을 포함하면 방향을 단정하지 않는다", () => {
  const s = effectSentence({ ...base, pct: 3.1, pct_lo: -7.2, pct_hi: 14.6, significant: false });
  assert.match(s, /뚜렷한 관계를 찾지 못했어요/);
  assert.doesNotMatch(s, /높은 경향|낮은 경향/);
  assert.match(s, /-7\.2%/);
});

test("관계 문장: 음의 관계는 '낮은 경향', 0/1 요인은 없음·있음 비교 문장", () => {
  assert.match(effectSentence({ ...base, pct: -12, pct_lo: -20, pct_hi: -3, direction: "negative" }), /-12\.0% 낮은 경향/);
  assert.match(effectSentence({ ...base, binary: true }), /없는 상권보다 있는 상권의/);
});

test("백분위 문구: 상위·하위를 1% 아래로 내리지 않는다", () => {
  assert.equal(percentileText(78), "상위 22%");
  assert.equal(percentileText(100), "상위 1%");
  assert.equal(percentileText(50), "상위 50%");
  assert.equal(percentileText(30), "하위 30%");
  assert.equal(percentileText(0), "하위 1%");
  assert.equal(percentileText(null), "비교 불가");
});

test("반경 라벨", () => {
  assert.equal(radiusLabel(250), "250m");
  assert.equal(radiusLabel(1000), "1km");
});

test("요인 값: 작은 값은 소수 한 자리, 큰 값은 천 단위, 0/1 요인은 있음·없음, 없으면 null", () => {
  assert.equal(factorValueText(1.6, "곳", false), "1.6곳");
  assert.equal(factorValueText(2082, "명", false), "2,082명");
  assert.equal(factorValueText(367, "곳/㎢", false), "367곳/㎢");
  assert.equal(factorValueText(1, "", true), "있음");
  assert.equal(factorValueText(0, "", true), "없음");
  assert.equal(factorValueText(null, "명", false), null);
});

test("반경 점포 밀도: 수 ÷ π·r² 를 km² 당으로 환산하고, 잘못된 반경은 자료 없음", async () => {
  const { densityPerKm2, densityText } = await import("../src/lib/locationText.ts");
  assert.ok(Math.abs((densityPerKm2(10, 500) ?? 0) - 10 / (Math.PI * 0.25)) < 1e-9);
  assert.equal(densityText(0, 500), "1km²당 0.0곳");
  assert.equal(densityText(120, 500), "1km²당 153곳");
  assert.equal(densityText(3, 0), "자료 없음");
  // 같은 점포 수라도 반경이 넓으면 밀도는 낮다
  assert.ok((densityPerKm2(10, 1000) ?? 0) < (densityPerKm2(10, 250) ?? 0));
});
