// 철도 접근성 문장·지도 표시 계획 — 서버(rail_access.py)가 보낸 값을 읽기 쉬운 문장으로 바꾼다.
// 역 0개(정말 없음)·이용량 자료 없음·부분 합계·출입구/중심점 혼합 기준을 서로 다른 문구로 쓰고, 승차+하차 합계는 만들지 않는다.
// 다른 모듈을 import 하지 않는 순수 함수(tests/railText.test.ts).

export interface RailSliceInput {
  radius_m: number;
  count: number;
  count_state: "zero" | "ok";
  stations_by_basis: { entrance: number; center: number };
  mixed_basis: boolean;
  entrances: number;
  entrance_scope_complete: boolean;
  center_inside_but_entrance_outside?: number;
  linked: number;
  linked_ratio: number | null;
  usage_state: "no_stations" | "none_linked" | "partial" | "all_linked";
  boardings_observed: number | null;
  alightings_observed: number | null;
  partial_line_stations: number;
  complete_2025_stations: number;
  no_source_region_stations: number;
}

export interface RailMapStation {
  complex_id: string;
  name: string;
  lines: string;
  lon: number;
  lat: number;
  distance_m: number;
  basis: "entrance" | "center";
  entrances: { exit_label: string; exit_no: string | null; lon: number; lat: number; distance_m: number }[];
}

const num = (v: number) => Math.round(v).toLocaleString("ko-KR");
const dist = (m: number) => `${m.toLocaleString("ko-KR")}m`;

export function railCountText(s: Pick<RailSliceInput, "count" | "count_state">): string {
  return s.count_state === "zero" ? "0곳" : `${s.count}곳`;
}

/** 역 수 칸의 보조 문장 — 0곳의 뜻, 접근 기준(출입구/중심점)과 혼합 여부. */
export function railCountNote(s: Pick<RailSliceInput, "count_state" | "stations_by_basis" | "mixed_basis" | "center_inside_but_entrance_outside">): string {
  if (s.count_state === "zero") return (s.center_inside_but_entrance_outside ?? 0) > 0 ? "출입구 기준으로는 반경 안에 역이 없음(아래 안내 참고)" : "공식 역사 정보 기준 반경 안에 역이 없음(자료 누락 아님)";
  const { entrance, center } = s.stations_by_basis;
  if (entrance > 0 && center > 0) return `출입구 기준 ${entrance}곳 + 중심점 기준 ${center}곳(두 기준 혼합)`;
  return entrance > 0 ? "모두 출입구 기준(보조 자료)" : "모두 공식 역 중심점 기준(출입구 자료 없음)";
}

export function railEntranceText(s: Pick<RailSliceInput, "entrances" | "entrance_scope_complete">): string {
  const base = `확인된 출입구 ${s.entrances}곳(카카오 보조 자료·누락 가능)`;
  return s.entrance_scope_complete ? base : `${base} · 이 반경은 출입구 수집 범위 밖이라 일부만 확인됨`;
}

export function railNearestText(n: { name: string; distance_m: number; basis: "entrance" | "center" } | null): { value: string; sub: string } {
  if (!n) return { value: "자료 없음", sub: "" };
  return { value: `${n.name} ${dist(n.distance_m)}`, sub: n.basis === "entrance" ? "출입구 기준 직선거리" : "공식 역 중심점 기준 직선거리" };
}

export function railNearestExitText(e: { station_name: string | null; exit_label: string; distance_m: number } | null): string {
  return e ? `${e.station_name ?? "역"} ${e.exit_label} ${dist(e.distance_m)}` : "확인된 출입구 없음(중심점 기준만)";
}

/** 이용량 연결 한 줄 — '2/3역 (67%)'. 역이 없으면 빈 문자열. */
export function railLinkedText(s: Pick<RailSliceInput, "count" | "linked" | "linked_ratio">): string {
  if (s.count === 0 || s.linked_ratio === null) return "";
  return `이용량 연결 ${s.linked}/${s.count}역 (${Math.round(s.linked_ratio * 100)}%)`;
}

/** 승차·하차 각각의 문장. 연결된 역이 없으면 0 이 아니라 '이용량 자료 없음', 일부만이면 관측된 부분 합계. 승차+하차를 더하지 않는다. */
export function railUsageLines(s: Pick<RailSliceInput, "usage_state" | "boardings_observed" | "alightings_observed" | "partial_line_stations">): { boardings: string; alightings: string; partial: boolean } {
  if (s.usage_state === "no_stations") return { boardings: "해당 없음", alightings: "해당 없음", partial: false };
  if (s.usage_state === "none_linked" || s.boardings_observed === null || s.alightings_observed === null) return { boardings: "이용량 자료 없음", alightings: "이용량 자료 없음", partial: false };
  const partial = s.usage_state === "partial" || s.partial_line_stations > 0;
  const tail = partial ? " (관측된 부분 합계)" : "";
  return { boardings: `${num(s.boardings_observed)}명${tail}`, alightings: `${num(s.alightings_observed)}명${tail}`, partial };
}

export function railNoUsageReasonText(reason: "no_source_for_region" | "no_usage_row" | null): string {
  if (reason === "no_source_for_region") return "이 지역의 이용량 자료를 아직 받지 않음";
  if (reason === "no_usage_row") return "이용량 자료에 연결되는 행이 없음";
  return "";
}

/** 2025 전체 12개월 관측 여부 문장 — 연결된 역 중 12개월이 모두 관측된 역 수. */
export function railCompleteText(s: Pick<RailSliceInput, "linked" | "complete_2025_stations">): string {
  if (s.linked === 0) return "";
  return s.complete_2025_stations === s.linked ? "연결된 역 모두 2025년 12개월 관측" : `2025년 12개월 모두 관측된 역 ${s.complete_2025_stations}/${s.linked}곳`;
}

/** 지도에 그릴 역·출입구(출입구는 반경 안에 있는 것만 — 화면의 '확인된 출입구 N곳'과 같은 기준). 응답의 반경이 지금 선택한 반경과 다르면(이전 반경 결과가 남아 있는 중) 아무것도 그리지 않는다. 출입구는 켰을 때만. */
export function railMapPlan(
  data: { status: string; radius_m?: number; stations?: RailMapStation[] } | null | undefined,
  radius: number,
  showExits: boolean,
): { stations: { id: string; name: string; lines: string; lon: number; lat: number; basis: "entrance" | "center" }[]; exits: { id: string; label: string; lon: number; lat: number }[] } {
  if (!data || data.status !== "ok" || data.radius_m !== radius || !data.stations) return { stations: [], exits: [] };
  const stations = data.stations.map((s) => ({ id: s.complex_id, name: s.name, lines: s.lines, lon: s.lon, lat: s.lat, basis: s.basis }));
  const exits = showExits ? data.stations.flatMap((s) => s.entrances.filter((e) => e.distance_m <= radius).map((e) => ({ id: `${s.complex_id}|${e.exit_label}|${e.lon},${e.lat}`, label: e.exit_no ?? e.exit_label, lon: e.lon, lat: e.lat }))) : [];
  return { stations, exits };
}

/** 중심점은 반경 안인데 확인된 출입구가 모두 반경 밖이라 제외된 역이 있으면 알린다(출입구 자료가 불완전하면 실제 접근 거리와 다를 수 있음). */
export function railExcludedNote(s: Pick<RailSliceInput, "center_inside_but_entrance_outside">): string {
  const n = s.center_inside_but_entrance_outside ?? 0;
  return n > 0 ? `역 중심점은 반경 안이지만 확인된 출입구가 모두 반경 밖이라 세지 않은 역 ${n}곳이 있습니다(출입구 자료가 불완전하면 실제 접근 거리와 다를 수 있음).` : "";
}
