import assert from "node:assert/strict";
import { test } from "node:test";
import { compareBasis, type CompareBasisInput } from "../src/lib/compareBasis.ts";

const base: CompareBasisInput = {
  level: "dong", unitName: "목4동", unitType: null,
  fallbackReason: "매장이 서울시 지정 상권(골목·발달·전통시장) 밖에 있어 행정동 기준으로 비교합니다.",
  svcNm: "분식전문점", sclsNm: "김밥/만두/분식", peerCount: 120,
};

test("상권 밖이면 행정동 기준과 그 이유를 서버 문구 그대로 말한다", () => {
  const b = compareBasis(base);
  assert.equal(b.unit, "목4동 (행정동)");
  assert.equal(b.why, base.fallbackReason);
});

test("상권 안이면 상권 유형을 붙이고 상권 기준이라고 말한다", () => {
  const b = compareBasis({ ...base, level: "trdar", unitName: "영등포역(영등포)", unitType: "발달상권", fallbackReason: null });
  assert.equal(b.unit, "영등포역(영등포) (발달상권)");
  assert.match(b.why, /상권 기준으로 비교해요/);
});

test("세부 업종이 서울시 업종과 다르면 매출이 업종 전체 값이라고 말하고, 같으면 군말을 붙이지 않는다", () => {
  assert.match(compareBasis(base).category, /'분식전문점' 전체 — 이 매장의 세부 업종은 '김밥\/만두\/분식'/);
  assert.equal(compareBasis({ ...base, sclsNm: "분식전문점" }).category, "서울시 업종 '분식전문점' 전체");
  assert.equal(compareBasis({ ...base, sclsNm: null }).category, "서울시 업종 '분식전문점' 전체");
});

test("지도 강조 안내는 매장 수를 알 때만, 서울시 점포 수와 다를 수 있다고 함께 말한다", () => {
  assert.equal(compareBasis({ ...base, peerCount: null }).map, null);
  assert.match(compareBasis({ ...base, peerCount: 1234 }).map!, /1,234곳.*서울시 점포 수와는 센 기준이 달라/);
  assert.match(compareBasis({ ...base, peerCount: 0 }).map!, /0곳/);
});
