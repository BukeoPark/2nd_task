/** 조회 화면 상태 — 새 조건의 결과를 기다리는 동안 이전 결과가 현재 결과처럼 보이거나 눌리지 않게 구분한다.
 * 다른 모듈을 import 하지 않는 순수 함수라 `npm test`(node --test)로 바로 검증한다. */

export type ViewState =
  | "loading" //     최초 로딩 — 보여줄 이전 결과가 없음
  | "refetching" //  조건 변경 후 재조회 — 화면의 데이터는 이전 조건의 결과(오래된 결과)
  | "error" //       조회 실패 — 다시 시도 가능
  | "empty" //       정상 조회, 조건에 맞는 항목이 0곳
  | "no-data" //     정상 조회지만 이 지표의 값이 모든 항목에서 비어 있음(자료 없음)
  | "ready"; //      현재 조건의 결과

export interface QueryFlags {
  isPending: boolean;
  isError: boolean;
  /** react-query 의 isPlaceholderData — 새 조건 키의 결과가 아직 없어 이전 키의 데이터를 대신 보여주는 중 */
  isPlaceholderData: boolean;
  hasData: boolean;
}

export interface ContentFlags {
  /** 정상 응답이지만 항목이 0곳 */
  empty?: boolean;
  /** 정상 응답이지만 모든 값이 비어 있음 */
  noData?: boolean;
}

export function viewState(q: QueryFlags, content: ContentFlags = {}): ViewState {
  if (q.isError) return "error";
  if (!q.hasData) return q.isPending ? "loading" : "error";
  if (q.isPlaceholderData) return "refetching";
  if (content.empty) return "empty";
  if (content.noData) return "no-data";
  return "ready";
}

/** 오래된(이전 조건의) 결과나 오류 화면으로는 상세 조회·비교·선택을 진행하지 않는다. */
export function canAct(state: ViewState): boolean {
  return state === "ready" || state === "no-data" || state === "empty";
}

/** 버블 목록의 내용 분류 — 0곳('조건에 맞는 매장 없음')과 자료 없음(값이 비어 있음)을 구분한다. */
export function classifyBubbles(metric: string, bubbles: { size: number | null; value: number | null }[]): ContentFlags {
  if (bubbles.every((b) => !b.size)) return { empty: true };
  if (metric !== "stores" && bubbles.every((b) => b.value === null)) return { noData: true };
  return {};
}
