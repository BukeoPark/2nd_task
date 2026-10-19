import assert from "node:assert/strict";
import { test } from "node:test";
import { HEAT_RADIUS_MAX_PX, HEAT_RADIUS_MIN_PX, HEAT_STOPS, buildLut, colorize, heatLegendText, heatRadiusPx, weightIntensity } from "../src/lib/heatmap.ts";

test("점이 번지는 반경은 실제 거리로 정하되 화면에서 너무 작거나 크지 않게 묶는다", () => {
  assert.equal(heatRadiusPx(0), HEAT_RADIUS_MIN_PX); // 잘못된 값
  assert.equal(heatRadiusPx(1000), HEAT_RADIUS_MIN_PX); // 많이 축소
  assert.equal(heatRadiusPx(1), HEAT_RADIUS_MAX_PX); // 많이 확대
  assert.equal(Math.round(heatRadiusPx(6)), 70); // 420m ÷ 6m/px
});

test("세기는 0~0.9 로 눌리고 값이 클수록 커지며, 낮은 값도 조금은 보인다", () => {
  assert.equal(weightIntensity(0), 0);
  assert.equal(weightIntensity(1), 0.9);
  assert.equal(weightIntensity(2), 0.9); // 범위를 넘어도 눌린다
  assert.ok(weightIntensity(0.1) > 0.1 * 0.9); // 완만하게 올려 낮은 값이 묻히지 않는다
  assert.ok(weightIntensity(0.3) < weightIntensity(0.6));
});

test("색 사다리: 옅은 곳은 파랑, 진한 곳은 빨강이고 중간은 초록·노랑을 지난다", () => {
  const lut = buildLut();
  const at = (i: number) => [lut[i * 3], lut[i * 3 + 1], lut[i * 3 + 2]];
  assert.deepEqual(at(0), HEAT_STOPS[0].rgb);
  assert.deepEqual(at(255), HEAT_STOPS[HEAT_STOPS.length - 1].rgb);
  const mid = at(Math.round(0.55 * 255));
  assert.ok(mid[1] > mid[0] && mid[1] > mid[2]); // 초록 쪽
  const warm = at(Math.round(0.78 * 255));
  assert.ok(warm[0] > 200 && warm[1] > 200); // 노랑
});

test("쌓인 번짐을 색으로 바꾸되 거의 투명한 곳은 비워 둔다", () => {
  const lut = buildLut();
  const px = new Uint8ClampedArray([0, 0, 0, 3, 0, 0, 0, 255, 0, 0, 0, 128]); // 알파 3 · 255 · 128
  colorize(px, lut);
  assert.equal(px[3], 0); // 거의 투명 → 비움
  assert.deepEqual([px[4], px[5], px[6]], [255, 59, 48]); // 가장 진함 → 빨강
  assert.ok(px[7] <= 210); // 최대 불투명도 제한
  assert.ok(px[11] > 0 && px[11] < px[7]); // 중간 세기는 더 투명
});

test("범례 문구는 밀도와 사람 수의 단위를 구분한다", () => {
  assert.equal(heatLegendText("명/㎢", 47796.9), "47,797명/㎢ 이상이면 가장 진함");
  assert.equal(heatLegendText("명(분기 합 추정)", 1768041.1), "1,768,041명 이상이면 가장 진함");
});
