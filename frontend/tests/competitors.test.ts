import assert from "node:assert/strict";
import { test } from "node:test";
import { distanceLabel, distanceM, groupByCategory, radiusBounds, withinRadius, type PointLike } from "../src/lib/competitors.ts";

const C = { lon: 126.9, lat: 37.52 };
// 위도 1도 ≈ 111.2km → 0.001도 ≈ 111m
const p = (id: string, dLat: number, category = "커피점/카페", name = id): PointLike => ({ store_id: id, name, branch: null, category, svc: "CS100010", lon: C.lon, lat: C.lat + dLat });

test("두 점 사이 거리는 위도 0.001도 ≈ 111m", () => {
  assert.ok(Math.abs(distanceM(C, { lon: C.lon, lat: C.lat + 0.001 }) - 111.2) < 1);
  assert.equal(distanceM(C, C), 0);
});

test("반경 사각형은 반경을 완전히 감싼다", () => {
  const b = radiusBounds(C, 500);
  assert.ok(b.maxLat - C.lat > 0.0044 && b.maxLat - C.lat < 0.0046);
  assert.ok(b.minLon < C.lon && b.maxLon > C.lon && b.maxLon - C.lon > b.maxLat - C.lat);   // 경도 1도가 더 짧아 폭이 더 넓다
});

test("반경 안 매장만 가까운 순으로, 자기 자신은 뺀다", () => {
  const pts = [p("far", 0.006), p("mid", 0.003), p("self", 0), p("near", 0.001), p("edge", 0.0044)];
  const r = withinRadius(pts, C, 500, "self");
  assert.deepEqual(r.map((x) => x.store_id), ["near", "mid", "edge"]);
  assert.ok(r[0].distance_m >= 110 && r[0].distance_m <= 112);
});

test("같은 거리는 id 순(입력 순서와 상관없이 같은 결과)", () => {
  const a = withinRadius([p("b", 0.001), p("a", 0.001)], C, 500, "x").map((x) => x.store_id);
  const b = withinRadius([p("a", 0.001), p("b", 0.001)], C, 500, "x").map((x) => x.store_id);
  assert.deepEqual(a, ["a", "b"]);
  assert.deepEqual(b, a);
});

test("세부 업종별 묶음은 많은 순, 묶음 안은 가까운 순", () => {
  const list = withinRadius([p("1", 0.002, "커피점/카페"), p("2", 0.001, "제과점"), p("3", 0.003, "커피점/카페"), p("4", 0.004, "커피점/카페")], C, 1000, "x");
  const g = groupByCategory(list);
  assert.deepEqual(g.map((x) => [x.category, x.items.length]), [["커피점/카페", 3], ["제과점", 1]]);
  assert.deepEqual(g[0].items.map((x) => x.store_id), ["1", "3", "4"]);
});

test("거리 표기", () => {
  assert.equal(distanceLabel(87), "87m");
  assert.equal(distanceLabel(1250), "1.3km");
});
