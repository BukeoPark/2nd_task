import assert from "node:assert/strict";
import { test } from "node:test";
import { cautionText, coverageText, reasonText, scopeLine } from "../src/lib/foodText.ts";

test("전체 집단을 썼으면 범위 문구를 달지 않고, 일부만 썼으면 제외 범위를 말한다", () => {
  assert.equal(coverageText({ used: 2, total: 2, excluded_sales_share: 0 }), null);
  assert.equal(coverageText(null), null);
  assert.equal(coverageText({ used: 0, total: 0, excluded_sales_share: null }), null);
  assert.equal(
    coverageText({ used: 1, total: 2, excluded_sales_share: 0.5 }),
    "업종 2개 중 1개만 반영(필요한 값이 비어 있는 업종은 제외, 제외된 업종 매출 50%)",
  );
  assert.equal(coverageText({ used: 1, total: 3, excluded_sales_share: null }), "업종 3개 중 1개만 반영(필요한 값이 비어 있는 업종은 제외)");
});

test("값 없음 사유: 서버 문구를 그대로 쓰고 모르는 코드는 추측하지 않는다", () => {
  const reasons = { zero_stores: "점포 수가 0 이라 점포당·비율 값을 계산할 수 없음" };
  assert.equal(reasonText("zero_stores", reasons), "점포 수가 0 이라 점포당·비율 값을 계산할 수 없음");
  assert.equal(reasonText("unknown_code", reasons), "자료 없음");
  assert.equal(reasonText(null, reasons), "자료 없음");
  assert.equal(reasonText("zero_stores", undefined), "자료 없음");
});

test("업종 범위 줄", () => {
  assert.equal(scopeLine("점포 수", "아이스크림/빙수 기준"), "점포 수: 아이스크림/빙수 기준");
  assert.equal(scopeLine("매출", "커피-음료 전체 기준"), "매출: 커피-음료 전체 기준");
});

test("비교 점포 10~19곳만 변동성 주의를 달고, 20곳 이상·표본 정보 없음은 일반 표시", () => {
  const base = { used: 1, total: 1, excluded_sales_share: 0 };
  assert.equal(cautionText({ ...base, sample: 12, caution: true }), "소규모 상권: 변동성 주의(비교 점포 12곳)");
  assert.equal(cautionText({ ...base, sample: 25, caution: false }), null);
  assert.equal(cautionText(base), null);
  assert.equal(cautionText(null), null);
});
