import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CLEAR_MARGIN, clearlyHigher, openCloseRelation, unitSampleStores, yoyWord } from "../src/lib/interpretRules.ts";
import { SAMPLE_CAUTION_BELOW, SAMPLE_MIN, sampleStatus } from "../src/lib/insightReport.ts";

const read = (f: string) => readFileSync(new URL(`../src/lib/${f}`, import.meta.url), "utf8");

test("공통 규칙이 리포트(areaLens·areaReport) 원문과 어긋나지 않는다(drift 방지)", () => {
  const lens = read("areaLens.ts");
  assert.equal(Number(/const CLEAR_MARGIN = ([\d.]+);/.exec(lens)?.[1]), CLEAR_MARGIN);
  assert.match(lens, /v >= med \* CLEAR_MARGIN/);                       // '기준값의 1.25배 이상'이라는 비교 방식
  assert.match(lens, /yoyTotal != null && lv\.yoyTotal > 0/);           // 증감 부호 그대로
  assert.match(lens, /yoyTotal != null && lv\.yoyTotal < 0/);
  const report = read("areaReport.ts");
  assert.match(report, /st\.at\(-1\)\?\.stores as number\) : val\(inp\.rows, "stores_sbiz"\)/); // 표본 점포 기준
});

test("표본 기준: 10곳 미만 보류·10~19곳 주의·20곳 이상 정상", () => {
  assert.deepEqual([SAMPLE_MIN, SAMPLE_CAUTION_BELOW], [10, 20]);
  assert.deepEqual([9, 10, 19, 20].map(sampleStatus), ["too_few", "caution", "caution", "ok"]);
});

test("눈에 띄게 높다는 1.25배 이상이고, 기준이 0 이하이거나 값이 없으면 판단하지 않는다", () => {
  assert.equal(clearlyHigher(12.5, 10), true);
  assert.equal(clearlyHigher(12.4, 10), false);
  assert.equal(clearlyHigher(5, 0), false);
  assert.equal(clearlyHigher(null, 10), false);
  assert.equal(openCloseRelation(10, 12.5), "close_higher");
  assert.equal(openCloseRelation(12.5, 10), "open_higher");
  assert.equal(openCloseRelation(10, 11), "similar");
  assert.deepEqual([1, -1, 0].map(yoyWord), ["늘었습니다", "줄었습니다", "같습니다"]);
});

test("표본 점포는 값이 있는 가장 최근 분기, 없으면 상가정보 점포 수", () => {
  assert.equal(unitSampleStores([{ stores: 30 }, { stores: 12 }, { stores: null }], 99), 12);
  assert.equal(unitSampleStores([{ stores: null }], 99), 99);
  assert.equal(unitSampleStores([], null), null);
});
