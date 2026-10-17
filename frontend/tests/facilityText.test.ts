import assert from "node:assert/strict";
import { test } from "node:test";
import { FACILITY_GROUPS, FACILITY_MARK, facilityCountNote, facilityCountText, facilityMapPlan, facilityNearestText, facilityReferenceText, facilityStaleNote, facilityStatusNote, facilitySubtypeText, facilityUnclassifiedNote, limitList } from "../src/lib/facilityText.ts";

test("개수: 자료 없음·확인 불가·N곳 이상·0곳을 서로 다른 문구로 쓴다", () => {
  assert.equal(facilityCountText({ count: null, count_state: "no_official_source" }), "자료 없음");
  assert.equal(facilityCountText({ count: 0, count_state: "zero" }), "0곳");
  assert.equal(facilityCountText({ count: 0, count_state: "incomplete_zero" }), "0곳 확인(누락 가능)");       // 확인된 개수는 숨기지 않는다
  assert.equal(facilityCountText({ count: 2, count_state: "lower_bound" }), "2곳 이상");
  assert.equal(facilityCountText({ count: 3, count_state: "ok" }), "3곳");
  assert.match(facilityCountNote({ count_state: "no_official_source", reason: null }), /0곳이 아님/);
  assert.match(facilityCountNote({ count_state: "incomplete_zero", reason: "좌표가 없는 공식 시설 1곳" }), /확인된 것은 0곳이며 누락됐을 수 있음 — 좌표가 없는/);
  assert.match(facilityCountNote({ count_state: "zero", reason: null }), /공식 목록 기준 0곳/);
});

test("가장 가까운 시설: 반경 밖이면 표시하고, 공식 자료가 없으면 자료 없음", () => {
  const near = { nearest: { distance_m: 617, name: "더현대 서울" }, reliable: true, count_state: "zero" as const };
  assert.equal(facilityNearestText(near, 500), "더현대 서울 617m (반경 밖)");
  assert.equal(facilityNearestText({ ...near, count_state: "ok" }, 1000), "더현대 서울 617m");
  assert.equal(facilityNearestText({ nearest: null, reliable: false, count_state: "no_official_source" }, 500), "자료 없음");
  assert.equal(facilityNearestText({ nearest: null, reliable: true, count_state: "zero" }, 500), "없음");
});

test("병원 종별·상태·기준일 문장", () => {
  assert.equal(facilitySubtypeText({ by_subtype: { 상급종합: 1, 종합병원: 2 } }), "상급종합 1 · 종합병원 2");
  assert.equal(facilitySubtypeText({ by_subtype: {} }), "");
  assert.equal(facilitySubtypeText({}), "");
  assert.equal(facilityStatusNote({ count: 3, status_unknown: 2 }), "2곳은 영업상태를 제공하지 않는 등재 목록 기준");
  assert.equal(facilityStatusNote({ count: 3, status_unknown: 0 }), "");
  assert.equal(facilityReferenceText({ reference_date: { from: "2026-09-23", to: "2026-10-17" } }), "기준일 2026-09-23~2026-10-17");
  assert.equal(facilityReferenceText({ reference_date: { from: "2026-10-17", to: "2026-10-17" } }), "기준일 2026-10-17");
  assert.equal(facilityReferenceText({ reference_date: null }), "기준일 없음");
});

test("화면 묶음은 모든 종류를 정확히 한 번씩 담고 각 종류에 지도 마커가 있다", () => {
  const all = FACILITY_GROUPS.flatMap((g) => g.types).sort();
  assert.deepEqual(all, Object.keys(FACILITY_MARK).sort());
  assert.equal(new Set(all).size, all.length);
  assert.deepEqual(FACILITY_GROUPS.map((g) => g.label), ["의료", "상업", "문화·여가", "교육"]);
  assert.deepEqual(FACILITY_GROUPS[1].types, ["department_store", "hypermarket", "shopping_mall", "outlet"]);
});

const item = (over: Record<string, unknown> = {}) => ({ facility_id: "a", name: "A", type: "cinema" as const, subtype: null, lon: 126.9, lat: 37.5, distance_m: 300, status_label: "영업(인허가 기준)", ...over });

test("지도 표시 계획: 꺼져 있거나 반경이 다르거나 응답이 없으면 아무것도 그리지 않는다", () => {
  const data = { status: "ok", radius_m: 500, facilities: [item(), item({ facility_id: "b", distance_m: 700 }), item({ facility_id: "c", lon: NaN }), item({ facility_id: "d", lat: 0 })] };
  assert.deepEqual(facilityMapPlan(data, 500, false), []);                       // 기본 꺼짐
  assert.deepEqual(facilityMapPlan(data, 250, true), []);                        // 이전 반경 결과는 그리지 않는다
  assert.deepEqual(facilityMapPlan(null, 500, true), []);
  assert.deepEqual(facilityMapPlan({ status: "unavailable" }, 500, true), []);
  assert.deepEqual(facilityMapPlan(data, 500, true).map((f) => f.facility_id), ["a"]);   // 반경 밖·결측·범위 밖 좌표 제외
});

test("시설 목록은 가까운 순으로 정해진 개수만 보인다", () => {
  assert.deepEqual(limitList([1, 2, 3, 4], 3), { shown: [1, 2, 3], hidden: 1 });
  assert.deepEqual(limitList([1], 3), { shown: [1], hidden: 0 });
});

test("세부 종별은 병원·문화시설에만 보이고, 경계 인접 알림은 있을 때만 나온다", async () => {
  const { SUBTYPE_SHOWN, facilityNeighborNote } = await import("../src/lib/facilityText.ts");
  assert.deepEqual([...SUBTYPE_SHOWN].sort(), ["cultural_facility", "general_hospital"]);
  assert.equal(facilityNeighborNote({}), "");
  assert.equal(facilityNeighborNote({ neighbor_unlocated: 0 }), "");
  assert.match(facilityNeighborNote({ neighbor_unlocated: 2 }), /좌표 없는 공식 시설 2곳/);
});

test("표시명이 있으면 가장 가까운 시설에 표시명을 쓰고, 없으면 공식 명칭을 쓴다", () => {
  const base = { reliable: true, count_state: "ok" as const };
  assert.equal(facilityNearestText({ ...base, nearest: { distance_m: 300, name: "롯데컬처웍스(주)롯데시네마", display_name: "롯데시네마 (신도림동)" } }, 500), "롯데시네마 (신도림동) 300m");
  assert.equal(facilityNearestText({ ...base, nearest: { distance_m: 300, name: "CGV 영등포" } }, 500), "CGV 영등포 300m");
});

test("오래된 기록·종류 불명 대규모점포는 현존·종류를 단정하지 않고 알린다", () => {
  assert.equal(facilityStaleNote({}), "");
  assert.match(facilityStaleNote({ stale_in_radius: 1 }), /5년 넘게 갱신되지 않아 현존 여부 미확인/);
  assert.match(facilityStaleNote({ stale_unlocated: 1 }), /좌표 없는 오래된 인허가 1곳.*개수 판단에서 제외/);
  assert.equal(facilityUnclassifiedNote(undefined), "");
  assert.equal(facilityUnclassifiedNote([]), "");
  const t = facilityUnclassifiedNote([{ name: "롯데마트맥스 영등포점", distance_m: 410 }, { name: "다른점", distance_m: 900 }]);
  assert.match(t, /'구분없음'/);
  assert.match(t, /2곳/);
  assert.match(t, /롯데마트맥스 영등포점 410m/);
  assert.match(t, /분류하지 않아/);
});
