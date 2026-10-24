import assert from "node:assert/strict";
import { test } from "node:test";
import { countText, industryLines, industryTake, licenseNotice, manwonText, monthsText, NO_DATA, pctText, survivalTake } from "../src/lib/reportExtras.ts";
import type { ReportExtras } from "../src/lib/apiClient";

const base = {
  level: "dong", code: "A", disclaimer: "",
  industry: { status: "ok", quarter: "20262", quarter_label: "2026년 2분기", total: null, rows: [
    { svc_cd: "CS100001", svc_nm: "한식음식점", stores: 524, per_store_month: 25707968, ticket: 36856, daily_tx_per_store: 23, close_rate: 4, open_rate: 4, selected: true, note: null },
    { svc_cd: "CS100002", svc_nm: "중식음식점", stores: 2, per_store_month: null, ticket: null, daily_tx_per_store: null, close_rate: null, open_rate: null, selected: false, note: "점포 2곳 — 3곳 미만이라 비교하지 않음" },
  ] },
  change_index: { scope: "행정동", dong_name: "영등포동", quarter_label: "2026년 2분기", stage: "정체", open_months: 130, close_months: 59, seoul_open_months: 118, seoul_close_months: 54, note: "" },
  license: { status: "ok", scope_label: "외식 전체", closures_available: true, cohort: { status: "ok", rate: 0.4915, numerator: 723, denominator: 1471, horizon_years: 3, cohort_permit_from: "2013-09-23", cohort_permit_to: "2023-09-23", message: null } },
} as unknown as ReportExtras;

test("값이 없으면 0이 아니라 '자료 없음'이라고 쓴다", () => {
  assert.equal(countText(null), NO_DATA);
  assert.equal(manwonText(null), NO_DATA);
  assert.equal(pctText(null), NO_DATA);
  assert.equal(monthsText(null), NO_DATA);
  assert.equal(pctText(0), "0%");            // 0 은 값이다
});

test("원 → 만원, 개월 → 년 변환", () => {
  assert.equal(manwonText(25707968), "2,571만원");
  assert.equal(monthsText(130), "130개월(약 10.8년)");
  assert.equal(pctText(4), "4%");
  assert.equal(pctText(2.5), "2.5%");
});

test("업종 표의 칸은 값이 비면 자료 없음, 사유(note)는 그대로 둔다", () => {
  const lines = industryLines(base.industry);
  assert.equal(lines[0].perStore, "2,571만원");
  assert.equal(lines[0].daily, "23.0건");
  assert.equal(lines[0].selected, true);
  assert.deepEqual([lines[1].perStore, lines[1].ticket, lines[1].daily, lines[1].close], [NO_DATA, NO_DATA, NO_DATA, NO_DATA]);
  assert.match(lines[1].note ?? "", /3곳 미만/);
});

test("영업 기간 꿀팁은 서울시 평균과의 차이와 폐업 비율만 말하고 원인·전망은 말하지 않는다", () => {
  const t = survivalTake(base);
  assert.match(t, /서울시 평균\(54개월\)보다 5개월 깁니다/);
  assert.match(t, /3년 안에 폐업한 비율은 49%/);
  assert.match(t, /과거 통계/);
  assert.ok(!/때문|전망|성공할/.test(t));
});

test("상권은 소속 행정동 기준이라고 밝힌다", () => {
  const t = survivalTake({ ...base, change_index: { ...base.change_index!, scope: "소속 행정동", dong_name: "여의동" } } as ReportExtras);
  assert.match(t, /소속 행정동\(여의동\) 기준/);
});

test("자료가 하나도 없으면 말할 자료가 부족하다고 한다", () => {
  const t = survivalTake({ ...base, change_index: null, license: { status: "unavailable", scope_label: "x" } } as ReportExtras);
  assert.match(t, /자료가 부족/);
});

test("업종 꿀팁은 기준 업종이 있을 때만 그 업종을 말한다", () => {
  assert.match(industryTake(base), /기준 업종\(한식음식점\)/);
  const none = { ...base, industry: { ...base.industry, rows: base.industry.rows.map((r) => ({ ...r, selected: false })) } } as ReportExtras;
  assert.ok(!/기준 업종/.test(industryTake(none)));
  assert.match(industryTake(none), /추천 순위가 아니고/);
});

test("인허가 자료가 없을 때의 안내 문구", () => {
  assert.equal(licenseNotice(base.license), null);
  assert.match(licenseNotice({ status: "unavailable", scope_label: "x" } as ReportExtras["license"]) ?? "", /계산할 수 없/);
  assert.match(licenseNotice({ status: "ok", scope_label: "x", closures_available: false, message: "폐업일자를 제공하지 않아" } as ReportExtras["license"]) ?? "", /폐업일자/);
});
