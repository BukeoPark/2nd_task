import assert from "node:assert/strict";
import { test } from "node:test";
import { COST_CHECK_EXCLUDED, COST_CHECK_KEY, clearDraft, computeCostCheck, emptyDraft, loadDraft, sanitizeDraft, saveDraft } from "../src/lib/costCheck.ts";
import { installFakeStorage } from "./_fakeStorage.ts";

const d = (o: Partial<ReturnType<typeof emptyDraft>>) => ({ ...emptyDraft(), ...o });

test("입력이 하나도 없으면 계산하지 않는다(empty)", () => {
  assert.equal(computeCostCheck(emptyDraft()).status, "empty");
});

test("손익분기·영업손익·목표 매출과의 차이를 기존 손익분기 계산으로 구한다", () => {
  // 고정비 250+500+80=830, 변동비율 38% → 손익분기 830/0.62 ≈ 1338.7
  const r = computeCostCheck(d({ revenue: "3000", rent: "250", labor: "500", otherFixed: "80", cogsPct: "35", feePct: "3" }));
  assert.equal(r.status, "ok");
  assert.equal(r.fixed, 830);
  assert.ok(Math.abs((r.bep as number) - 830 / 0.62) < 1e-9);
  assert.ok(Math.abs((r.profit as number) - (3000 * 0.62 - 830)) < 1e-9);          // 3000×0.62 − 830 = 1030
  assert.ok(Math.abs((r.gap as number) - (3000 - 830 / 0.62)) < 1e-9);
  assert.ok((r.safetyPct as number) > 50 && (r.safetyPct as number) < 60);
});

test("예상 월매출이 손익분기보다 낮으면 영업손익이 음수이고 차이도 음수다", () => {
  const r = computeCostCheck(d({ revenue: "1000", rent: "250", labor: "500", otherFixed: "80", cogsPct: "35", feePct: "3" }));
  assert.ok((r.profit as number) < 0 && (r.gap as number) < 0 && (r.safetyPct as number) < 0);
});

test("매출을 비우면 손익분기만 계산하고(no_revenue) 손익·차이는 만들지 않는다", () => {
  const r = computeCostCheck(d({ rent: "100", cogsPct: "30" }));
  assert.equal(r.status, "no_revenue");
  assert.ok(r.bep !== null && r.profit === null && r.gap === null && r.safetyPct === null);
});

test("잘못된 입력(문자·음수·100% 초과)은 invalid, 변동비율 100% 이상은 no_margin", () => {
  assert.equal(computeCostCheck(d({ rent: "abc" })).status, "invalid");
  assert.equal(computeCostCheck(d({ rent: "-5" })).status, "invalid");
  assert.equal(computeCostCheck(d({ revenue: "-1", rent: "5" })).status, "invalid");
  assert.equal(computeCostCheck(d({ rent: "100", cogsPct: "120" })).status, "invalid");
  const nm = computeCostCheck(d({ revenue: "500", rent: "100", cogsPct: "70", feePct: "30" }));
  assert.equal(nm.status, "no_margin");
  assert.equal(nm.bep, null);
});

test("같은 업종 평균을 넘기면 손익분기가 그 평균의 몇 %인지 참고로 준다(없으면 null)", () => {
  const base = d({ revenue: "2000", rent: "300", cogsPct: "30" });
  assert.equal(computeCostCheck(base).vsBenchPct, null);
  const r = computeCostCheck(base, 1000);
  assert.ok(Math.abs((r.vsBenchPct as number) - ((300 / 0.7 / 1000) * 100)) < 1e-9);
});

test("포함하지 않은 항목을 화면에 밝힐 수 있게 이름으로 가지고 있다", () => {
  assert.equal(COST_CHECK_EXCLUDED.length, 3);
  assert.ok(COST_CHECK_EXCLUDED.some((x) => x.includes("세금")) && COST_CHECK_EXCLUDED.some((x) => x.includes("금융")) && COST_CHECK_EXCLUDED.some((x) => x.includes("투자비")));
});

test("저장은 '내 가게' 기록과 다른 키에 이 브라우저에만 하고, 모양이 틀린 값은 걸러 낸다", () => {
  const { data } = installFakeStorage();
  assert.notEqual(COST_CHECK_KEY, "myStoreCheckup:v1");
  assert.equal(saveDraft(d({ rent: "100", revenue: "2000" })), true);
  assert.deepEqual([...data.keys()], [COST_CHECK_KEY]);
  assert.equal(loadDraft().rent, "100");
  assert.deepEqual(sanitizeDraft({ rent: 5, labor: "7", extra: "x" }), { ...emptyDraft(), labor: "7" });
  clearDraft();
  assert.deepEqual(loadDraft(), emptyDraft());
});

test("저장소가 막힌 환경에서는 저장 실패를 알리고(false) 읽기는 빈 값으로 동작한다", () => {
  installFakeStorage({ failWrite: true, failRead: true });
  assert.equal(saveDraft(d({ rent: "1" })), false);
  assert.deepEqual(loadDraft(), emptyDraft());
});
