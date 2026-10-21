import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { BLOCK_GAP, PK, grid2, grid3 } from "../src/lib/panelStyle.ts";

const read = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");

test("분석 패널 조각의 색·간격은 한 벌이고 보조 글씨 색은 흰 바탕에서 읽히는 회색(#6B7280 이상 진함)이다", () => {
  assert.equal(PK.mute, "#6B7280");
  assert.ok(BLOCK_GAP >= 12);
  assert.match(grid2.gridTemplateColumns as string, /minmax\(0, 1fr\)/);
  assert.match(grid3.gridTemplateColumns as string, /repeat\(3/);
});

test("종합분석 항목은 항목마다 카드·숫자 칸·값 행을 따로 만들지 않고 공통 조각(PanelKit)을 쓴다", () => {
  for (const f of ["features/area/AreaOverviewPanel.tsx", "features/area/AreaCharacterSection.tsx"]) {
    const src = read(f);
    assert.match(src, /components\/PanelKit/, `${f} 가 PanelKit 을 쓰지 않음`);
    assert.ok(!/const card: CSSProperties|const sub: CSSProperties|const fine: CSSProperties/.test(src), `${f} 에 항목 전용 카드·소제목·설명 스타일이 남아 있음`);
  }
  // 조각 자체는 글자 크기를 FS 단계로만 정한다
  assert.ok(!/fontSize:\s*[\d.]+/.test(read("components/PanelKit.tsx")));
});
