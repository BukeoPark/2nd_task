import assert from "node:assert/strict";
import { test } from "node:test";
import { isRadiusGroup, overlayRadius, validCenter } from "../src/lib/radiusOverlay.ts";

test("'주변 환경'·'경쟁' 묶음에서만, 허용된 반경(250·500·1000)일 때만 원 반경을 돌려준다", () => {
  assert.equal(overlayRadius("radius", 500), 500);
  assert.equal(overlayRadius("radius", 250), 250);
  assert.equal(overlayRadius("radius", 1000), 1000);
  assert.equal(overlayRadius("compete", 500), 500);
  assert.equal(isRadiusGroup("compete"), true);
  assert.equal(isRadiusGroup("area"), false);
  for (const g of ["store", "area", "mine"]) assert.equal(overlayRadius(g, 500), null, `${g} 에서는 원이 없어야 함`);
  assert.equal(overlayRadius("radius", 300), null);
});

test("좌표가 없거나 이상하면 원을 만들지 않는다", () => {
  assert.equal(validCenter(126.9, 37.52), true);
  assert.equal(validCenter(null, 37.5), false);
  assert.equal(validCenter(126.9, undefined), false);
  assert.equal(validCenter(Number.NaN, 37.5), false);
  assert.equal(validCenter(0, 0), false);
  assert.equal(validCenter(37.5, 126.9), false); // 경도·위도 뒤바뀜
});
