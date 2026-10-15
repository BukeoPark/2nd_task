import assert from "node:assert/strict";
import { test } from "node:test";
import { railCompleteText, railCountNote, railCountText, railEntranceText, railExcludedNote, railLinkedText, railMapPlan, railNearestExitText, railNearestText, railNoUsageReasonText, railUsageLines } from "../src/lib/railText.ts";

test("역 수: 0곳과 기준(출입구/중심점/혼합) 문구를 구분한다", () => {
  assert.equal(railCountText({ count: 0, count_state: "zero" }), "0곳");
  assert.equal(railCountText({ count: 3, count_state: "ok" }), "3곳");
  assert.match(railCountNote({ count_state: "zero", stations_by_basis: { entrance: 0, center: 0 }, mixed_basis: false }), /자료 누락 아님/);
  assert.match(railCountNote({ count_state: "zero", stations_by_basis: { entrance: 0, center: 0 }, mixed_basis: false, center_inside_but_entrance_outside: 1 }), /출입구 기준으로는/);
  assert.match(railCountNote({ count_state: "ok", stations_by_basis: { entrance: 2, center: 1 }, mixed_basis: true }), /두 기준 혼합/);
  assert.match(railCountNote({ count_state: "ok", stations_by_basis: { entrance: 2, center: 0 }, mixed_basis: false }), /출입구 기준/);
  assert.match(railCountNote({ count_state: "ok", stations_by_basis: { entrance: 0, center: 2 }, mixed_basis: false }), /중심점 기준\(출입구 자료 없음\)/);
});

test("출입구·최근접: 수집 범위 밖이면 일부만 확인됨, 없으면 중심점 기준만", () => {
  assert.match(railEntranceText({ entrances: 5, entrance_scope_complete: true }), /^확인된 출입구 5곳\(카카오 보조/);
  assert.match(railEntranceText({ entrances: 2, entrance_scope_complete: false }), /수집 범위 밖/);
  assert.deepEqual(railNearestText({ name: "여의도", distance_m: 401, basis: "entrance" }), { value: "여의도 401m", sub: "출입구 기준 직선거리" });
  assert.equal(railNearestText({ name: "당곡", distance_m: 1073, basis: "center" }).sub, "공식 역 중심점 기준 직선거리");
  assert.equal(railNearestText(null).value, "자료 없음");
  assert.equal(railNearestExitText({ station_name: "여의도", exit_label: "3번출구", distance_m: 401 }), "여의도 3번출구 401m");
  assert.match(railNearestExitText(null), /중심점 기준만/);
});

test("이용량: 승차·하차 분리, 부분 합계 표기, 연결 0이면 0명이 아니라 자료 없음", () => {
  const partial = railUsageLines({ usage_state: "partial", boardings_observed: 16904.4, alightings_observed: 15777.2, partial_line_stations: 1 });
  assert.equal(partial.boardings, "16,904명 (관측된 부분 합계)");
  assert.equal(partial.alightings, "15,777명 (관측된 부분 합계)");
  const lines = railUsageLines({ usage_state: "all_linked", boardings_observed: 100, alightings_observed: 0, partial_line_stations: 1 });
  assert.equal(lines.boardings, "100명 (관측된 부분 합계)");                      // 일부 노선만 연결된 역이 있으면 all_linked 여도 부분
  assert.equal(railUsageLines({ usage_state: "all_linked", boardings_observed: 100, alightings_observed: 0, partial_line_stations: 0 }).alightings, "0명");   // 실제 0명은 0명
  assert.equal(railUsageLines({ usage_state: "none_linked", boardings_observed: null, alightings_observed: null, partial_line_stations: 0 }).boardings, "이용량 자료 없음");
  assert.equal(railUsageLines({ usage_state: "no_stations", boardings_observed: null, alightings_observed: null, partial_line_stations: 0 }).boardings, "해당 없음");
  assert.ok(!Object.keys(partial).some((k) => /total|sum|transfer/.test(k)));
  assert.equal(railLinkedText({ count: 3, linked: 2, linked_ratio: 0.6667 }), "이용량 연결 2/3역 (67%)");
  assert.equal(railLinkedText({ count: 0, linked: 0, linked_ratio: null }), "");
  assert.match(railNoUsageReasonText("no_source_for_region"), /아직 받지 않음/);
  assert.equal(railCompleteText({ linked: 2, complete_2025_stations: 2 }), "연결된 역 모두 2025년 12개월 관측");
  assert.equal(railCompleteText({ linked: 3, complete_2025_stations: 1 }), "2025년 12개월 모두 관측된 역 1/3곳");
});

const station = (id: string, exits: number) => ({
  complex_id: id, name: id, lines: "2호선", lon: 126.9, lat: 37.5, distance_m: 100, basis: "entrance" as const,
  entrances: Array.from({ length: exits }, (_, i) => ({ exit_label: `${i + 1}번출구`, exit_no: String(i + 1), lon: 126.9 + i / 1e4, lat: 37.5, distance_m: 100 })),
});

test("지도 표시: 선택 반경과 응답 반경이 같을 때만, 출입구는 켰을 때만 그린다", () => {
  const data = { status: "ok", radius_m: 500, stations: [station("A", 2), station("B", 0)] };
  assert.equal(railMapPlan(data, 500, false).stations.length, 2);
  assert.equal(railMapPlan(data, 500, false).exits.length, 0);                          // 출입구 전체를 항상 그리지 않는다
  assert.equal(railMapPlan(data, 500, true).exits.length, 2);
  const far = { status: "ok", radius_m: 250, stations: [{ ...station("A", 2), entrances: [{ exit_label: "1번출구", exit_no: "1", lon: 1, lat: 1, distance_m: 200 }, { exit_label: "2번출구", exit_no: "2", lon: 2, lat: 2, distance_m: 300 }] }] };
  assert.deepEqual(railMapPlan(far, 250, true).exits.map((e) => e.label), ["1"]);        // 반경 밖 출입구는 그리지 않는다(화면의 출입구 수와 같은 기준)
  assert.deepEqual(railMapPlan(data, 250, true), { stations: [], exits: [] });          // 이전 반경 결과가 남아 있는 동안은 지도에 그리지 않는다
  assert.deepEqual(railMapPlan({ status: "unavailable" }, 500, true), { stations: [], exits: [] });
  assert.deepEqual(railMapPlan(null, 500, true), { stations: [], exits: [] });
  const ids = railMapPlan(data, 500, true).exits.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("중심점은 안인데 출입구가 모두 밖이라 제외된 역은 알린다", () => {
  assert.equal(railExcludedNote({ center_inside_but_entrance_outside: 0 }), "");
  assert.equal(railExcludedNote({}), "");
  assert.match(railExcludedNote({ center_inside_but_entrance_outside: 2 }), /세지 않은 역 2곳/);
});
