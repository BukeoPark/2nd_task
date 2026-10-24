import assert from "node:assert/strict";
import { test } from "node:test";
import { railLineBadge, splitRailLines } from "../src/lib/railLines.ts";
test("실제 철도 원천의 경부·경인선은 1호선 배지로 표시한다", () => {
  for (const line of ["경부선", "경인선", "1호선"]) {
    assert.equal(railLineBadge(line).label, "1");
    assert.equal(railLineBadge(line).color, "#0052A4");
  }
});
test("환승 노선은 분리하고 중복을 없앤다", () => {
  assert.deepEqual(splitRailLines("2호선·경부선·2호선"), ["2호선", "경부선"]);
});
test("공항철도와 신분당선은 이름이 유사한 다른 노선과 구분한다", () => {
  assert.equal(railLineBadge("인천국제공항선").label, "공항");
  assert.notEqual(railLineBadge("신분당선").color, railLineBadge("수인분당선").color);
  assert.equal(railLineBadge("알수없는선").label, "알수없는선");
});
