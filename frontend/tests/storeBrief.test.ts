import assert from "node:assert/strict";
import { test } from "node:test";
import { buildStoreBrief } from "../src/lib/storeBrief.ts";

const base = { mode: "owner" as const, monthsRecorded: 0, lastMonth: null, costsFilled: 0, statusLabel: null, ageLabel: null, trdarName: "당산역 상권", dongName: "당산동" };

test("자영업자: 기록이 없으면 '기록 없음'이고 0원이 아니라고 말한다", () => {
  const b = buildStoreBrief(base);
  assert.equal(b.facts[0].value, "기록 없음");
  assert.match(b.reading[0], /0원이라는 뜻이 아닙니다/);
  assert.deepEqual(b.next.map((n) => n.target), ["compete", "area", "mine"]);       // 기록이 없으면 경쟁·상권부터, 매출 입력은 맨 뒤 선택
  assert.match(b.next[2].label, /선택/);
});

test("자영업자: 기록이 있고 비용이 없으면 손익분기를 아직 계산하지 않았다고 말한다", () => {
  const b = buildStoreBrief({ ...base, monthsRecorded: 4, lastMonth: "2026-09" });
  assert.equal(b.facts[0].value, "4개월");
  assert.deepEqual(b.next.map((n) => n.target), ["mine", "compete", "area"]);       // 기록이 있으면 내 기록·손익분기부터
  assert.ok(b.reading.some((t) => t.includes("손익분기는 아직 계산하지 않았습니다")));
  assert.ok(b.reading.length <= 2);
});

test("자영업자: 상권 경계 밖이면 행정동 기준이라고 밝힌다", () => {
  const b = buildStoreBrief({ ...base, trdarName: null, costsFilled: 3, monthsRecorded: 1, lastMonth: "2026-09" });
  assert.match(b.facts[2].value, /행정동 기준/);
  assert.equal(b.facts[1].value, "3/5칸");
});

test("행동은 기본 1개 + 보조 최대 2개(총 3개 이하)이고 실제 묶음으로만 이동한다", () => {
  for (const mode of ["owner", "founder"] as const) {
    const b = buildStoreBrief({ ...base, mode });
    assert.ok(b.next.length >= 2 && b.next.length <= 3, mode);
    for (const n of b.next) assert.ok(["mine", "radius", "compete", "area"].includes(n.target));
  }
});

test("예비 창업자: 내 매출·비용 기록을 쓰지 않고 주변 환경·경쟁·소속 상권으로 이어진다", () => {
  const b = buildStoreBrief({ ...base, mode: "founder", monthsRecorded: 7, lastMonth: "2026-09", costsFilled: 4, statusLabel: "영업(인허가 기준)", ageLabel: "약 3년" });
  const text = JSON.stringify(b);
  assert.ok(!/내 매출|기록 없음|손익분기|비용 입력/.test(text));
  assert.ok(!b.next.some((n) => n.target === "mine"));
  assert.deepEqual(b.next.map((n) => n.target), ["radius", "compete", "area"]);
  assert.match(b.reading[0], /현장 영업은 확인되지 않았습니다/);
});

test("예비 창업자: 영업 상태를 모르면 '확인 불가'이고 영업하지 않는다는 뜻이 아니라고 말한다", () => {
  const b = buildStoreBrief({ ...base, mode: "founder" });
  assert.equal(b.facts[0].value, "확인 불가");
  assert.equal(b.facts[1].value, "자료 없음");
  assert.match(b.reading[0], /영업 안 한다는 뜻은 아님/);
});
