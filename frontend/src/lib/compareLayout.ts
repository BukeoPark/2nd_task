// 지역 비교 화면의 구성 — 맨 위 '지역별 핵심 지표' 행과, 그 아래 '상세 차트'에 그리는 행. 같은 값을 두 번 보이지 않도록 상세 차트는 핵심 지표 행을 뺀 나머지만 그린다.
// 다른 모듈을 import 하지 않는 순수 데이터(tests/compareLayout.test.ts).

// 맨 위 '지역별 핵심 지표'에 한 줄씩 보이는 행(같은 순서)
export const KEY_ROWS = ["per_store_month", "sales_yoy_pct", "stores_sbiz", "stores_change_2y", "close_rate_y", "open_rate_y"];

// 상세 차트로 그릴 행 — 전체 표(CompareTable)에는 모든 행이 있다. 종합점수·레이더는 만들지 않는다.
const CHART_GROUPS_ALL: { title: string; keys: string[] }[] = [
  { title: "매출", keys: ["per_store_month", "sales_yoy_pct", "sales_per_10k_flpop"] },
  { title: "경쟁", keys: ["stores_sbiz", "frc_share", "starbucks_zone_share", "daiso_zone_share"] },
  { title: "수요", keys: ["wrc_total", "repop_total", "fac_total"] },
  { title: "안정성", keys: ["stores_change_2y", "stores_volatility", "open_rate_y", "close_rate_y"] },
  { title: "임대료·공실(참고값)", keys: ["rent_small_shop", "vacancy_small_shop_pct"] },
];

/** 핵심 지표에 이미 있는 행은 빼고, 남는 행이 없는 묶음은 없앤다. */
export const CHART_GROUPS = CHART_GROUPS_ALL
  .map((g) => ({ title: g.title, keys: g.keys.filter((k) => !KEY_ROWS.includes(k)) }))
  .filter((g) => g.keys.length > 0);
