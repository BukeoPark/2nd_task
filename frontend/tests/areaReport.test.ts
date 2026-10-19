import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAreaReport, p75, type AreaReportInput } from "../src/lib/areaReport.ts";

const row = (key: string, value: number | null, as_of = "2026년 2분기", note?: string) => ({ key, label: key, as_of, cells: [{ value, ...(note ? { note } : {}) }] });

const input: AreaReportInput = {
  unit: { level: "trdar", code: "u", name: "문래역(문래로데오거리)", type: "발달상권" },
  scope: "한식음식점 전체",
  rows: [
    row("per_store_month", 39_341_113.63), row("sales_yoy_pct", -5.61), row("stores_sbiz", 23, "2026-06"), row("stores_change_2y", -8.82),
    row("stores_volatility", 3.16), row("open_rate_y", 13.11), row("close_rate_y", 19.67), row("frc_share", 29.03),
    row("wrc_total", 2644), row("repop_total", null), row("fac_total", 14), row("rent_small_shop", null, "2026년 2분기", "1,000m 안에 R-ONE 조사 상권 없음"),
    row("vacancy_small_shop_pct", null), row("starbucks_zone_share", 100), row("daiso_zone_share", 100),
  ],
  overview: {
    latest_quarter: "20262",
    area_m2: 43658,
    trend: [
      { quarter: "20244", label: "2024년 4분기", per_store_month: 45_118_608, stores: 33 },
      { quarter: "20262", label: "2026년 2분기", per_store_month: 39_341_113, stores: 31 },
    ],
    hours: { slots: [{ label: "00~06시", pct: 1 }, { label: "06~11시", pct: 0.2 }, { label: "11~14시", pct: 19.5 }, { label: "14~17시", pct: 5.5 }, { label: "17~21시", pct: 55.3 }, { label: "21~24시", pct: 18.5 }] },
    floating: { label: "2026년 2분기", flpop: 30639, yoy_pct: -15.51, weekend_pct: 25.7, slots: [{ label: "00~06시", pct: 20.3 }, { label: "06~11시", pct: 21.1 }, { label: "11~14시", pct: 15.3 }, { label: "14~17시", pct: 14.7 }, { label: "17~21시", pct: 17.5 }, { label: "21~24시", pct: 11.1 }] },
  },
  character: { type: { headline: "상업 집중형" }, strengths: ["경계 안에 역 1곳이 있습니다."], cautions: ["직장·상주 인구 자료가 없습니다."], sections: { transit: { rail: { count: 1, boardings_observed: 21816, alightings_observed: 22550, year: 2025, usage_state: "all_linked" }, bus: { count: 0, boardings_observed: null, alightings_observed: null, usage_state: "no_stops" } } } },
  peers: {
    perStore: [
      { code: "a", value: 125_000_000, size: 3 }, { code: "b", value: 45_000_000, size: 80 }, { code: "me", value: 39_341_113.63, size: 23 },
      { code: "c", value: 20_000_000, size: 50 }, { code: "d", value: 5_000_000, size: 6 }, { code: "e", value: null, size: 9 },
    ],
    close: [10, 12, 12.7, 19.67, 25, 8].map((v, i) => ({ code: i === 3 ? "u" : String(i), value: v, size: 30 })),
    open: [10, 12.8, 14, 13.11, 20, 9].map((v, i) => ({ code: i === 3 ? "u" : String(i), value: v, size: 30 })),
    frc: [5, 8, 10, 29.03].map((v, i) => ({ code: String(i), value: v, size: 30 })),
  },
  today: "2026-10-20",
};

test("75% 경계는 작은 순으로 세운 값의 위쪽 25% 위치다", () => {
  assert.equal(p75([1, 2, 3, 4, 5]), 4);
  assert.equal(p75([10]), 10);
});

test("상권 단위 리포트: 값은 API 그대로, 순위는 점포 20곳 이상 비교 상권끼리, 문장은 규칙으로", () => {
  const r = buildAreaReport(input);
  assert.equal(Math.round(r.level!.me), 3934);
  assert.equal(r.level!.peerCount, 5); // 값이 없는 상권은 비교에서 뺀다
  assert.equal(r.level!.rank, 3);
  assert.equal(r.level!.bigRank, 2); // 점포 3·6곳짜리는 순위 기준에서 뺌
  assert.match(r.level!.text, /3,934만원으로 비교 상권 5곳 중앙값\(3,934만원\)의 약 1\.0배/);
  assert.match(r.level!.text, /정점보다 13% 낮습니다/);
  assert.match(r.level!.text, /총매출은 전년 동기 대비 -5\.6%/);
  assert.equal(r.headline, "문래역(문래로데오거리) 한식음식점, 매출의 55%가 17~21시에 몰립니다");
});

test("시간대: 매출과 유동인구 비중을 나란히 말하고, 한 시간대에 쏠리면 다른 시간대 확인을 권한다", () => {
  const s = buildAreaReport(input).slots!;
  assert.equal(s.hasFloating, true);
  assert.match(s.text, /17~21시에 55\.3%가 몰려 있습니다\. 같은 시간대 유동인구 비중은 17\.5%/);
  assert.match(s.take, /다른 시간대/);
  assert.deepEqual(s.facts.find((f) => f.label === "상주인구"), { label: "상주인구", value: "자료 없음", note: "원천에 값이 없음(0이 아님)" });
});

test("안정성·입지: 폐업률은 비교 중앙값과 함께, 임대료가 없으면 0이 아니라 '자료 없음'과 사유를 말한다", () => {
  const r = buildAreaReport(input);
  const c = r.stability!.churn!;
  assert.equal(c.closeRate, 0.1967);
  assert.equal(c.medClose, 0.127);
  assert.match(r.stability!.text, /최근 분기 폐업률은 19\.7%\(비교 지역 중앙값 12\.7%/);
  assert.match(r.stability!.text, /최근 1년 연 폐업률은 19\.7%입니다/);
  assert.match(r.stability!.take, /폐업률이 비교 지역 중앙값보다 높습니다/);
  const rent = r.location!.facts.find((f) => f.label.startsWith("소규모상가 임대료"));
  assert.equal(rent?.value, "자료 없음");
  assert.match(rent!.note, /R-ONE 조사 상권 없음/);
  assert.ok(r.location!.facts.some((f) => f.label === "지하철 역" && f.value === "1곳"));
  assert.ok(r.checklist.some((c2) => c2.includes("임대료")));
  assert.ok(r.checklist.some((c2) => c2.includes("이웃 상인")));
});

test("자료가 없는 쪽은 만들지 않는다", () => {
  const empty = buildAreaReport({ ...input, rows: [], overview: null, character: null, peers: { perStore: [], close: [], open: [], frc: [] } });
  assert.equal(empty.level, null);
  assert.equal(empty.slots, null);
  assert.equal(empty.stability, null);
  assert.deepEqual(empty.tiles, []);
  assert.equal(empty.headline, "문래역(문래로데오거리) 한식음식점 상권 읽기");
  // 시간대 쏠림이 없으면 매출 수준으로 제목을 만든다
  const flat = buildAreaReport({ ...input, overview: { ...input.overview!, hours: { slots: input.overview!.hours.slots.map((x) => ({ ...x, pct: 16.6 })) } } });
  assert.equal(flat.headline, "문래역(문래로데오거리), 한식음식점 점포당 추정매출은 비교 상권 중앙값의 1.0배입니다");
});
