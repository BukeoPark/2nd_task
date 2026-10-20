import assert from "node:assert/strict";
import { test } from "node:test";
import { BTN_MIN_HEIGHT, FS } from "../src/lib/typography.ts";

test("글자 크기 단계는 중요도 순서를 지키고 각 범위 안에 있다", () => {
  assert.ok(FS.screenTitle >= 22 && FS.screenTitle <= 24);
  assert.ok(FS.cardTitle >= 16 && FS.cardTitle <= 18);
  assert.ok(FS.metric >= 24 && FS.metric <= 28);
  assert.ok(FS.body >= 15 && FS.body <= 16);
  assert.ok(FS.ui >= 14 && FS.ui <= 16);
  assert.ok(FS.warn >= 13 && FS.warn <= 14);
  assert.ok(FS.caption >= 12 && FS.caption <= 13);
  // 화면 제목·핵심 숫자 > 카드 제목 > 본문 > 메뉴·버튼 > 경고 > 보조 설명
  assert.ok(FS.metric > FS.screenTitle || FS.metric >= FS.screenTitle);
  assert.ok(FS.screenTitle > FS.cardTitle && FS.cardTitle > FS.body && FS.body >= FS.ui && FS.ui > FS.warn && FS.warn > FS.caption);
});

test("입력칸은 16px 이상(휴대폰 자동 확대 방지)이고 버튼 최소 높이가 있다", () => {
  assert.ok(FS.input >= 16);
  assert.ok(BTN_MIN_HEIGHT >= 36);
});
