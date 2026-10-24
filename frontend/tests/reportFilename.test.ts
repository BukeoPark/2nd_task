import assert from "node:assert/strict";
import { test } from "node:test";
import { reportFilename } from "../src/lib/reportFilename.ts";
test("지역·선택 업종으로 파일명을 만들고 전체 업종은 외식으로 표시한다", () => {
  assert.equal(reportFilename("국회의사당역", "한식음식점 전체"), "국회의사당역 한식음식점 상권분석 보고서");
  assert.equal(reportFilename("여의동", "외식 전체"), "여의동 외식 상권분석 보고서");
  assert.equal(reportFilename("여의동"), "여의동 외식 상권분석 보고서");
  assert.equal(reportFilename("여의동", "백반/한정식"), "여의동 백반 한정식 상권분석 보고서");
});
