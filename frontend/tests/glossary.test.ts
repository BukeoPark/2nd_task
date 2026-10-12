import assert from "node:assert/strict";
import { test } from "node:test";
import { GLOSSARY } from "../src/lib/glossary.ts";

test("용어 풀이: 모든 항목에 용어와 설명이 있고, 계산식 항목은 화면의 정의와 같다", () => {
  for (const [key, g] of Object.entries(GLOSSARY)) {
    assert.ok(g.term.length > 0, `${key} term`);
    assert.ok(g.help.length >= 20, `${key} help`);
  }
  assert.match(GLOSSARY.breakeven.help, /1 − 재료비율 − 수수료율/);
  assert.match(GLOSSARY.safetyMargin.help, /\(매출 − 손익분기\) ÷ 매출/);
  assert.match(GLOSSARY.floatingIndex.help, /상대 값/);
  assert.match(GLOSSARY.perStoreMonth.help, /실제 매출이 아니고/);
});
