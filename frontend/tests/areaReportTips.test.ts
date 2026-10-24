import assert from "node:assert/strict";
import { test } from "node:test";
import { areaReportTips } from "../src/lib/areaReportTips.ts";
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
