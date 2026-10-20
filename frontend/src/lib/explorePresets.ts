// 예비 창업자 '조건으로 후보 찾기' — 지도 지표(버블)·업종 필터를 그대로 써서 조건에 맞는 지역을 모은다.
// 후보는 '조건에 맞는 곳'을 값 순으로 나열한 것이지 창업 추천 순위가 아니다. 같은 업종·같은 단위·같은 기간의 값끼리만 견준다.
// 표본이 작은 곳(점포 10곳 미만)은 후보에서 빼고 몇 곳을 뺐는지 센다(10~19곳은 주의 표시). 분석 가능 지역(파일럿)의 버블에 있는 곳만 다룬다.
// 다른 모듈은 insightReport 의 표본 기준만 가져오는 순수 함수(tests/explorePresets.test.ts).
import { SAMPLE_CAUTION_BELOW, SAMPLE_MIN } from "./insightReport.ts";

export type PresetId = "growing" | "big_sales" | "low_competition" | "stable_count";
export type PresetMetric = "sales_yoy_pct" | "per_store_month" | "stores" | "stores_volatility";

export interface Preset {
  id: PresetId;
  /** 사용자가 궁금해하는 질문 */
  question: string;
  /** 지도에 칠할 지표(기존 FoodMetric 과 같은 이름) */
  metric: PresetMetric;
  /** 값이 큰 순(desc)·작은 순(asc)으로 나열 */
  order: "desc" | "asc";
  /** 이 조건이 무엇을 보는지 한 줄 */
  what: string;
  /** 읽을 때 주의할 점 */
  caveat: string;
}

export const PRESETS: Preset[] = [
  { id: "growing", question: "매출이 늘고 있는 곳은 어디일까?", metric: "sales_yoy_pct", order: "desc", what: "전년 같은 분기보다 총매출이 늘어난 지역(0% 초과)을 늘어난 폭이 큰 순으로 나열해요.", caveat: "총매출은 점포 수 변화가 섞인 값이고 물가는 보정하지 않았어요. 늘었다고 앞으로도 늘어난다는 뜻은 아니에요." },
  { id: "big_sales", question: "매출 규모가 큰 곳은 어디일까?", metric: "per_store_month", order: "desc", what: "같은 업종 점포 한 곳의 월평균 추정매출이 큰 지역을 큰 순으로 나열해요.", caveat: "카드 결제 기반 추정 평균이에요. 개별 가게의 실제 매출이 아니고, 매출이 큰 곳은 임대료도 높을 수 있어요." },
  { id: "low_competition", question: "같은 업종 가게가 상대적으로 적은 곳은 어디일까?", metric: "stores", order: "asc", what: "같은 업종 점포 수가 적은 지역을 적은 순으로 나열해요(점포 10곳 이상인 곳만).", caveat: "점포 수는 지역 크기에 따라 달라요. 적다고 손님이 많다는 뜻은 아니고, 수요가 적어서 적을 수도 있어요." },
  { id: "stable_count", question: "가게 수 변화가 작은 곳은 어디일까?", metric: "stores_volatility", order: "asc", what: "분기마다 점포 수가 바뀐 정도(변동성)가 작은 지역을 작은 순으로 나열해요.", caveat: "변화가 작다고 장사가 잘 된다는 뜻은 아니에요. 점포 수가 평균 10곳 미만이면 계산하지 않아요." },
];

export const presetById = (id: string): Preset | undefined => PRESETS.find((p) => p.id === id);

/** 버블에서 필요한 값만(apiClient 를 import 하지 않으려고 모양만 맞춘다) */
export interface BubbleLike { code: string; name: string; type: string | null; value: number | null; size: number | null }

export interface Candidate {
  code: string;
  name: string;
  type: string | null;
  value: number;
  /** 같은 업종 점포 수(상가정보) */
  stores: number;
  /** 점포 10~19곳 — 값이 크게 흔들릴 수 있다 */
  caution: boolean;
}

export interface CandidateResult {
  candidates: Candidate[];
  /** 조건에는 맞지만 표시 개수 제한으로 못 보인 곳 수 */
  more: number;
  /** 점포가 10곳 미만이라 뺀 곳 */
  excludedSmall: number;
  /** 지표 값이 없어(자료 없음·표본 부족) 뺀 곳 */
  excludedMissing: number;
  /** 값은 있지만 조건(예: 매출 증가 0% 초과)에 안 맞는 곳 */
  notMatching: number;
}

export function candidatesFor(preset: Preset, bubbles: BubbleLike[], limit = 8): CandidateResult {
  let excludedSmall = 0, excludedMissing = 0, notMatching = 0;
  const ok: Candidate[] = [];
  for (const b of bubbles) {
    if (b.value === null || b.size === null) { excludedMissing++; continue; }
    if (b.size < SAMPLE_MIN) { excludedSmall++; continue; }
    if (preset.id === "growing" && !(b.value > 0)) { notMatching++; continue; }
    if (preset.id === "low_competition" && b.value <= 0) { excludedMissing++; continue; }
    ok.push({ code: b.code, name: b.name, type: b.type, value: b.value, stores: b.size, caution: b.size < SAMPLE_CAUTION_BELOW });
  }
  const dir = preset.order === "desc" ? -1 : 1;
  ok.sort((a, b) => dir * (a.value - b.value) || a.code.localeCompare(b.code));   // 같은 값은 코드 순(결정적)
  return { candidates: ok.slice(0, limit), more: Math.max(0, ok.length - limit), excludedSmall, excludedMissing, notMatching };
}
