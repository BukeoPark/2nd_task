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
    hours: {
      slots: [{ label: "00~06시", pct: 1 }, { label: "06~11시", pct: 0.2 }, { label: "11~14시", pct: 19.5 }, { label: "14~17시", pct: 5.5 }, { label: "17~21시", pct: 55.3 }, { label: "21~24시", pct: 18.5 }],
      pilot: { label: "파일럿 구 상권", units: 127, slots: [{ label: "00~06시", pct: 2.5 }, { label: "06~11시", pct: 1.6 }, { label: "11~14시", pct: 32.6 }, { label: "14~17시", pct: 8.5 }, { label: "17~21시", pct: 40.7 }, { label: "21~24시", pct: 14.2 }] },
    },
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
  mode: "founder",
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
  assert.equal(r.headline, "문래역(문래로데오거리) 한식음식점, 17~21시 매출 비중이 평균보다 14.6%p 높습니다");
});

test("시간대: 매출과 유동인구 비중을 나란히 말하고, 한 시간대에 쏠리면 다른 시간대 확인을 권한다", () => {
  const s = buildAreaReport(input).slots!;
  assert.equal(s.hasFloating, true);
  assert.match(s.text, /17~21시 매출 비중 55\.3%는 파일럿 구 상권 평균\(40\.7%\)보다 14\.6%p 높고, 11~14시 비중 19\.5%는 평균\(32\.6%\)보다 13\.1%p 낮습니다\./);
  assert.match(s.text, /가장 매출이 몰린 17~21시의 유동인구 비중은 17\.5%/);
  assert.equal(s.hasPilot, true);
  assert.match(s.take, /11~14시의 매출 비중이 파일럿 구 상권 평균보다 낮다는 것은/);
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
  const flat = buildAreaReport({ ...input, overview: { ...input.overview!, hours: { slots: input.overview!.hours.slots.map((x) => ({ ...x, pct: 16.6 })) } /* 평균 자료 없음 */ } });
  assert.equal(flat.headline, "문래역(문래로데오거리), 한식음식점 점포당 추정매출은 비교 상권 중앙값의 1.0배입니다");
});

test("관점: 예비 창업자는 긍정·주의 신호를 값 그대로 나열하고 점수·적합도는 만들지 않는다", () => {
  const r = buildAreaReport(input);
  assert.equal(r.lens.mode, "founder");
  assert.equal(r.lens.eyebrow, "예비 창업자용 · 창업 전 점검");
  const pos = r.lens.positive.map((s) => s.title), cau = r.lens.caution.map((s) => s.title);
  assert.ok(cau.some((t) => t.includes("총매출이 전년 동기보다 줄었습니다")), cau.join("|"));
  assert.ok(cau.some((t) => t.includes("문 닫는 비율")));
  assert.ok(cau.some((t) => t.includes("프랜차이즈 점포 비중이 높습니다")));
  assert.ok(cau.some((t) => t.includes("매출이 한 시간대에 쏠려")));
  assert.ok(cau.some((t) => t.includes("임대료·공실률을 이 자료로 알 수 없습니다")));
  assert.ok(pos.some((t) => t.includes("점포당 추정매출이 비교 지역 중앙값보다 높")) === false); // 중앙값과 같은 수준이면 긍정으로 세지 않는다
  assert.match(r.lens.ruleNote, /점수나 '창업 적합도'가 아니고/);
  const text = JSON.stringify(r.lens);
  assert.doesNotMatch(text, /적합도\s*\d|점수\s*\d|\d+점/); // 점수 표현 없음
  assert.equal(r.lens.checklistTitle, "창업 전에 확인해 볼 것");
});

test("관점: 자영업자는 매출 증대 기회(비는 시간대·유동 대비 매출·차별화)와 내 가게와 견주기를 짚는다", () => {
  const r = buildAreaReport({ ...input, mode: "owner" });
  assert.equal(r.lens.mode, "owner");
  assert.equal(r.lens.eyebrow, "자영업자용 · 매출 증대·기회 포착");
  const pos = r.lens.positive.map((s) => s.title);
  assert.ok(pos.some((t) => t.startsWith("11~14시에 손님을 더 모을 여지")), pos.join("|")); // 평균보다 13%p 낮은 점심
  assert.ok(pos.some((t) => t.includes("17~21시가 이 상권 매출의 중심입니다")), pos.join("|"));
  assert.ok(pos.some((t) => t.includes("개인 가게의 차별화")));
  assert.match(r.headline, /11~14시 시간대에 매출을 더 올릴 여지가 보입니다/);
  assert.ok(r.checklist.some((c) => c.includes("'내 가게 점검'에 월 매출을 기록")));
  assert.ok(r.checklist.some((c) => c.includes("11~14시 시간대에 한 가지")));
  assert.equal(r.lens.checklistTitle, "이번 달 해볼 것");
  assert.match(r.slots!.take, /^11~14시는 비교 지역 평균보다 매출 비중이 낮습니다/);
  assert.match(r.lens.levelTake, /내 가게의 매출이 아닙니다/);
});

test("관점이 달라도 같은 숫자를 쓴다(제목·해석·확인할 일만 다르다)", () => {
  const a = buildAreaReport(input), b = buildAreaReport({ ...input, mode: "owner" });
  assert.deepEqual(a.tiles, b.tiles);
  assert.equal(a.level!.me, b.level!.me);
  assert.notEqual(a.lens.levelTake, b.lens.levelTake);
});

test("조사는 받침에 맞게 고른다(은/는, 이/가)", async () => {
  const { eunNeun, iGa } = await import("../src/lib/areaLens.ts");
  assert.equal(eunNeun("17~21시"), "는");
  assert.equal(eunNeun("점심"), "은");
  assert.equal(iGa("17~21시"), "가");
  assert.equal(iGa("저녁"), "이");
});
