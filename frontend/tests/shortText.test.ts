import assert from "node:assert/strict";
import { test } from "node:test";
import { firstSentence } from "../src/lib/shortText.ts";

test("긴 안내는 첫 문장만 남긴다", () => {
  assert.equal(firstSentence("폐업 기록 확인 점포만 뺀 참고 수치입니다. 인허가 자료 기준이며 현장 영업은 확인되지 않았습니다."), "폐업 기록 확인 점포만 뺀 참고 수치입니다.");
  assert.equal(firstSentence("공정위 브랜드와 연결되지 않은 매장입니다(개인 가게일 수 있음). 자세한 건 보고서."), "공정위 브랜드와 연결되지 않은 매장입니다(개인 가게일 수 있음).");
});

test("문장이 하나이거나 비어 있으면 그대로 돌려준다", () => {
  assert.equal(firstSentence("문장 하나"), "문장 하나");
  assert.equal(firstSentence("소수 3.5% 같은 숫자는 끊지 않는다"), "소수 3.5% 같은 숫자는 끊지 않는다");
  assert.equal(firstSentence(null), "");
  assert.equal(firstSentence(undefined), "");
});
