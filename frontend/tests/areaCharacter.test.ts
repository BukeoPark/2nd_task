import assert from "node:assert/strict";
import { test } from "node:test";
import { anchorText, cellSub, cellText, countText, demandStructureNote, densityReferenceText, densityText, NEUTRAL_STYLE, peopleText, rankText, TRAIT_STYLE, typeNotice } from "../src/lib/areaCharacter.ts";

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

test("특성 색은 서로 다르고 글자색이 배경과 대비 4.5:1 이상이다", () => {
  const styles = Object.values(TRAIT_STYLE);
  assert.equal(new Set(styles.map((s) => s.fg)).size, styles.length);
  for (const s of [...styles, NEUTRAL_STYLE]) assert.ok(contrast(s.fg, s.bg) >= 4.5, JSON.stringify(s));
});

test("같은 단위 안 위치: 상위·하위만 말하고 중간권은 위치를 단정하지 않는다", () => {
  assert.equal(rankText(97), "같은 단위 상위 3%");
  assert.equal(rankText(10), "같은 단위 하위 10%");
  assert.equal(rankText(50), "같은 단위 중간 수준");
  assert.equal(rankText(100), "같은 단위 상위 1%");
  assert.equal(rankText(null), "");
});

test("값이 없으면 0 이 아니라 사유나 '자료 없음'을 쓴다", () => {
  assert.equal(cellText({ value: 250897 }, peopleText), "250,897명");
  assert.equal(cellText({ value: 0 }, countText), "0곳");                                   // 실제 0 은 0
  assert.equal(cellText({ value: null, note: "점포가 너무 적어 계산하지 않음" }, countText), "점포가 너무 적어 계산하지 않음");
  assert.equal(cellText({ value: null }, countText), "자료 없음");
  assert.equal(cellText(undefined, countText), "자료 없음");
});

test("밀도·앵커 문장: 작은 면적은 참고용, 경계 안/밖을 구분", () => {
  assert.equal(densityText(312.4, false), "312곳/㎢");
  assert.match(densityText(5000, true), /참고용/);
  assert.equal(densityText(null, false), "자료 없음");
  assert.equal(anchorText({ inside: 3, nearest_m: 0 }), "경계 안 3곳");
  assert.match(anchorText({ inside: 0, nearest_m: 420 }), /경계 안 0곳 · 경계에서 가장 가까운 곳 420m/);
  assert.equal(anchorText({ inside: 0, nearest_m: null }), "자료 없음");
});

test("보류·혼합은 이유를 말한다", () => {
  assert.match(typeNotice({ kind: "hold", hold_reason: "판정에 쓸 수 있는 근거가 부족합니다: x" }), /근거가 부족/);
  assert.match(typeNotice({ kind: "mixed", mixed_evidence: ["직장인구 비율 45%", "교통·상업 특성도 기준에 못 미침"] }), /45%.*기준에 못 미침/);
  assert.equal(typeNotice({ kind: "traits" }), "");
});

test("다른 특성만 붙은 혼합 수요 단위에는 수요 구조를 따로 알린다", () => {
  assert.match(demandStructureNote({ kind: "traits", traits: [{ key: "transit" }], demand_label: "혼합형", worker_share: 32.04 }), /혼합형입니다\(직장인구 32%\)/);
  assert.equal(demandStructureNote({ kind: "traits", traits: [{ key: "business" }], demand_label: "업무형", worker_share: 88 }), "");
  assert.equal(demandStructureNote({ kind: "mixed", traits: [], demand_label: "혼합형", worker_share: 40 }), "");        // 혼합형 헤드라인이 이미 말한다
  assert.equal(demandStructureNote({ kind: "traits", traits: [{ key: "transit" }], demand_label: null, worker_share: null }), "");
});

test("값 칸 아래 줄은 기준 시점과 원천을 함께 말하고, 업종을 고르면 외식 전체 기준과 비교하지 않는다", () => {
  assert.equal(cellSub({ as_of: "2026-06", source: "소상공인 상가(상권)정보" }), "2026-06 · 소상공인 상가(상권)정보");
  assert.equal(cellSub({ as_of: "2024년 3분기~2026년 2분기", source: "서울시 상권분석서비스(점포)" }), "2024년 3분기~2026년 2분기 · 서울시 상권분석서비스(점포)");
  assert.equal(cellSub({}), undefined);
  assert.equal(cellSub(undefined), undefined);
  assert.match(densityReferenceText(false, 407) ?? "", /직접 비교하지 않음/);
  assert.equal(densityReferenceText(true, 407), "외식 전체 상위 25% 기준 407곳/㎢");
  assert.equal(densityReferenceText(true, null), undefined);
});
