// 주요 집객시설 문장·지도 표시 계획 — 서버(facility_access.py)가 보낸 값을 읽기 쉬운 문장으로 바꾼다.
// 0곳(공식 목록에 없음)·확인 불가(범위·좌표 누락)·자료 없음(공식 원천 없음)을 서로 다른 문구로 쓰고, 방문객·매출·점수로 바꾸지 않는다.
// 다른 모듈을 import 하지 않는 순수 함수(tests/facilityText.test.ts).

export type FacilityType = "mid_hospital" | "market" | "general_hospital" | "university" | "department_store" | "shopping_mall" | "outlet" | "hypermarket" | "cinema" | "cultural_facility";
export type FacilityCountState = "zero" | "ok" | "incomplete_zero" | "lower_bound" | "no_official_source";

export interface FacilityTypeStatInput {
  type: FacilityType;
  label: string;
  count: number | null;
  count_state: FacilityCountState;
  nearest: { distance_m: number; name: string; display_name?: string } | null;
  reliable: boolean;
  reason: string | null;
  by_subtype?: Record<string, number>;
  status_unknown?: number;
  stale_unlocated?: number;
  stale_in_radius?: number;
  reference_date?: { from: string; to: string } | null;
}

export interface FacilityMapItem {
  facility_id: string;
  name: string;
  display_name?: string;
  type: FacilityType;
  subtype: string | null;
  lon: number;
  lat: number;
  distance_m: number;
  status_label: string;
}

export interface UnclassifiedRetailInput {
  name: string;
  distance_m: number;
}

/** 화면 묶음 — 의료 / 상업(백화점·대형마트·쇼핑몰·아울렛) / 문화·여가 / 교육 / 공공기관. 공공기관은 매장 반경 안 좌표 자료가 아직 없어 종류가 비어 있고, 비어 있는 묶음은 화면에 나오지 않는다. */
export const FACILITY_GROUPS: { id: string; label: string; types: FacilityType[] }[] = [
  { id: "medical", label: "의료", types: ["general_hospital", "mid_hospital"] },
  { id: "commerce", label: "상업", types: ["department_store", "hypermarket", "shopping_mall", "outlet", "market"] },
  { id: "culture", label: "문화·여가", types: ["cinema", "cultural_facility"] },
  { id: "education", label: "교육", types: ["university"] },
  { id: "public", label: "공공기관", types: [] },
];

/** 지도 마커 모양(글자·색) — 레일 보라, 앵커 초록/빨강, 반경 원 파랑과 겹치지 않게 고른다. */
export const FACILITY_MARK: Record<FacilityType, { glyph: string; color: string }> = {
  market: { glyph: "시", color: "#B45309" },
  mid_hospital: { glyph: "병", color: "#BE185D" },
  general_hospital: { glyph: "병", color: "#BE185D" },
  department_store: { glyph: "백", color: "#B45309" },
  hypermarket: { glyph: "마", color: "#B45309" },
  shopping_mall: { glyph: "몰", color: "#B45309" },
  outlet: { glyph: "아", color: "#B45309" },
  cinema: { glyph: "영", color: "#0F766E" },
  cultural_facility: { glyph: "문", color: "#4D7C0F" },
  university: { glyph: "대", color: "#1E40AF" },
};

function dist(m: number): string {
  return `${m.toLocaleString("ko-KR")}m`;
}

/** 개수 문장. 자료 없음·'0곳 확인(누락 가능)'·'N곳 이상'을 진짜 0곳과 구분한다 — 불완전해도 확인된 개수는 숨기지 않는다. */
export function facilityCountText(v: Pick<FacilityTypeStatInput, "count" | "count_state">): string {
  if (v.count_state === "no_official_source" || v.count === null) return "자료 없음";
  if (v.count_state === "incomplete_zero") return "0곳 확인(누락 가능)";
  if (v.count_state === "lower_bound") return `${v.count}곳 이상`;
  return `${v.count}곳`;
}

/** 개수 아래 보조 문장 — 왜 0곳이 아닌지/무슨 기준인지. */
export function facilityCountNote(v: Pick<FacilityTypeStatInput, "count_state" | "reason">): string {
  switch (v.count_state) {
    case "no_official_source": return "공식 좌표 자료 없음 · 0곳이 아님";
    case "zero": return "공식 목록 기준 0곳";
    case "incomplete_zero": return `확인된 것은 0곳이며 누락됐을 수 있음${v.reason ? ` — ${v.reason}` : ""}`;
    case "lower_bound": return `관측된 수 — ${v.reason ?? "일부 누락 가능"}`;
    default: return "공식 목록 기준";
  }
}

/** 가장 가까운 시설. 반경 밖이면 그렇게 표시하고, 자료가 없으면 '자료 없음'. */
export function facilityNearestText(v: Pick<FacilityTypeStatInput, "nearest" | "reliable" | "count_state">, radiusM: number): string {
  if (v.count_state === "no_official_source") return "자료 없음";
  if (!v.nearest) return "없음";
  const out = v.nearest.distance_m > radiusM ? " (반경 밖)" : "";
  return `${v.nearest.display_name ?? v.nearest.name} ${dist(v.nearest.distance_m)}${out}`;
}

/** 병원처럼 세부 종별이 있는 종류의 반경 안 구성 — 예: '상급종합 1 · 종합병원 2'. 없으면 빈 문자열. */
export function facilitySubtypeText(v: Pick<FacilityTypeStatInput, "by_subtype">): string {
  const e = Object.entries(v.by_subtype ?? {}).filter(([, n]) => n > 0);
  return e.map(([k, n]) => `${k} ${n}`).join(" · ");
}

/** 병원·문화시설은 세부 종별이 정보가 되지만 나머지는 종류 이름과 같아 반복이다. */
export const SUBTYPE_SHOWN: readonly FacilityType[] = ["general_hospital", "cultural_facility"];

/** 반경이 경계 인접 구·시에 걸칠 때, 그곳 주소인데 좌표가 없어 빠진 공식 시설이 있다는 알림. 없으면 빈 문자열. */
export function facilityNeighborNote(v: { neighbor_unlocated?: number }): string {
  const n = v.neighbor_unlocated ?? 0;
  return n > 0 ? `경계 인접 구·시에 좌표 없는 공식 시설 ${n}곳 있음(위치 불명 — 경계 근처에서는 누락 가능)` : "";
}

/** 영업상태를 말하지 않는 등재 목록(심평원·서울시 문화공간 등)의 시설이 반경 안에 있으면 알리는 문장. */
export function facilityStatusNote(v: Pick<FacilityTypeStatInput, "count" | "status_unknown">): string {
  const n = v.status_unknown ?? 0;
  return n > 0 ? `${n}곳은 영업상태를 제공하지 않는 등재 목록 기준` : "";
}

/** 인허가 기록이 오래 갱신되지 않은 시설·좌표 없는 오래된 기록을 알리는 문장(현존으로 단정하지 않는다). 없으면 빈 문자열. */
export function facilityStaleNote(v: Pick<FacilityTypeStatInput, "stale_in_radius" | "stale_unlocated">, years = 5): string {
  const parts: string[] = [];
  if ((v.stale_in_radius ?? 0) > 0) parts.push(`${v.stale_in_radius}곳은 인허가 기록이 ${years}년 넘게 갱신되지 않아 현존 여부 미확인`);
  if ((v.stale_unlocated ?? 0) > 0) parts.push(`좌표 없는 오래된 인허가 ${v.stale_unlocated}곳은 현존 여부를 알 수 없어 개수 판단에서 제외`);
  return parts.join(" · ");
}

/** 등록 구분이 '구분없음'이라 종류를 알 수 없는 공식 대규모점포가 반경 안에 있다는 알림(대형마트 등으로 분류하지 않는다). 없으면 빈 문자열. */
export function facilityUnclassifiedNote(items: UnclassifiedRetailInput[] | undefined): string {
  if (!items || items.length === 0) return "";
  const first = items[0];
  return `등록 구분이 '구분없음'이라 종류를 알 수 없는 공식 대규모점포 ${items.length}곳이 반경 안에 있습니다(가장 가까운 곳: ${first.name} ${dist(first.distance_m)}) — 대형마트 등일 수 있으나 분류하지 않아 위 개수에 넣지 않았습니다.`;
}

/** 자료 기준일 — 한 날이면 그 날, 범위면 '시작~끝'. */
export function facilityReferenceText(v: Pick<FacilityTypeStatInput, "reference_date">): string {
  const r = v.reference_date;
  if (!r) return "기준일 없음";
  return r.from === r.to ? `기준일 ${r.from}` : `기준일 ${r.from}~${r.to}`;
}

/** 지도에 그릴 시설 — 응답의 반경이 지금 선택한 반경과 같고 사용자가 켰을 때만. 좌표가 유효한 시설만(한반도 밖·결측 제외). */
export function facilityMapPlan(
  data: { status: string; radius_m?: number; facilities?: FacilityMapItem[] } | null | undefined,
  radius: number,
  show: boolean,
): FacilityMapItem[] {
  if (!show || !data || data.status !== "ok" || data.radius_m !== radius || !data.facilities) return [];
  return data.facilities.filter((f) => Number.isFinite(f.lon) && Number.isFinite(f.lat) && f.lon >= 124 && f.lon <= 132 && f.lat >= 33 && f.lat <= 39 && f.distance_m <= radius);
}

/** 시설 목록을 화면에 보일 만큼만 자른다(가까운 순 유지). */
export function limitList<T>(items: T[], max: number): { shown: T[]; hidden: number } {
  return { shown: items.slice(0, max), hidden: Math.max(0, items.length - max) };
}
