import assert from "node:assert/strict";
import { test } from "node:test";
import { areaFeatureLines, areaReportTips, areaStrategies, strategyHeadline, traitStrategies, salesTrendStrategy } from "../src/lib/areaReportTips.ts";
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
  const r = { ...base, level: { ratio: 2.1, sampleStatus: "ok", yoyTotal: -9.5, yoyPerStore: -6, flpopYoy: -5.2 },
    slots: { rows: [{ label: "11~14시", sales: 52.1, pilot: 32.6 }] }, profile: [{ label: "유형(참고용 분류)", value: "업무 중심형" }],
  } as unknown as AreaReport;
  const tips = areaReportTips(r);
  assert.deepEqual(tips.map((t) => t.key), ["peak", "trend"]);
  assert.match(tips[0].title, /직장인 점심/);
  assert.match(tips[1].title, /시장·점포당 매출 감소/);
  assert.ok(tips.every((t) => t.action.length > 0));
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
  const r = { ...base, level: { ratio: 2.1, sampleStatus: "ok", yoyTotal: -9.5, yoyPerStore: -6 }, slots: { rows: [{ label: "11~14시", sales: 52.1, pilot: 32.6 }] }, profile: [] } as unknown as AreaReport;
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

test("전략 대표 제목은 지역 특성을 종합하고, 전략이 없으면 쓰지 않는다", () => {
  const rising = { ...base, level: { ratio: 0.9, sampleStatus: "ok", yoyTotal: 5.4, yoyPerStore: 6 }, profile: [] } as unknown as AreaReport;
  assert.equal(strategyHeadline(areaStrategies(rising, ch("traits", ["residential"]))), "주민이 반복해서 찾을 식사와 포장 구성을 설계하세요");
  assert.equal(strategyHeadline(areaStrategies(base, ch("traits", ["transit"]))), "역에서 매장까지의 동선과 빠른 이용 방식을 함께 설계하세요");
  assert.equal(strategyHeadline([]), null);
});

test("시간대·요일·매출 전략이 함께 있어도 지역 고객에 맞춘 종합 제목을 만든다", () => {
  const report = { ...base, level: { ratio: 1.4, sampleStatus: "ok", yoyTotal: 10.7, yoyPerStore: 8 }, slots: { rows: [{ label: "11~14시", sales: 50, pilot: 31 }] } } as unknown as AreaReport;
  const tips = areaStrategies(report, ch("traits", ["business"]), { composition: { 요일: [{label:"주말",pct:16}] } } as never);
  assert.deepEqual(tips.slice(0,3).map(t=>t.key), ["peak", "weekend", "trend"]);
  assert.equal(strategyHeadline(tips), "직장인의 반복 식사를 겨냥해 메뉴와 제공 방식을 설계하세요");
});
test("매출 감소 시 세부 수준별 전략을 유지하고 대표 제목은 수요 검증 방향을 제시한다", () => {
  for (const ratio of [2.1,0.9]) {
    const report = { ...base, level: {ratio,sampleStatus:"ok",yoyTotal:-8,yoyPerStore:-6}, slots: {rows:[{label:"11~14시",sales:50,pilot:31}]} } as unknown as AreaReport;
    assert.ok(areaStrategies(report, null).some(t => t.title === "시장·점포당 매출 감소에 맞춘 보수적 진입"));
    assert.equal(strategyHeadline(areaStrategies(report, null)), "주력 시간대의 주문 수요를 확인하며 작게 시작하세요");
  }
});
test("작은 증감·결측·표본 부족이면 매출 확대 제목을 만들지 않는다", () => {
  for (const [yoyTotal,sampleStatus] of [[0.4,"ok"],[null,"ok"],[10.7,"too_few"]] as const) {
    const report = {...base,level:{ratio:1.4,sampleStatus,yoyTotal},slots:{rows:[{label:"11~14시",sales:50,pilot:31}]}} as unknown as AreaReport;
    const tips=areaStrategies(report,null);
    assert.ok(tips.every(t=>t.key!=="trend"));
    assert.equal(strategyHeadline(tips), "매출이 몰리는 시간에 맞춰 메뉴와 처리 동선을 설계하세요");
  }
});

test("직장·교통 특성을 결합한 창업 방향은 세부 전략 제목과 중복되지 않는다", () => {
  const detail={composition:{요일:[{label:"주말",pct:14.2}]}} as never;
  const tips=areaStrategies(base,ch("traits",["business","transit"]),detail);
  assert.equal(strategyHeadline(tips),"직장인 식사와 이동 수요를 함께 잡는 창업을 검토하세요");
  assert.ok(tips.every(t=>t.title!==strategyHeadline(tips)));
});
test("같은 직장·교통 상권이어도 매출 감소 시 초기 수요 검증을 우선한다", () => {
  const report={...base,level:{ratio:2.1,sampleStatus:"ok",yoyTotal:-8}} as unknown as AreaReport;
  assert.equal(strategyHeadline(areaStrategies(report,ch("traits",["business","transit"]))),"출퇴근 동선의 직장인 수요부터 작게 검증하세요");
});

const salesLevel = (total: number | null, per: number | null, extra = {}) => ({sampleStatus:"ok",yoyTotal:total,yoyPerStore:per,storesFrom:100,storesNow:110,...extra}) as NonNullable<AreaReport["level"]>;
test("총매출·점포당 매출 네 방향을 구분하고 점포 수 변화와 비교 기간을 표시한다", () => {
  for (const [total,per,title,caution] of [
    [10,8,"시장·점포당 매출 증가와 경쟁 진입을 함께 점검",false],
    [10,-8,"시장 확대 속 점포당 매출 감소에 대비",true],
    [-10,8,"점포당 매출 개선이 점포 감소와 겹치는지 확인",true],
    [-10,-8,"시장·점포당 매출 감소에 맞춘 보수적 진입",true],
  ] as const) {
    const tip=salesTrendStrategy(salesLevel(total,per))!;
    assert.equal(tip.title,title);
    assert.equal(tip.salesCaution,caution);
    assert.match(tip.evidence,/전년 동기 대비/);
    assert.match(tip.evidence,/100→110곳/);
    assert.match(tip.action,/원인을 확정하는 자료는 아닙니다/);
    assert.notEqual(strategyHeadline([tip]),tip.title);
  }
});
test("한쪽 결측과 작은 변동을 증가·감소로 오인하지 않고 표본 부족은 보류한다", () => {
  assert.equal(salesTrendStrategy(salesLevel(0,0)),null);
  assert.equal(salesTrendStrategy(salesLevel(4.9,-4.9)),null);
  assert.equal(salesTrendStrategy(salesLevel(10,8,{sampleStatus:"too_few"})),null);
  assert.match(salesTrendStrategy(salesLevel(10,null))!.title,/함께 확인/);
  assert.match(salesTrendStrategy(salesLevel(null,-10))!.title,/함께 확인/);
  assert.match(salesTrendStrategy(salesLevel(10,0))!.action,/변동은 작습니다/);
  assert.match(salesTrendStrategy(salesLevel(0,-10))!.title,/초기 투자 조절/);
  assert.match(salesTrendStrategy(salesLevel(10,NaN))!.evidence,/증감 미확인/);
  assert.doesNotMatch(salesTrendStrategy(salesLevel(10,8,{storesFrom:null,storesNow:null}))!.evidence,/점포 수/);
});
test("총매출이 증가해도 점포당 매출이 감소하면 지역 종합 전략도 보수적으로 제시한다", () => {
  const report={...base,level:salesLevel(10,-8)} as AreaReport;
  assert.equal(strategyHeadline(areaStrategies(report,ch("traits",["business","transit"]))),"출퇴근 동선의 직장인 수요부터 작게 검증하세요");
});
