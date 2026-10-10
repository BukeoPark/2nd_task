import assert from "node:assert/strict";
import { test } from "node:test";
import { assess, buildRows, checkupText, quarterOf, shiftQuarter } from "../src/lib/checkup.ts";

const trend = [
  { quarter: "20252", per_store_month: 2_000_0000 },
  { quarter: "20253", per_store_month: 2_100_0000 },
  { quarter: "20262", per_store_month: 2_200_0000 },
];

test("달 → 분기, 분기 이동", () => {
  assert.equal(quarterOf("2026-06"), "20262");
  assert.equal(quarterOf("2026-07"), "20263");
  assert.equal(quarterOf("2026-13"), null);
  assert.equal(quarterOf("26-06"), null);
  assert.equal(shiftQuarter("20262", -4), "20252");
  assert.equal(shiftQuarter("20261", -1), "20254");
  assert.equal(shiftQuarter("20254", 1), "20261");
});

test("분기별 월평균: 기록한 달만 평균, 잘못된 값은 버린다", () => {
  const rows = buildRows({ "2026-04": 3000, "2026-05": 3600, "2026-06": -5, "bad": 100, "2025-05": Number.NaN }, trend);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], { quarter: "20262", mine: 3300_0000, months: 2, bench: 2_200_0000 });
});

test("동네 자료에 없는 분기는 bench=null 로 남긴다", () => {
  const rows = buildRows({ "2026-08": 2500 }, trend);
  assert.equal(rows[0].bench, null);
});

test("기록이 한 분기뿐이면 비교하지 않는다", () => {
  const c = assess(buildRows({ "2026-06": 3000 }, trend));
  assert.equal(c.verdict, "insufficient");
  assert.match(checkupText(c, "영등포역"), /두 분기 이상/);
});

test("전년 같은 분기가 있으면 전년 대비로 비교하고, 동네보다 5%p 넘게 낮으면 lagging", () => {
  // 내 매출 3000 → 2400(-20%), 동네 2000만 → 2200만(+10%) : 차이 -30%p
  const c = assess(buildRows({ "2025-04": 3000, "2025-05": 3000, "2025-06": 3000, "2026-04": 2400, "2026-05": 2400, "2026-06": 2400 }, trend));
  assert.equal(c.verdict, "lagging");
  assert.equal(c.basis, "yoy");
  assert.equal(c.from, "20252");
  assert.equal(c.to, "20262");
  assert.ok(Math.abs((c.gapPp ?? 0) - -30) < 1e-9);
  assert.equal(c.partial, false);
  assert.match(checkupText(c, "영등포역"), /25\.2Q→26\.2Q.*동네보다 30\.0%p 더 낮아졌어요/);
});

test("전년 분기가 없으면 가장 가까운 이전 기록 분기와 비교(since)하고, 3개월 미만이면 partial", () => {
  // 20253(동네 2100만) → 20262(2200만). 내 매출 2000 → 2300(+15%), 동네 +4.8%
  const c = assess(buildRows({ "2025-08": 2000, "2026-05": 2300 }, trend));
  assert.equal(c.basis, "since");
  assert.equal(c.verdict, "leading");
  assert.equal(c.partial, true);
});

test("±5%p 안쪽이면 비슷한 흐름", () => {
  // 내 +10%, 동네 +10% (2000만 → 2200만)
  const c = assess(buildRows({ "2025-05": 2000, "2026-05": 2200 }, trend));
  assert.equal(c.verdict, "similar");
  assert.match(checkupText(c, "동네"), /비슷한 흐름/);
});

test("기준 분기 매출이 0이면 변화율을 계산하지 않는다", () => {
  const c = assess(buildRows({ "2025-05": 0, "2026-05": 2200 }, trend));
  assert.equal(c.verdict, "insufficient");
});
