import assert from "node:assert/strict";
import { test } from "node:test";
import { compareConclusion } from "../src/lib/compareConclusion.ts";
import type { FoodCompareResponse } from "../src/lib/apiClient";

function comparison(sales: [number | null, number | null], closures: [number | null, number | null]) {
  const row = (key: string, values: (number | null)[], kind: "money" | "rate"): FoodCompareResponse["rows"][number] => ({
    key, label: key, kind, group: "비교", scope: "한식 전체", as_of: "2026년 2분기", source: "테스트", cells: values.map(value => ({ value })),
  });
  return { units: [{ code: "A", name: "지역A", type: null }, { code: "B", name: "지역B", type: null }], rows: [row("per_store_month", sales, "money"), row("close_rate_y", closures, "rate")] };
}

test("매출과 폐업률의 유리한 방향이 다르면 결과가 갈린다고 설명한다", () => {
  const result = compareConclusion(comparison([15050000, 7450000], [19.2, 11.5]));
  assert.match(result.title, /매출은 지역A.*폐업률은 지역B/);
  assert.match(result.reading, /결과가 갈리/);
  assert.match(result.next, /실제 임대료가 없/);
});

test("같은 지역이 두 지표에서 앞설 때만 먼저 구체적으로 검토하도록 한다", () => {
  const result = compareConclusion(comparison([15050000, 7450000], [11.5, 19.2]));
  assert.match(result.title, /지역A부터 구체적으로 검토/);
  assert.doesNotMatch(result.reading, /성공|수익 보장|창업 추천/);
});

test("일부 집계·표본 주의 지표로 우선 후보를 정하지 않는다", () => {
  const data = comparison([15050000, 7450000], [11.5, 19.2]);
  data.rows[0].cells[0].partial = true;
  data.rows[1].cells[1].caution = true;
  const result = compareConclusion(data);
  assert.match(result.title, /고르기 어렵/);
  assert.match(result.evidence[0].text, /일부 집계/);
});

test("자료 없음과 동률은 우열을 만들지 않는다", () => {
  assert.match(compareConclusion(comparison([null, 7450000], [11.5, 11.5])).title, /고르기 어렵/);
  assert.match(compareConclusion(comparison([7450000, 7450000], [null, 11.5])).title, /고르기 어렵/);
});

test("일부 지역만 임대료가 있어도 실제 비용 확인을 남긴다", () => {
  const data = comparison([15050000, 7450000], [19.2, 11.5]);
  data.rows.push({ ...data.rows[0], key: "rent_small_shop", kind: "rent", cells: [{ value: null }, { value: 41.9 }] });
  assert.match(compareConclusion(data).next, /실제 임대료가 없/);
  data.rows[2].cells[0].value = 35;
  assert.match(compareConclusion(data).next, /주변 조사 상권의 참고값/);
});
