import assert from "node:assert/strict";
import { test } from "node:test";
import { START_STEPS, stepsLine } from "../src/lib/flow.ts";

test("이용 순서는 자영업자 4단계·예비 창업자 4단계이고 이름이 겹치지 않는다", () => {
  assert.equal(START_STEPS.owner.length, 4);
  assert.equal(START_STEPS.founder.length, 4);
  for (const steps of Object.values(START_STEPS)) assert.equal(new Set(steps).size, steps.length);
  assert.equal(stepsLine("founder"), "후보 탐색 → 상권 요약 → 지역 비교 → 창업 비용 점검");
});

test("시작 화면·환영 팝업·랜딩이 이 이름을 그대로 쓴다(이름이 어긋나지 않게)", async () => {
  const { readFileSync } = await import("node:fs");
  const start = readFileSync(new URL("../src/features/guide/StartPanel.tsx", import.meta.url), "utf8");
  const tour = readFileSync(new URL("../src/features/guide/TourLayer.tsx", import.meta.url), "utf8");
  const landing = readFileSync(new URL("../src/features/landing/content.ts", import.meta.url), "utf8");
  assert.match(start, /START_STEPS\.owner/);
  assert.match(start, /stepsLine\("founder"\)/);
  assert.match(tour, /stepsLine\(/);
  for (const title of [...START_STEPS.owner, ...START_STEPS.founder]) assert.ok(landing.includes(`title: "${title}"`), `랜딩 이용 흐름에 '${title}' 단계가 없음`);
});
