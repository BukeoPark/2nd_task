// 이용 순서 — 모드별로 사용자가 밟는 단계와, 지금 어느 단계인지·다음 행동. 앞 단계를 건너뛰어도 막지 않고 비어 있는 첫 단계를 가리킨다.
// 단계가 끝났는지는 화면에서 일어난 일(ProgressKey)을 모아 둔 집합으로만 판단한다. 다른 모듈은 타입만 가져오는 순수 함수(tests/flow.test.ts).
import type { Mode } from "./mode";

/** 화면에서 일어난 일 — 단계 진행 표시와 튜토리얼이 같이 쓴다. */
export type ProgressKey =
  | "place" // 검색 결과를 골랐다
  | "store" // 매장 상세를 열었다
  | "area" // 행정동·상권 종합분석을 열었다
  | "metric" // 지도 지표를 바꿨다
  | "svc" // 업종을 골랐다
  | "record" // 내 가게 월 매출을 기록했다
  | "basket2" // 비교에 두 곳 이상 담았다
  | "compare" // 입지 비교를 열었다
  | "report"; // 인사이트 리포트를 열었다

export type Seen = ReadonlySet<ProgressKey>;

interface FlowStep {
  label: string;
  hint: string;
  done: (s: Seen) => boolean;
}

export const FLOW: Record<Mode, FlowStep[]> = {
  owner: [
    { label: "내 가게 찾기", hint: "내 가게 이름이나 주소를 검색해 보세요.", done: (s) => s.has("place") || s.has("store") },
    { label: "내 상권 확인", hint: "매장 상세의 '상권' 탭에서 소속 상권 분석을 열어 보세요.", done: (s) => s.has("area") },
    { label: "주변 상권과 비교", hint: "상단 '지도 지표'를 매출·점포 수·개폐업 등으로 바꿔 주변 상권과 견줘 보세요.", done: (s) => s.has("metric") },
    { label: "내 업종 보기", hint: "상단에서 내 업종·세부 업종을 고르면 그 업종 기준으로 볼 수 있어요.", done: (s) => s.has("svc") },
    { label: "내 가게 견주기", hint: "매장 상세 '내 가게' 탭에 월 매출을 기록해 보세요(이 브라우저에만 저장됩니다).", done: (s) => s.has("record") },
    { label: "인사이트 리포트", hint: "'상권 인사이트 리포트 뽑기'로 한 번에 정리해 보세요.", done: (s) => s.has("report") },
  ],
  founder: [
    { label: "지역 찾기", hint: "관심 있는 지역·역·상권을 검색해 보세요.", done: (s) => s.has("place") || s.has("area") },
    { label: "업종 고르기", hint: "창업하려는 업종을 고르면 그 업종 기준으로 후보 지역이 보입니다.", done: (s) => s.has("svc") },
    { label: "후보 담기", hint: "후보 지역을 '내 관심 지역에 담기'로 두 곳 이상 모아 보세요.", done: (s) => s.has("basket2") },
    { label: "지역 비교", hint: "'내 관심 지역'에서 2~4곳을 골라 나란히 견줘 보세요.", done: (s) => s.has("compare") },
    { label: "상권분석 보고서", hint: "'상권분석 보고서 보기'로 후보 한 곳을 4쪽으로 정리해 보세요.", done: (s) => s.has("report") },
  ],
};

export interface FlowStatus {
  steps: { label: string; done: boolean }[];
  /** 지금 해야 할 단계(0부터). 모두 끝났으면 마지막 단계 */
  current: number;
  hint: string;
  finished: boolean;
}

export function flowStatus(mode: Mode, seen: Seen): FlowStatus {
  const steps = FLOW[mode].map((s) => ({ label: s.label, done: s.done(seen) }));
  const first = steps.findIndex((s) => !s.done);
  const finished = first === -1;
  return {
    steps,
    current: finished ? steps.length - 1 : first,
    hint: finished ? "모든 단계를 살펴보셨어요. 궁금한 곳을 자유롭게 둘러보세요." : FLOW[mode][first].hint,
    finished,
  };
}
