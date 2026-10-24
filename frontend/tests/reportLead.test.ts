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
