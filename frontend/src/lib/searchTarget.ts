/** 검색 결과를 골랐을 때 지도가 어디로 가서 무엇을 열지 — 지도 확대 레벨(카카오: 작을수록 확대)은 zoomToUnit 과 같은 기준이다.
 * 레벨 ≥8 자치구, ≥6 행정동, ≥4 상권, 그 아래 매장 점. 다른 모듈을 import 하지 않는 순수 함수(npm test 로 검증). */

export type SearchTargetKind = "station" | "trdar" | "dong" | "address" | "store";

export interface SearchTarget {
  /** 이동할 카카오맵 레벨 */
  level: number;
  /** 도착 뒤 요약을 열 버블 단위(없으면 위치만 표시) */
  open: { unit: "trdar" | "dong"; code: string } | null;
  /** 매장 상세로 바로 이어지는가 */
  storeId: string | null;
}

export function searchTarget(r: { kind: SearchTargetKind; level?: "gu" | "dong" | "trdar"; code?: string; store_id?: string }): SearchTarget {
  switch (r.kind) {
    case "store":
      return { level: 3, open: null, storeId: r.store_id ?? null }; // 매장 점이 보이는 범위 + 상세 패널
    case "address":
      return { level: 3, open: null, storeId: null }; // 주소 위치 표시 — 업종을 고르면 주변 후보가 이어짐
    case "dong":
      return { level: 6, open: r.code ? { unit: "dong", code: r.code } : null, storeId: null };
    case "trdar":
      return { level: 4, open: r.code ? { unit: "trdar", code: r.code } : null, storeId: null };
    case "station":
    default:
      return { level: 4, open: null, storeId: null }; // 역 주변 상권 버블이 보이는 범위
  }
}
