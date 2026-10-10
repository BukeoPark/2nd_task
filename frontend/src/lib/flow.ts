/** 기본 이용 흐름 — 검색 → 위치 선택 → 업종 선택 → 후보 지역 비교. 지금 어느 단계인지와 다음 행동을 알려 준다.
 * 다른 모듈을 import 하지 않는 순수 함수(npm test 로 검증). */

export const FLOW_STEPS = ["검색", "위치 선택", "업종 선택", "후보 지역 비교"] as const;

export interface FlowInput {
  /** 검색으로 고른 위치가 있는가 */
  placeChosen: boolean;
  /** 업종을 골랐는가 */
  svcChosen: boolean;
  /** 비교에 담은 후보 수 */
  basketCount: number;
}

/** 지금 해야 할 단계(0~3)와 안내 문구. 앞 단계를 건너뛰어도 막지 않는다 — 있는 상태에서 다음 빈 단계를 가리킨다. */
export function flowStatus(f: FlowInput): { current: number; done: boolean[]; hint: string } {
  const done = [f.placeChosen, f.placeChosen, f.svcChosen, f.basketCount >= 2];
  const current = done.findIndex((d) => !d);
  const hints = [
    "주소·역·상권·매장 이름으로 찾아 보세요.",
    "검색 결과를 눌러 위치를 정하세요.",
    "업종을 고르면 그 업종 기준으로 주변 후보 지역이 보입니다.",
    `후보 지역 버블을 눌러 '비교에 담기'로 두 곳 이상 모으세요(${Math.min(f.basketCount, 2)}/2).`,
  ];
  return { current: current === -1 ? 3 : current, done, hint: current === -1 ? "후보를 나란히 비교하고 있어요." : hints[current] };
}
