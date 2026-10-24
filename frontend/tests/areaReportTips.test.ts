import assert from "node:assert/strict";
import { test } from "node:test";
import { areaFeatureLines, areaReportTips, areaStrategies, traitStrategies } from "../src/lib/areaReportTips.ts";
import type { AreaCharacter } from "../src/lib/apiClient";
import type { AreaReport } from "../src/lib/areaReport";
const base = { level: null, slots: null, stability: null, location: null, profile: [], lens: { mode: "founder" } } as unknown as AreaReport;
test("자영업자·자료 없음·일반적인 상권에는 팁을 억지로 만들지 않는다", () => {
  assert.deepEqual(areaReportTips(base), []);
  assert.deepEqual(areaReportTips({ ...base, lens: { mode: "owner" } } as AreaReport), []);
  const ordinary = { ...base, slots: { rows: [{ label: "11~14시", sales: 35, pilot: 32 }] }, location: { facts: [{ label: "지하철 역", value: "1곳" }] } } as unknown as AreaReport;
  assert.deepEqual(areaReportTips(ordinary), []);
});
test("점심 집중과 매출 감소는 서로 다른 전략으로 요약하고 일반 확인 팁은 제외한다", () => {
  const r = { ...base, level: { ratio: 2.1, sampleStatus: "ok", yoyTotal: -9.5, flpopYoy: -5.2 },
    slots: { rows: [{ label: "11~14시", sales: 52.1, pilot: 32.6 }] }, profile: [{ label: "유형(참고용 분류)", value: "업무 중심형" }],
  } as unknown as AreaReport;
  const tips = areaReportTips(r);
  assert.deepEqual(tips.map((t) => t.key), ["peak", "trend"]);
  assert.match(tips[0].title, /직장인 점심/);
  assert.match(tips[1].title, /매출 수준은 높지만/);
  assert.ok(tips.every((t) => !/현장|자료 없음|확인하세요/.test(t.action)));
});

const ch = (kind: "traits" | "mixed" | "hold", keys: string[] = []) => ({ type: { kind, headline: "교통 거점형", traits: keys.map((k) => ({ key: k, label: k, evidence: [`${k} 근거`] })), held: [], mixed_evidence: ["직장·상주 혼재"] } }) as unknown as AreaCharacter;
test("상권 유형마다 전략이 하나씩 만들어지고 자료 근거는 판정 근거 한 줄이다", () => {
  const tips = traitStrategies(ch("traits", ["transit", "commercial"]));
  assert.deepEqual(tips.map((t) => t.key), ["trait-transit", "trait-commercial"]);
  assert.equal(tips[0].evidence, "transit 근거");
  assert.ok(tips.every((t) => t.action.length > 10 && !/성공|보장|확실/.test(t.action)));
});
test("혼합형은 전략 하나, 판정 보류·자료 없음은 만들지 않는다", () => {
  assert.deepEqual(traitStrategies(ch("mixed")).map((t) => t.key), ["trait-mixed"]);
  assert.deepEqual(traitStrategies(ch("hold")), []);
  assert.deepEqual(traitStrategies(null), []);
});
test("자료로 두드러진 전략이 먼저, 그다음 유형 전략이고 같은 키는 한 번만 나온다", () => {
  const r = { ...base, level: { ratio: 2.1, sampleStatus: "ok", yoyTotal: -9.5 }, slots: { rows: [{ label: "11~14시", sales: 52.1, pilot: 32.6 }] }, profile: [] } as unknown as AreaReport;
  assert.deepEqual(areaStrategies(r, ch("traits", ["business"])).map((t) => t.key), ["peak", "trend", "trait-business"]);
  assert.deepEqual(areaStrategies({ ...r, lens: { mode: "owner" } } as AreaReport, ch("traits", ["business"])).map((t) => t.key), ["trait-business"]);
});
test("상권 특징 줄은 핵심 숫자 카드와 겹치지 않는 값만, 있는 것만 만든다", () => {
  assert.deepEqual(areaFeatureLines(base), []);
  const r = { ...base, level: { me: 2014, median: 1266, ratio: 1.6, sampleStatus: "ok", flpopYoy: 10.5 }, slots: { rows: [{ label: "17~21시", sales: 38, pilot: 35 }, { label: "11~14시", sales: 22, pilot: 31 }] },
    stability: { churn: { closeRate: 0.049, medClose: 0.038 } } } as unknown as AreaReport;
  const lines = areaFeatureLines(r, { composition: { 연령: [{ label: "30대", pct: 32.9 }, { label: "20대", pct: 17.1 }], 요일: [{ label: "주말", pct: 35.6 }] } } as never,
    { total: 40, category_mix: [{ name: "백반/한정식", share_pct: 24, count: 10 }] } as never);
  assert.equal(lines.length, 4);
  assert.match(lines[0], /17~21시\(38%\).*35%/);
  assert.match(lines[1], /연령대는 30대\(33%\)이고.*평일 64%/);
  assert.match(lines[2], /백반\/한정식\(24%\)/);
  assert.match(lines[3], /\+10\.5%/);
  assert.ok(lines.every((l) => !/2,014|폐업률/.test(l)));
});
