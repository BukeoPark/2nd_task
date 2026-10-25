import assert from "node:assert/strict";
import { test } from "node:test";
import { summaryInsights } from "../src/lib/summaryInsights.ts";
import type { AreaReport } from "../src/lib/areaReport";
import type { AreaCharacter, FoodUnitStoresResponse, ReportDetail, ReportExtras } from "../src/lib/apiClient";

const rep = (o: Record<string, unknown>) => ({ level: null, slots: null, stability: null, ...o }) as unknown as AreaReport;
const lvl = (ratio: number, yoyTotal: number | null, extra: Record<string, unknown> = {}) => ({ ratio, yoyTotal, sampleStatus: "ok", flpopYoy: null, ...extra });
const first = (r: AreaReport) => summaryInsights({ report: r })[0];

test("매출 인사이트 제목은 다른 쪽 제목처럼 '주어 + 숫자 + ~입니다' 한 문장이고, 수준 × 증감 방향으로 해석이 달라진다", () => {
  assert.equal(first(rep({ level: lvl(2.9, -7.3, { flpopYoy: -5.2 }) })).title, "점포당 매출은 중앙값의 2.9배로 높지만 총매출은 전년 동기 -7.3%입니다");
  assert.equal(first(rep({ level: lvl(1.6, 10.7) })).title, "점포당 매출은 중앙값의 1.6배로 높고 총매출은 전년 동기 +10.7%입니다");
  assert.equal(first(rep({ level: lvl(0.9, 5.4) })).title, "점포당 매출은 중앙값의 0.9배이고 총매출은 전년 동기 +5.4%입니다");
  assert.equal(first(rep({ level: lvl(0.6, 0.5) })).title, "점포당 매출은 중앙값의 0.6배로 낮고 총매출은 전년 동기 +0.5%입니다");
  assert.equal(first(rep({ level: lvl(0.6, -8) })).title, "점포당 매출은 중앙값의 0.6배로 낮고 총매출은 전년 동기 -8.0%입니다");
  assert.equal(first(rep({ level: lvl(0.7, 6) })).title, "점포당 매출은 중앙값의 0.7배로 낮지만 총매출은 전년 동기 +6.0%입니다");
  assert.equal(first(rep({ level: lvl(1.5, null) })).title, "점포당 매출은 중앙값의 1.5배로 높습니다");
});

test("줄고 있을 때만 유동인구를 함께 쓰고, 회색 글은 '~입니다' 근거와 확인할 일로 끝난다", () => {
  assert.equal(first(rep({ level: lvl(2.9, -7.3, { flpopYoy: -5.2 }) })).detail, "유동인구 지수도 -5.2%입니다. 줄어든 이유를 현장에서 확인해 보세요.");
  assert.equal(first(rep({ level: lvl(1.6, 10.7, { flpopYoy: 3 }) })).detail, "늘어난 이유를 현장에서 확인해 보세요.");
  assert.equal(first(rep({ level: lvl(1.0, 0.5) })).detail, "내 매출 목표와 견줘 보세요.");
});

test("점포가 적으면 매출 비교는 참고용이라고만 말한다", () => {
  const i = first(rep({ level: lvl(3, 20, { sampleStatus: "too_few", sampleStores: 8 }) }));
  assert.equal(i.title, "비교에 쓴 점포가 8곳뿐이라 매출 비교는 참고용입니다");
});

const ch = (w: number | null, traits: string[] = []) => ({ type: { kind: traits.length ? "traits" : "mixed", headline: "혼합형", traits: traits.map((k) => ({ key: k, label: k })) }, sections: { demand: { worker_share_pct: w } } }) as unknown as AreaCharacter;
const slots = { rows: [{ label: "11~14시", sales: 45.4, pilot: 31, flpop: 18.7 }, { label: "17~21시", sales: 30, pilot: 35, flpop: 24 }] };
const det = (weekend: number) => ({ composition: { 요일: [{ label: "주말", pct: weekend }] } }) as unknown as ReportDetail;
const pick = (all: ReturnType<typeof summaryInsights>, key: string) => all.find((x) => x.key === key);

test("특징은 상권 유형을 제목 한 줄로만 쓰고 요약 글(회색 줄)은 없다", () => {
  const all = summaryInsights({ report: rep({ level: lvl(2.9, -7.3) }), character: ch(97, ["commercial", "business", "transit"]) });
  assert.equal(all[0].key, "feature");
  assert.equal(all[0].title, "업무 중심·교통 거점 상권으로 분류됩니다");
  assert.equal(all[0].detail, "");
  assert.equal(summaryInsights({ report: rep({}), character: ch(50) })[0].title, "직장인과 주민이 섞인 상권으로 분류됩니다");
  assert.equal(pick(summaryInsights({ report: rep({ level: lvl(2.9, 1) }) }), "feature"), undefined);   // 상권 유형 자료가 없으면 특징을 만들지 않는다
});

test("수요 인사이트: 직장인·주민 구성과 평일·주말만 쓰고, 시간대는 유동인구 인사이트가 맡는다", () => {
  const i = pick(summaryInsights({ report: rep({}), character: ch(97), detail: det(15.6) }), "demand")!;
  assert.equal(i.title, "직장인구 97%로 평일 직장인 수요가 중심입니다");
  assert.equal(i.detail, "평일 84% · 주말 16%입니다. 저녁·주말에 기대는 메뉴는 불리할 수 있습니다.");
  assert.equal(pick(summaryInsights({ report: rep({}), character: ch(7), detail: det(33) }), "demand")!.title, "상주인구 93%로 주민 수요가 중심입니다");
  assert.equal(pick(summaryInsights({ report: rep({}), character: ch(45) }), "demand")!.title, "직장인구 45%로 직장인과 주민 수요가 섞여 있습니다");
  assert.equal(pick(summaryInsights({ report: rep({}), detail: det(10) }), "demand")!.title, "평일이 90%로 평일 손님이 대부분입니다");
  assert.equal(pick(summaryInsights({ report: rep({}) }), "demand"), undefined);
});

test("유동인구 인사이트: 사람이 많은 시간대와 매출이 몰리는 시간대를 견준다", () => {
  const diff = pick(summaryInsights({ report: rep({ slots }) }), "flpop")!;
  assert.equal(diff.title, "유동인구는 17~21시에, 매출은 11~14시에 가장 몰립니다");
  assert.equal(diff.detail, "유동인구 24% · 매출 45%입니다. 지나는 사람이 손님이 되는지 확인해 보세요.");
  const same = pick(summaryInsights({ report: rep({ slots: { rows: [{ label: "17~21시", sales: 38, pilot: 35, flpop: 19 }, { label: "11~14시", sales: 22, pilot: 31, flpop: 15 }] } }) }), "flpop")!;
  assert.equal(same.title, "유동인구와 매출이 모두 17~21시에 가장 몰립니다");
  assert.equal(pick(summaryInsights({ report: rep({ slots: { rows: [{ label: "11~14시", sales: 45, pilot: 31, flpop: null }] } }) }), "flpop"), undefined);   // 유동인구 자료가 없으면 만들지 않는다
});

test("유동인구 지수 증감은 매출 인사이트가 쓰지 않았고 5% 이상일 때만 유동인구 인사이트에 붙는다", () => {
  const up = pick(summaryInsights({ report: rep({ level: lvl(1.6, 10.7, { flpopYoy: 8.2 }), slots }) }), "flpop")!;
  assert.ok(up.detail.includes("유동인구 지수는 전년 동기 +8.2%입니다"));
  const down = summaryInsights({ report: rep({ level: lvl(2.9, -7.3, { flpopYoy: -5.2 }), slots }) });
  assert.ok(pick(down, "sales")!.detail.includes("유동인구 지수도 -5.2%"));
  assert.ok(!pick(down, "flpop")!.detail.includes("유동인구 지수"));        // 같은 숫자를 두 번 쓰지 않는다
});

const stores = (name: string, share: number, total = 100) => ({ total, category_mix: [{ code: null, name, count: 10, share_pct: share }] }) as unknown as FoodUnitStoresResponse;
const industry = (rows: [string, string, number, number][]) => ({ industry: { status: "ok", rows: rows.map(([cd, nm, st, ps]) => ({ svc_cd: cd, svc_nm: nm, stores: st, per_store_month: ps })) } }) as unknown as ReportExtras;

test("업종 인사이트: 쏠림 → 점포 수 1위와 매출 1위 업종 비교 → 세부 업종 1위 순이다", () => {
  assert.equal(pick(summaryInsights({ report: rep({}), stores: stores("백반/한정식", 52) }), "industry")!.title, "백반/한정식이 점포의 52%로 경쟁이 한 업종에 쏠려 있습니다");
  const diff = pick(summaryInsights({ report: rep({}), stores: stores("카페", 18), extras: industry([["CS1", "한식음식점", 524, 25.7e6], ["CS2", "호프-간이주점", 104, 20.4e6], ["CS3", "커피-음료", 151, 31e6]]) }), "industry")!;
  assert.equal(diff.title, "점포 수 1위는 한식음식점(524곳), 점포당 매출 1위는 커피-음료(3,100만원)입니다");
  assert.equal(diff.detail, "업종마다 객단가·하루 결제 건수가 다릅니다.");
  const big = pick(summaryInsights({ report: rep({}), extras: industry([["CS1", "한식음식점", 272, 25e6], ["CS2", "호프-간이주점", 20, 132.77e6]]) }), "industry")!;
  assert.ok(big.title.includes("호프-간이주점(1.3억원)"));                       // 1억 이상은 억원으로
  const same = pick(summaryInsights({ report: rep({}), extras: industry([["CS1", "한식음식점", 524, 31e6], ["CS2", "중식음식점", 55, 13e6]]) }), "industry")!;
  assert.equal(same.title, "한식음식점이 점포 수(524곳)·점포당 매출(3,100만원) 모두 1위입니다");
  assert.equal(pick(summaryInsights({ report: rep({}), stores: stores("카페", 18) }), "industry")!.title, "세부 업종 1위는 카페(18%)입니다");
  assert.equal(pick(summaryInsights({ report: rep({}), extras: industry([["CS1", "한식음식점", 5, 9e6], ["CS2", "중식음식점", 4, 8e6]]) }), "industry"), undefined);   // 점포 10곳 미만 업종만 있으면 비교하지 않는다
});

const stab = (close: number, med: number) => ({ churn: { closeRate: close, medClose: med } }) as unknown as AreaReport["stability"];
const extras = (rate: number | null, median = 7.7) => ({ license: { status: "ok", cohort: { status: rate === null ? "insufficient" : "ok", rate, denominator: 1471, horizon_years: 3 }, active: { enough: true, median_years: median } } }) as unknown as ReportExtras;

test("영업 기간 인사이트: 3년 안에 폐업한 비율, 폐업이 비교 지역보다 많으면 함께 쓴다", () => {
  const i = pick(summaryInsights({ report: rep({ stability: stab(0.023, 0.023) }), extras: extras(0.4915) }), "survival")!;
  assert.equal(i.title, "인허가 후 3년 안에 가게 10곳 중 5곳이 폐업했습니다");
  assert.equal(i.detail, "영업 중 가게 업력 중앙값은 7.7년입니다. 오래 버틴 가게의 공통점을 확인해 보세요.");
  const many = pick(summaryInsights({ report: rep({ stability: stab(0.07, 0.04) }), extras: extras(0.4915) }), "survival")!;
  assert.equal(many.detail, "영업 중 가게 업력 중앙값은 7.7년입니다. 분기 폐업률은 7.0%(중앙값 4.0%)입니다. 최근 폐업한 가게의 사정을 확인해 보세요.");
  assert.equal(pick(summaryInsights({ report: rep({}), extras: extras(null) }), "survival"), undefined);
  assert.equal(summaryInsights({ report: rep({}) }).length, 0);
});

test("인사이트는 최대 6개이고 특징 → 매출 → 수요 → 유동인구 → 업종 → 영업 기간 순이며 모든 제목이 합니다체 한 문장이다", () => {
  const all = summaryInsights({ report: rep({ level: lvl(2.9, -7.3, { flpopYoy: -5.2 }), slots, stability: stab(0.07, 0.04) }), character: ch(97, ["business", "transit", "commercial"]), detail: det(15.6),
    stores: stores("카페", 18), extras: { ...industry([["CS1", "한식음식점", 524, 25.7e6], ["CS3", "커피-음료", 151, 31e6]]), ...extras(0.49) } });
  assert.deepEqual(all.map((x) => x.key), ["feature", "sales", "demand", "flpop", "industry", "survival"]);
  assert.ok(all.every((x) => /(입니다|합니다|습니다|됩니다|몰립니다)$/.test(x.title)), all.map((x) => x.title).join(" / "));
  assert.ok(all.every((x) => x.title.length <= 52 && x.detail.length <= 110), all.map((x) => `${x.title.length}/${x.detail.length}`).join(" "));
});

test("종합 핵심 메시지: 수요·매출 수준·가장 신경 쓸 점·먼저 확인할 일을 한 문장으로 묶고, 인사이트 2번의 숫자를 되풀이하지 않는다", async () => {
  const { summaryHeadline } = await import("../src/lib/summaryInsights.ts");
  const license = { status: "ok", cohort: { status: "ok", rate: 0.4, horizon_years: 3, denominator: 120 }, active: { enough: true, median_years: 6.2 } };
  const extras = { license } as unknown as ReportExtras;
  const h = summaryHeadline({ report: rep({ level: lvl(1.0, 1.2) }), character: ch(30), extras }, "founder")!;
  assert.equal(h, "주민 수요가 중심인 상권 — 매출은 중앙값 수준이지만 폐업이 잦으니 버틴 가게의 공통점부터 확인하세요");
  assert.ok(!/1\.0배|\+1\.2/.test(h)); // 인사이트 제목(점포당 매출은 중앙값의 1.0배…)과 같은 숫자를 쓰지 않는다
  // 매출이 줄면 그 이유를, 신경 쓸 점이 없으면 내 목표와의 격차를 먼저 확인하라고 한다
  assert.equal(summaryHeadline({ report: rep({ level: lvl(0.6, -8) }), character: ch(80) }, "founder"), "직장인 수요가 중심인 상권 — 매출은 낮은 편이지만 총매출이 줄고 있으니 줄어든 이유부터 확인하세요");
  assert.equal(summaryHeadline({ report: rep({ level: lvl(1.6, 4) }), character: ch(50) }, "founder"), "직장인과 주민 수요가 섞인 상권 — 매출은 높은 편이고 내 매출 목표와의 격차부터 확인하세요");
  // 자료가 없으면 만들지 않는다(예전 제목을 쓴다). 점포가 적어 매출 비교가 참고용이면 매출 말은 빼고 수요만 쓴다
  assert.equal(summaryHeadline({ report: rep({}) }, "founder"), null);
  assert.equal(summaryHeadline({ report: rep({ level: lvl(3, 20, { sampleStatus: "too_few", sampleStores: 8 }) }), character: ch(10) }, "owner"), "주민 수요가 중심인 상권 — 내 매출과의 차이부터 확인하세요");
});
