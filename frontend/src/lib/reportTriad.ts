// 리포트 첫 부분의 세 칸 — '확인된 사실 / 주의할 점 / 직접 확인할 것'. 새 계산·점수 없이 리포트가 이미 만든 값(타일·신호·확인 목록)을 모드별로 다시 묶는다.
// 주의할 점에는 항상 붙는 경고(추정매출은 실제 매출이 아님 등)를 먼저 둔다. 근거가 없으면 칸을 비우지 않고 '자료 없음'이라고 말한다.
// 다른 모듈을 import 하지 않는 순수 함수(tests/reportTriad.test.ts).

export interface TriadInput {
  mode: "owner" | "founder";
  tiles: { label: string; value: string; note?: string }[];
  /** 리포트가 이미 만든 주의 신호의 제목(있으면) */
  cautions: string[];
  /** 리포트가 이미 만든 '확인할 일' */
  checklist: string[];
  /** 점포가 적어 해석을 보류했다는 안내(있으면 주의 맨 앞에) */
  sampleNote?: string | null;
}

export interface Triad {
  facts: string[];
  cautions: string[];
  todo: string[];
}

export const STANDING_CAUTIONS: Record<"owner" | "founder", string[]> = {
  owner: ["추정매출은 카드 결제 기반 평균이에요. 개별 가게(우리 가게)의 실제 매출이 아니에요.", "관측된 차이와 가능한 해석만 담았어요. 원인은 이 자료로 알 수 없어요."],
  founder: ["추정매출은 상권 평균이며 내 매출 예상치가 아닙니다.", "창업 성공을 뜻하지 않아요. 임대 조건은 현장에서 확인하세요."],
};

const FACTS_MAX = 3;
const CAUTIONS_MAX = 4;
const TODO_MAX = 4;

export function buildTriad(i: TriadInput): Triad {
  const facts = i.tiles.slice(0, FACTS_MAX).map((t) => `${t.label}: ${t.value}${t.note ? ` (${t.note})` : ""}`);
  const cautions = [...(i.sampleNote ? [i.sampleNote] : []), ...i.cautions, ...STANDING_CAUTIONS[i.mode]].slice(0, CAUTIONS_MAX);
  const todo = i.checklist.slice(0, TODO_MAX);
  return { facts: facts.length ? facts : ["이 조건에서 확인된 수치가 없어요(자료 없음)."], cautions, todo: todo.length ? todo : ["현장에서 직접 확인할 항목은 아래 '확인할 일'을 보세요."] };
}
