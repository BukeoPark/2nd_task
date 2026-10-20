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

test("핵심 메시지: 값이 있는 사실만 한두 줄로 말하고, 없는 값은 문장에서 뺀다", async () => {
  const { keyMessages } = await import("../src/lib/areaCharacter.ts");
  const full = keyMessages({
    transit: { rail: { count: 1, nearest_m: 0, boardings_observed: 20314, year: 2025 }, bus: { count: 8, per_km2: 56.9 } },
    demand: { workers: { value: 5101 }, residents: { value: 3163 }, demand_type: "업무형", floating: { lunch_pct: 14.4, lunch_rank: 20 } },
    anchor: { starbucks: { inside: 0, nearest_m: 83 }, daiso: { inside: 1, nearest_m: 0 }, facilities: { total: { value: 69 }, per_km2: 491, reference_median: 152 } },
    competition: { stores: { value: 75 }, density_per_km2: 533, small_area: false, change_2y: { value: -1.2 }, open_rate_y: { value: 16.4 }, close_rate_y: { value: 15.1 } },
  });
  assert.equal(full.transit, "지하철역 1곳이 경계 안·250m 이내에 있고, 연결된 역의 하루 평균 승차는 약 20,314명(2025년)입니다. 경계 안 버스 정류장은 8곳입니다.");
  assert.equal(full.demand, "직장인구 5,101명·상주인구 3,163명으로 업무형에 가깝고 점심(11~14시) 유동 비중은 14.4%(같은 단위 하위 20%)입니다.");
  assert.equal(full.commerce, "스타벅스 경계 밖 83m · 다이소 경계 안 1곳 · 집객시설 69곳(㎢당 491곳, 같은 단위 중앙값 152곳)입니다.");
  assert.equal(full.competition, "선택 업종 점포 75곳(㎢당 533곳), 최근 1년 개업률 16.4%·폐업률 15.1%, 약 2년간 점포 수 -1.2%입니다.");

  const sparse = keyMessages({
    transit: { rail: { count: 0, nearest_m: 640, boardings_observed: null, year: 2025 }, bus: { count: 0, per_km2: null } },
    demand: { workers: { value: null }, residents: { value: null }, demand_type: null, floating: null },
    anchor: { starbucks: { inside: 0, nearest_m: null }, daiso: { inside: 0, nearest_m: null }, facilities: { total: { value: null }, per_km2: null, reference_median: null } },
    competition: { stores: { value: null }, density_per_km2: null, small_area: false, change_2y: { value: null }, open_rate_y: { value: null }, close_rate_y: { value: null } },
  });
  assert.equal(sparse.transit, "경계 안·250m 이내에 지하철역이 없고(가장 가까운 역 640m) 경계 안 버스 정류장은 0곳입니다.");
  assert.equal(sparse.demand, null); // 자료가 없으면 문장을 만들지 않는다(0 으로 말하지 않는다)
  assert.equal(sparse.commerce, null);
  assert.equal(sparse.competition, null);
});
