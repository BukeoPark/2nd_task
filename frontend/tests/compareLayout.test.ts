import assert from "node:assert/strict";
import { test } from "node:test";
import { CHART_GROUPS, KEY_ROWS } from "../src/lib/compareLayout.ts";

test("상세 차트에는 맨 위 핵심 지표에 있는 행을 되풀이하지 않는다", () => {
  const charted = CHART_GROUPS.flatMap((g) => g.keys);
  for (const k of KEY_ROWS) assert.ok(!charted.includes(k), `${k} 가 핵심 지표와 상세 차트에 모두 있음`);
  assert.equal(new Set(charted).size, charted.length);   // 상세 차트 안에서도 한 번만
});

test("핵심 지표에 빠진 지표(유동인구 대비 매출·프랜차이즈·수요·변동성·임대료)는 상세 차트에 남고, 빈 묶음은 없다", () => {
  const charted = CHART_GROUPS.flatMap((g) => g.keys);
  for (const k of ["sales_per_10k_flpop", "frc_share", "wrc_total", "stores_volatility", "rent_small_shop"]) assert.ok(charted.includes(k), k);
  for (const g of CHART_GROUPS) assert.ok(g.keys.length > 0);
});
