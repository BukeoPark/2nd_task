import {areaReportLead} from "../src/lib/reportLead.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { reportLead } from "../src/lib/reportLead.ts";

const all = { level: 2, slots: 3, competition: 4, location: 4, checklist: 4 };

test("자영업자: 내 매장 주변 경쟁 → 상권 변화 → 고객 수요 → 이번 달 확인사항 순서", () => {
  const l = reportLead("owner", "store", all);
  assert.deepEqual(l.rows.map((r) => r.title), ["내 매장 주변 경쟁(개폐업)", "상권 변화(매출 흐름)", "고객 수요(시간대·연령)", "이번 달 확인사항"]);
  assert.deepEqual(l.rows.map((r) => r.where), ["4쪽", "2쪽", "3쪽", "4쪽"]);
});

test("예비 창업자: 후보지 매출 흐름 → 경쟁 → 입지 → 현장 확인사항", () => {
  const l = reportLead("founder", "area", all);
  assert.deepEqual(l.rows.map((r) => r.title), ["후보지 매출 흐름", "경쟁(개폐업·프랜차이즈)", "입지(교통·임대료 참고값)", "현장 확인사항"]);
  assert.ok(l.rows.every((r) => !r.title.includes("비용")));
});

test("보고서에 없는 쪽은 가짜 쪽 번호를 만들지 않고 '이 보고서에는 없음'이라고 말한다", () => {
  const l = reportLead("owner", "area", { level: 2 });
  const miss = l.rows.filter((r) => r.kind === "missing");
  assert.equal(miss.length, 3);
  assert.ok(miss.every((r) => /없음/.test(r.where) && !/\d쪽/.test(r.where)));
  assert.equal(l.rows[1].where, "2쪽");
});

test("지역 보고서와 매장 보고서의 범위를 구분해 밝힌다", () => {
  assert.match(reportLead("owner", "area", all).scopeNote, /지역 보고서.*한 가게의 보고서가 아니에요/);
  assert.match(reportLead("owner", "store", all).scopeNote, /매장 보고서.*반경 500m/);
});


test("종합 정리와 실전 팁은 서로 다른 쪽으로 안내한다", () => {
  const lead = reportLead("founder", "area", {summary:9,tips:10});
  assert.equal(lead.rows.find(r=>r.title === "종합 정리")?.where,"9쪽");
  assert.equal(lead.rows.find(r=>r.title === "실전 팁")?.where,"10쪽");
});


test("지역 길잡이는 현재 분류·실제 페이지 순서와 통합 종합정리를 한 번만 표시한다",()=>{
 const lead=areaReportLead({signals:2,level:3,slots:4,demand:5,industries:6,competitors:7,stability:8,location:9,summary:10,basis:11});
 assert.equal(lead.rows.length,10);
 assert.equal(lead.rows[5].title,"주변 경쟁점");
 assert.equal(lead.rows[8].title,"종합·창업전략");
 assert.equal(lead.rows[8].where,"10쪽");
 assert.ok(!lead.rows.some(r=>r.title==="실전 팁"||r.title==="현장 확인사항"));
 const missing=areaReportLead({signals:0,level:3,summary:4});
 assert.deepEqual(missing.rows.map(r=>r.where),["3쪽","4쪽"]);
});

test("매장 보고서 길잡이는 상권 보고서처럼 실제 쪽 번호만 쪽 순서대로 안내한다", async () => {
  const { storeReportLead } = await import("../src/lib/reportLead.ts");
  const l = storeReportLead({ level: 2, slots: 3, competition: 4, summary: 5, basis: 6 });
  assert.deepEqual(l.rows.map((r) => `${r.title}:${r.where}`), ["매출 흐름:2쪽", "시간대별 수요:3쪽", "주변 경쟁·폐업:4쪽", "종합·확인사항:5쪽", "자료·계산 기준:6쪽"]);
  assert.equal(l.heading, "보고서 길잡이");
  const some = storeReportLead({ level: 2, summary: 3, basis: 4 });
  assert.deepEqual(some.rows.map((r) => r.title), ["매출 흐름", "종합·확인사항", "자료·계산 기준"]);       // 자료가 없어 빠진 쪽은 싣지 않는다
});
