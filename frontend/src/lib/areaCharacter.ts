// 상권 유형 및 입지 특성 화면의 문장·색 — 서버(area_character.py)가 보낸 값을 읽기 쉬운 문장으로 바꾼다.
// 값이 없으면 0 이 아니라 사유(또는 '자료 없음')를 쓴다. 다른 모듈을 import 하지 않는 순수 함수(tests/areaCharacter.test.ts).

export type TraitKey = "business" | "residential" | "transit" | "commercial";

/** 특성별 색 — 글자색은 배경과 대비 4.5:1 이상(테스트가 지킨다). 색에만 기대지 않고 항상 이름을 함께 쓴다. */
export const TRAIT_STYLE: Record<TraitKey, { bg: string; fg: string }> = {
  business: { bg: "#DBEAFE", fg: "#1E3A8A" },
  residential: { bg: "#DCFCE7", fg: "#166534" },
  transit: { bg: "#EDE9FE", fg: "#5B21B6" },
  commercial: { bg: "#FFEDD5", fg: "#9A3412" },
};
export const NEUTRAL_STYLE = { bg: "#F3F4F6", fg: "#374151" };

/** 같은 단위 안 위치(percentile rank, 높을수록 큼) → 문장. 중간권은 위치를 말하지 않는다. */
export function rankText(rank: number | null): string {
  if (rank === null) return "";
  if (rank >= 75) return `같은 단위 상위 ${Math.max(1, Math.round(100 - rank))}%`;
  if (rank <= 25) return `같은 단위 하위 ${Math.max(1, Math.round(rank))}%`;
  return "같은 단위 중간 수준";
}

/** 값 칸 → 문장. 값이 없으면 사유(note)를, 사유도 없으면 '자료 없음' — 0 으로 쓰지 않는다. */
export function cellText(cell: { value: number | null; note?: string } | null | undefined, fmt: (v: number) => string): string {
  if (!cell) return "자료 없음";
  return cell.value === null ? (cell.note ?? "자료 없음") : fmt(cell.value);
}

export const peopleText = (v: number) => `${Math.round(v).toLocaleString("ko-KR")}명`;
export const countText = (v: number) => `${Math.round(v).toLocaleString("ko-KR")}곳`;
export const pctText = (v: number) => `${v.toFixed(1)}%`;

/** 값 칸 아래 줄 — 기준 시점과 원천을 함께(점포 수=상가정보, 증감·개폐업=서울시 통계처럼 집계 기준이 다른 값을 같은 모집단으로 읽지 않게). */
export function cellSub(cell: { as_of?: string; source?: string } | null | undefined): string | undefined {
  const t = [cell?.as_of, cell?.source].filter(Boolean).join(" · ");
  return t || undefined;
}

/** 점포 밀도 비교 기준 문장 — 판정 기준(외식 전체 상위 25%)은 업종을 고르면 같은 척도가 아니라 비교하지 않는다. */
export function densityReferenceText(applies: boolean | undefined, p75: number | null): string | undefined {
  if (applies === false) return "업종 선택 중 — 판정 기준(외식 전체)과 직접 비교하지 않음";
  return p75 === null ? undefined : `외식 전체 상위 25% 기준 ${p75.toLocaleString("ko-KR")}곳/㎢`;
}

/** 면적당 밀도 — 면적이 작은 상권은 값이 크게 튀므로 참고 표시를 붙인다. */
export function densityText(perKm2: number | null, small: boolean): string {
  if (perKm2 === null) return "자료 없음";
  return `${Math.round(perKm2).toLocaleString("ko-KR")}곳/㎢${small ? " (면적이 작아 참고용)" : ""}`;
}

/** 경계와 앵커 사이의 거리 문장 — 경계 안에 있으면 '경계 안 N곳', 없으면 경계에서 거리. */
export function anchorText(a: { inside: number; nearest_m: number | null }): string {
  if (a.inside > 0) return `경계 안 ${a.inside}곳`;
  return a.nearest_m === null ? "자료 없음" : `경계 안 0곳 · 경계에서 가장 가까운 곳 ${a.nearest_m.toLocaleString("ko-KR")}m`;
}

/** 업무·주거 특성이 붙지 않았는데 수요 구조가 판정된 경우(혼합형)에만 알린다 — 다른 특성만 보여 수요 구조가 빠진 것처럼 보이지 않게. */
export function demandStructureNote(t: { kind: "traits" | "mixed" | "hold"; traits: { key: string }[]; demand_label?: string | null; worker_share: number | null }): string {
  if (t.kind !== "traits" || t.demand_label !== "혼합형" || t.worker_share === null) return "";
  return `수요 구조는 혼합형입니다(직장인구 ${Math.round(t.worker_share)}%) — 업무·주거 어느 기준에도 해당하지 않습니다.`;
}

/** 유형 헤드라인 아래 보조 설명 — 보류·혼합일 때 이유를 말한다(특성이 붙은 경우는 근거 목록이 대신한다). */
export function typeNotice(t: { kind: "traits" | "mixed" | "hold"; mixed_evidence?: string[]; hold_reason?: string }): string {
  if (t.kind === "hold") return t.hold_reason ?? "판정할 근거가 부족합니다.";
  if (t.kind === "mixed") return (t.mixed_evidence ?? []).join(" · ");
  return "";
}

// ── 특성 네 영역의 '핵심 메시지' — 긴 설명 위에 한두 줄로 먼저 보이는 요약. 값이 있는 사실만 말하고 좋고 나쁨·성공 가능성은 말하지 않는다.
export interface KeyMessageInput {
  transit: {
    rail: { count: number; nearest_m: number | null; boardings_observed: number | null; year: number };
    bus: { count: number; per_km2: number | null };
  };
  demand: {
    workers: { value: number | null };
    residents: { value: number | null };
    demand_type: string | null;
    floating: { lunch_pct: number | null; lunch_rank: number | null } | null;
  };
  anchor: {
    starbucks: { inside: number; nearest_m: number | null };
    daiso: { inside: number; nearest_m: number | null };
    facilities: { total: { value: number | null }; per_km2: number | null; reference_median: number | null };
  };
  competition: {
    stores: { value: number | null };
    density_per_km2: number | null;
    small_area: boolean;
    change_2y: { value: number | null };
    open_rate_y: { value: number | null };
    close_rate_y: { value: number | null };
  };
}

const num = (v: number) => Math.round(v).toLocaleString("ko-KR");
const signed1 = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;

/** 앵커 한 브랜드를 짧게 — 경계 안 N곳, 없으면 경계 밖 가장 가까운 거리, 모르면 null. */
function anchorShort(a: { inside: number; nearest_m: number | null }): string | null {
  if (a.inside > 0) return `경계 안 ${a.inside}곳`;
  return a.nearest_m === null ? null : `경계 밖 ${num(a.nearest_m)}m`;
}

export interface KeyMessages {
  transit: string | null;
  demand: string | null;
  commerce: string | null;
  competition: string | null;
}

export function keyMessages(d: KeyMessageInput): KeyMessages {
  const { rail, bus } = d.transit;
  let transit: string | null = null;
  if (rail.count > 0) {
    transit = `지하철역 ${rail.count}곳이 경계 안·250m 이내에 있고${rail.boardings_observed !== null ? `, 연결된 역의 하루 평균 승차는 약 ${num(rail.boardings_observed)}명(${rail.year}년)입니다` : "입니다"}.`;
    if (bus.count > 0) transit += ` 경계 안 버스 정류장은 ${bus.count}곳입니다.`;
  } else {
    transit = `경계 안·250m 이내에 지하철역이 없고${rail.nearest_m !== null ? `(가장 가까운 역 ${num(rail.nearest_m)}m)` : ""} 경계 안 버스 정류장은 ${bus.count}곳입니다.`;
  }

  const w = d.demand.workers.value, r = d.demand.residents.value, f = d.demand.floating;
  const parts: string[] = [];
  if (w !== null && r !== null) parts.push(`직장인구 ${num(w)}명·상주인구 ${num(r)}명${d.demand.demand_type ? `으로 ${d.demand.demand_type}에 가깝고` : "이고"}`);
  else if (w !== null) parts.push(`직장인구 ${num(w)}명이고`);
  if (f && f.lunch_pct !== null) parts.push(`점심(11~14시) 유동 비중은 ${f.lunch_pct.toFixed(1)}%${f.lunch_rank !== null ? `(${rankText(f.lunch_rank)})` : ""}`);
  const demand = parts.length ? parts.join(" ").replace(/(고|이고)\s*$/, "") + "입니다." : null;

  const sb = anchorShort(d.anchor.starbucks), ds = anchorShort(d.anchor.daiso);
  const fac = d.anchor.facilities.total.value;
  const cparts: string[] = [];
  if (sb) cparts.push(`스타벅스 ${sb}`);
  if (ds) cparts.push(`다이소 ${ds}`);
  if (fac !== null) cparts.push(`집객시설 ${num(fac)}곳${d.anchor.facilities.reference_median !== null && d.anchor.facilities.per_km2 !== null ? `(㎢당 ${num(d.anchor.facilities.per_km2)}곳, 같은 단위 중앙값 ${num(d.anchor.facilities.reference_median)}곳)` : ""}`);
  const commerce = cparts.length ? `${cparts.join(" · ")}입니다.` : null;

  const c = d.competition;
  const kparts: string[] = [];
  if (c.stores.value !== null) kparts.push(`선택 업종 점포 ${num(c.stores.value)}곳${c.density_per_km2 !== null ? `(㎢당 ${num(c.density_per_km2)}곳${c.small_area ? ", 면적이 작아 참고용" : ""})` : ""}`);
  if (c.close_rate_y.value !== null && c.open_rate_y.value !== null) kparts.push(`최근 1년 개업률 ${c.open_rate_y.value.toFixed(1)}%·폐업률 ${c.close_rate_y.value.toFixed(1)}%`);
  if (c.change_2y.value !== null) kparts.push(`약 2년간 점포 수 ${signed1(c.change_2y.value)}`);
  const competition = kparts.length ? `${kparts.join(", ")}입니다.` : null;

  return { transit, demand, commerce, competition };
}
