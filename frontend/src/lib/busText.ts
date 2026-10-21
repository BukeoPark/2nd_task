// 버스 접근성 문장 만들기 — 서버(bus_access.py)가 보낸 값을 읽기 쉬운 문장으로 바꾼다.
// 0곳(정말 없음)·자료 누락·분석 범위 불완전을 서로 다른 문구로 쓰고, 승차+하차 합계는 만들지 않는다.
// 다른 모듈을 import 하지 않는 순수 함수(tests/busText.test.ts).

export type BusCountState = "zero" | "incomplete_zero" | "lower_bound" | "ok";
export type BusUsageState = "no_stops" | "none_linked" | "all_linked" | "partial";

export interface BusSliceInput {
  radius_m: number;
  count: number;
  count_state: BusCountState;
  scope_complete: boolean;
  linked: number;
  unlinked: number;
  linked_ratio: number | null;
  usage_state: BusUsageState;
  boardings_observed: number | null;
  alightings_observed: number | null;
}

const num = (v: number) => Math.round(v).toLocaleString("ko-KR");

/** 정류장 수 칸의 큰 숫자. 범위가 덜 덮였으면 0·정확한 수처럼 보이지 않게 한다. */
export function busCountText(s: Pick<BusSliceInput, "count" | "count_state">): string {
  switch (s.count_state) {
    case "zero":
      return "0곳";
    case "incomplete_zero":
      return "확인 불가";
    case "lower_bound":
      return `${s.count}곳 이상`;
    default:
      return `${s.count}곳`;
  }
}

/** 정류장 수 칸의 보조 문장 — 0곳의 뜻과 분석 범위 한계를 말한다. */
export function busCountNote(s: Pick<BusSliceInput, "radius_m" | "count_state">, nearestM: number | null): string {
  switch (s.count_state) {
    case "zero":
      return "수집한 범위 안에서 정류장이 없음(자료 누락 아님)";
    case "incomplete_zero":
      return "이 반경이 수집 범위를 벗어나 없다고 말할 수 없음";
    case "lower_bound":
      return "이 반경 일부가 수집 범위 밖이라 실제는 더 많을 수 있음";
    default:
      return nearestM === null ? "" : `가장 가까운 곳 ${nearestM.toLocaleString("ko-KR")}m(직선)`;
  }
}

/** 이용량 연결 한 줄 — '13/19곳 (68%)'. 정류장이 없거나 비율이 없으면 빈 문자열. */
export function busLinkedText(s: Pick<BusSliceInput, "count" | "linked" | "linked_ratio">): string {
  if (s.count === 0 || s.linked_ratio === null) return "";
  return `이용량 연결 ${s.linked}/${s.count}곳 (${Math.round(s.linked_ratio * 100)}%)`;
}

/** 승차·하차 각각의 문장. 연결된 정류장이 없으면 0 이 아니라 '이용량 자료 없음'. 승차와 하차를 더하지 않는다. */
export function busUsageLines(s: Pick<BusSliceInput, "usage_state" | "boardings_observed" | "alightings_observed">): {
  boardings: string;
  alightings: string;
  partial: boolean;
} {
  if (s.usage_state === "no_stops") return { boardings: "해당 없음", alightings: "해당 없음", partial: false };
  if (s.usage_state === "none_linked" || s.boardings_observed === null || s.alightings_observed === null) {
    return { boardings: "이용량 자료 없음", alightings: "이용량 자료 없음", partial: false };
  }
  const partial = s.usage_state === "partial";
  const tail = partial ? " (이용량이 확인된 정류장만 더한 값)" : "";
  return { boardings: `${num(s.boardings_observed)}명${tail}`, alightings: `${num(s.alightings_observed)}명${tail}`, partial };
}
