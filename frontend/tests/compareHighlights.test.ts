import assert from "node:assert/strict";
import { test } from "node:test";
import { compareHighlights, type HighlightInput } from "../src/lib/compareHighlights.ts";

const units = [{ code: "a", name: "가상권" }, { code: "b", name: "나상권" }, { code: "c", name: "다상권" }];
const row = (key: string, kind: string, vals: (number | null)[], extra: Record<string, unknown> = {}) => ({ key, label: key, kind, as_of: "2026년 2분기", scope: "한식음식점 전체", cells: vals.map((v) => ({ value: v, ...extra })) });

test("차이가 큰 지표 3개를 큰 순서로 고른다(값이 큰 곳·작은 곳만 말하고 유리한 곳은 고르지 않는다)", () => {
  const inp: HighlightInput = { units, rows: [
    row("per_store_month", "money", [30_000_000, 10_000_000, 20_000_000]),   // 약 3.0배
    row("sales_yoy_pct", "growth", [10, -5, 0]),                               // 15%p
    row("close_rate_y", "rate", [5, 6, 5.5]),                                  // 1%p — 작아서 제외
    row("frc_share", "rate", [40, 10, 20]),                                    // 30%p
    row("wrc_total", "people", [1000, 900, 950]),                              // 10% — 작아서 제외
  ] };
  const h = compareHighlights(inp);
  assert.deepEqual(h.map((x) => x.key), ["frc_share", "per_store_month", "sales_yoy_pct"].sort((a, b) => h.findIndex((x) => x.key === a) - h.findIndex((x) => x.key === b)));
  assert.equal(h.length, 3);
  assert.equal(h[0].key, "per_store_month".length ? h[0].key : "");
  const byKey = Object.fromEntries(h.map((x) => [x.key, x]));
  assert.equal(byKey.per_store_month.gap, "약 3.0배");
  assert.equal(byKey.per_store_month.high.name, "가상권");
  assert.equal(byKey.per_store_month.low.name, "나상권");
  assert.equal(byKey.sales_yoy_pct.gap, "15.0%p 차이");
  assert.ok(!("close_rate_y" in byKey) && !("wrc_total" in byKey));
  const sizes = h.map((x) => x.size);
  assert.deepEqual(sizes, [...sizes].sort((a, b) => b - a));
});

test("자료 없음(null)인 지역은 빼고 2곳 미만이면 지표를 만들지 않는다", () => {
  const h = compareHighlights({ units, rows: [row("per_store_month", "money", [30, null, null]), row("frc_share", "rate", [40, 10, null])] });
  assert.deepEqual(h.map((x) => x.key), ["frc_share"]);
  assert.equal(h[0].low.name, "나상권");
});

test("일부 업종만 반영한 칸(partial)은 같은 범위가 아니라서 비교에서 뺀다", () => {
  const inp: HighlightInput = { units, rows: [{ key: "frc_share", label: "x", kind: "rate", as_of: null, cells: [{ value: 90, partial: true }, { value: 10 }, { value: 12 }] }] };
  assert.deepEqual(compareHighlights(inp), []);
});

test("비교 대상이 2곳 미만이거나 후보 지표가 없으면 빈 목록", () => {
  assert.deepEqual(compareHighlights({ units: [units[0]], rows: [row("frc_share", "rate", [40])] }), []);
  assert.deepEqual(compareHighlights({ units, rows: [row("stores_sbiz", "count", [10, 100, 50])] }), []);       // 점포 수는 규모 차이라 대상이 아니다
});

test("기간·업종 범위는 그대로 가져온다", () => {
  const h = compareHighlights({ units, rows: [row("frc_share", "rate", [40, 10, 20])] });
  assert.equal(h[0].asOf, "2026년 2분기");
  assert.equal(h[0].scope, "한식음식점 전체");
  assert.equal(h[0].high.text, "40.0%");
});
