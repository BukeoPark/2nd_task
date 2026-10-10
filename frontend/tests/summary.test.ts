import assert from "node:assert/strict";
import { test } from "node:test";
import { GLOSSARY } from "../src/lib/glossary.ts";
import { buildSummary, popDirection, rateDirection, type SummaryInput } from "../src/lib/summary.ts";

const base: SummaryInput = {
  peerLabel: "파일럿 구 상권",
  rank: 7,
  peerCount: 69,
  perStoreYoyPct: 4.9,
  churn: { status: "ok", message: null, openRate: 0.06, closeRate: 0.14, peerMedianOpen: 0.06, peerMedianClose: 0.1 },
  floating: { rank: 11, peerCount: 69 },
  workplace: { total: 4867, peerMedian: 475 },
  resident: { total: 5935, peerMedian: 1358 },
};

test("방향 판정: 개업·폐업률은 ±2%p, 인구는 1.5배 기준", () => {
  assert.equal(rateDirection(0.14, 0.1), "higher");
  assert.equal(rateDirection(0.08, 0.1), "lower");
  assert.equal(rateDirection(0.11, 0.1), "similar");
  assert.equal(rateDirection(null, 0.1), null);
  assert.equal(popDirection(1500, 1000), "higher");
  assert.equal(popDirection(660, 1000), "lower");
  assert.equal(popDirection(1200, 1000), "similar");
  assert.equal(popDirection(1200, 0), null);
  assert.equal(popDirection(null, 1000), null);
});

test("요약은 사실과 방향만 말한다(순위·상위 %·중앙값 대비)", () => {
  const byKey = Object.fromEntries(buildSummary(base).map((l) => [l.key, l.text]));
  assert.equal(byKey.sales, "점포당 월평균 추정매출은 파일럿 구 상권 69곳 중 7위(상위 10%)예요.");
  assert.equal(byKey.yoy, "전년 같은 분기와 비교하면 점포당 매출이 +4.9%로 늘었어요.");
  assert.equal(byKey.close, "최근 1년 폐업률은 연 14%로, 비교 단위 중앙값(10%)보다 높아요.");
  assert.equal(byKey.open, "최근 1년 개업률은 연 6%로, 비교 단위 중앙값(6%) 수준이에요.");
  assert.equal(byKey.floating, "유동인구 1만 명당 매출은 69곳 중 11위예요.");
  assert.equal(byKey.demand, "직장인구와 상주인구 모두 중앙값보다 많아요.");
});

test("직장·상주인구 방향이 다르면 각각 말한다", () => {
  const text = (w: number, r: number) =>
    buildSummary({ ...base, workplace: { total: w, peerMedian: 1000 }, resident: { total: r, peerMedian: 1000 } }).find((l) => l.key === "demand")!.text;
  assert.equal(text(2000, 500), "직장인구는 중앙값보다 많고 상주인구는 중앙값보다 적어요.");
  assert.equal(text(1000, 1100), "직장인구와 상주인구 모두 중앙값 수준이에요.");
});

test("매출 증감이 ±1% 안이면 거의 같다고 하고, 줄면 줄었다고 한다", () => {
  assert.match(buildSummary({ ...base, perStoreYoyPct: 0.4 }).find((l) => l.key === "yoy")!.text, /거의 같아요/);
  assert.match(buildSummary({ ...base, perStoreYoyPct: -3.2 }).find((l) => l.key === "yoy")!.text, /-3\.2%로 줄었어요/);
});

test("개폐업을 계산하지 못했으면 0 이 아니라 서버가 준 사유를 그대로 말한다", () => {
  const lines = buildSummary({ ...base, churn: { status: "short_period", message: "관찰기간 부족 — 4개 분기 값이 없습니다", openRate: null, closeRate: null, peerMedianOpen: null, peerMedianClose: null } });
  assert.equal(lines.some((l) => l.key === "close" || l.key === "open"), false);
  assert.equal(lines.find((l) => l.key === "churn_missing")!.text, "개업·폐업: 관찰기간 부족 — 4개 분기 값이 없습니다");
});

test("중앙값이 없으면 비교 없이 값만 말하고, 자료가 없는 줄은 만들지 않는다", () => {
  const lines = buildSummary({
    ...base,
    rank: null,
    peerCount: null,
    perStoreYoyPct: null,
    floating: null,
    workplace: null,
    resident: { total: 100, peerMedian: null },
    churn: { status: "ok", message: null, openRate: null, closeRate: 0.12, peerMedianOpen: null, peerMedianClose: null },
  });
  assert.deepEqual(lines.map((l) => l.key), ["close"]);
  assert.equal(lines[0].text, "최근 1년 폐업률은 연 12%예요.");
});

test("상위 %는 최소 1%", () => {
  assert.match(buildSummary({ ...base, rank: 1, peerCount: 500 })[0].text, /500곳 중 1위\(상위 1%\)/);
});

test("용어 풀이: 모든 항목에 용어와 설명이 있고, 계산식 항목은 서버와 같은 정의를 쓴다", () => {
  for (const [key, g] of Object.entries(GLOSSARY)) {
    assert.ok(g.term.length > 0, `${key} term`);
    assert.ok(g.help.length >= 20, `${key} help`);
  }
  assert.match(GLOSSARY.churnClose.help, /4개 분기/);
  assert.match(GLOSSARY.churnClose.help, /평균 점포 수/);
  assert.match(GLOSSARY.breakeven.help, /1 − 재료비율 − 수수료율/);
  assert.match(GLOSSARY.floatingPerTenK.help, /10,000/);
});
