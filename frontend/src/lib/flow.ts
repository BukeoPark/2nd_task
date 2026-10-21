// 이용 순서 — 모드별로 사용자가 밟는 단계의 이름을 한 곳에서 정한다. 시작 화면(StartPanel)·환영 팝업(TourLayer)·랜딩의 이용 흐름이 모두 이 이름을 쓴다.
// 단계 진행 표시줄은 두지 않는다(시작 화면이 같은 순서를 이미 보여 주고, 별도 표시줄이 다른 단계 이름을 써서 헷갈렸다).
// 자영업자는 '우리 가게 장사 점검' 5단계, 예비 창업자는 '후보 탐색 → … → 창업 비용 점검' 4단계다. 보고서는 두 모드 모두 시작 화면의 별도 단추로 먼저 열 수 있다.
// 다른 모듈은 타입만 가져오는 순수 데이터(tests/flow.test.ts).
import type { Mode } from "./mode";

export const START_STEPS: Record<Mode, string[]> = {
  owner: ["내 가게 찾기", "매출·비용 점검", "주변 경쟁 변화", "시간대별 상권 수요", "이번 달 확인사항"],
  founder: ["후보 탐색", "상권 요약", "지역 비교", "창업 비용 점검"],
};

/** "내 가게 찾기 → 매출·비용 점검 → …" 한 줄 */
export const stepsLine = (mode: Mode): string => START_STEPS[mode].join(" → ");
