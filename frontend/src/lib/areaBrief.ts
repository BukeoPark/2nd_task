// 상권·행정동 종합분석 '요약' 맨 위의 3단 구성 — ① 확인된 사실(중요한 숫자 2~3개) ② 어떻게 읽을까?(데이터로 직접 확인되는 해석 1~2문장)
// ③ 다음 확인사항(눌러서 이동하는 실제 분석 기능). 모드에 따라 사실의 우선순위와 다음 확인사항이 다르다.
//  · 예비 창업자: 성장성·경쟁 강도·점포 변화 → 후보 비교 → 비용 점검 → 현장 확인
//  · 자영업자: 상권 흐름·경쟁 변화 → 내 매장 찾기·내 가게 점검 → 시간대·수요
// 해석은 값 사이의 직접 비교(증감 부호, 폐업률과 개업률의 크기)만 말한다. 원인·유망 여부를 단정하지 않고 종합점수를 만들지 않는다.
// 표본 점포가 10곳 미만이면 해석을 만들지 않고 '분석 보류'라고 말한다(기존 표본 기준과 같다). 0·자료 없음·분석 보류는 서로 다른 말로 쓴다.
// 다른 모듈은 format·insightReport 의 표본 기준만 가져오는 순수 함수(tests/areaBrief.test.ts).
import { formatMetric } from "./format.ts";
import { openCloseRelation, SMALL_CHANGE_PCT, yoyWord } from "./interpretRules.ts";
import { sampleNote, sampleStatus, type SampleStatus } from "./insightReport.ts";
import type { Mode } from "./mode.ts";

export interface BriefCell { value: number | null; note?: string; caution?: boolean; partial?: boolean }
export interface BriefRow { key: string; kind: string; as_of: string | null; cells: BriefCell[] }

export type FactState = "value" | "missing" | "hold";
export interface BriefFact { key: string; label: string; value: string; note: string; state: FactState }

export type BriefTarget = "tab-growth" | "tab-stability" | "tab-demand" | "tab-location" | "tab-cost" | "tab-visit" | "compare" | "search" | "report";
export interface BriefAction { target: BriefTarget; label: string; why: string }

export interface AreaBrief {
  eyebrow: string;
  scopeLine: string;
  facts: BriefFact[];
  reading: string[];
  /** 해석을 만들지 못한 이유(표본 부족·근거 부족). 해석이 있으면 null */
  hold: string | null;
  next: BriefAction[];
  sample: SampleStatus;
  /** 점포 10~19곳일 때 숫자 근처에 붙이는 '소규모 상권' 주의(해석 문장 수에 넣지 않는다). 아니면 null */
  caution: string | null;
}

export interface BriefInput {
  mode: Mode;
  unitWord: "상권" | "행정동";
  /** 업종 범위 — 예: '한식음식점 전체' */
  scope: string;
  rows: BriefRow[];
  /** 서울시 집계 최근 분기 점포 수(없으면 상가정보 점포 수) */
  sampleStores: number | null;
  /** 비교 목록에 이미 한 곳 이상 담겨 있는가 — '비교 열기'와 '비교에 담기' 문구가 달라진다 */
  basketHas: boolean;
}

const row = (rows: BriefRow[], key: string) => rows.find((r) => r.key === key);
const cell = (rows: BriefRow[], key: string) => row(rows, key)?.cells[0];
const HOLD_RE = /표본|너무 적/;
const signed = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;

/** 사실 한 칸 — 값이 있으면 값, 비어 있으면 '분석 보류'(표본이 작아 계산하지 않음)와 '자료 없음'(원천에 없음)을 구분한다. 0 은 값이다. */
export function briefFact(rows: BriefRow[], key: string, label: string): BriefFact {
  const r = row(rows, key);
  const c = r?.cells[0];
  if (!r || !c) return { key, label, value: "자료 없음", note: "이 조건의 자료가 응답에 없음", state: "missing" };
  if (c.value === null) {
    const hold = HOLD_RE.test(c.note ?? "");
    return { key, label, value: hold ? "분석 보류" : "자료 없음", note: c.note ?? (hold ? "점포가 적어 계산하지 않음" : "원천에 값이 없음(0이 아님)"), state: hold ? "hold" : "missing" };
  }
  return { key, label, value: formatMetric(r.kind, c.value), note: [r.as_of ?? "", c.caution ? "소규모 상권: 변동성 주의" : "", c.partial ? "일부 업종만 반영" : ""].filter(Boolean).join(" · "), state: "value" };
}

function readingSentences(rows: BriefRow[]): string[] {
  const out: string[] = [];
  const yoy = cell(rows, "sales_yoy_pct")?.value ?? null;
  const close = cell(rows, "close_rate_y")?.value ?? null;
  const open = cell(rows, "open_rate_y")?.value ?? null;
  const chg = cell(rows, "stores_change_2y")?.value ?? null;
  if (yoy !== null) out.push(`총매출은 전년 동기보다 ${yoyWord(yoy)}(${signed(yoy)}${Math.abs(yoy) < SMALL_CHANGE_PCT ? ", 변화 폭이 작음" : ""}). 점포 수 변화가 함께 반영된 값입니다.`);
  if (close !== null && open !== null) {
    const rel = openCloseRelation(open, close);
    const word = rel === "close_higher" ? "폐업률이 눈에 띄게 더 높습니다" : rel === "open_higher" ? "개업률이 눈에 띄게 더 높습니다" : "큰 차이가 없습니다";
    const period = row(rows, "close_rate_y")?.as_of;
    out.push(`최근 1년${period ? `(${period})` : ""} 개업률 ${open.toFixed(1)}%, 폐업률 ${close.toFixed(1)}%로 ${word}. 원인은 알 수 없고, 리포트의 '최근 분기' 값과는 기간이 달라 직접 견줄 수 없습니다.`);
  }
  if (out.length < 2 && chg !== null) out.push(`약 2년간 같은 업종 점포 수는 ${signed(chg)}입니다.`);
  return out.slice(0, 2);
}

export function buildAreaBrief(inp: BriefInput): AreaBrief {
  const { mode, unitWord, rows } = inp;
  const founder = mode === "founder";
  const sample = sampleStatus(inp.sampleStores);
  const close = briefFact(rows, "close_rate_y", "최근 1년 폐업률");
  const openC = cell(rows, "open_rate_y")?.value ?? null;
  if (close.state === "value" && openC !== null) close.note = [`개업률 ${openC.toFixed(1)}%`, close.note].filter(Boolean).join(" · ");
  const stores = briefFact(rows, "stores_sbiz", "같은 업종 점포 수");
  const chg = cell(rows, "stores_change_2y")?.value ?? null;
  if (stores.state === "value" && chg !== null) stores.note = [`약 2년 ${signed(chg)}`, stores.note].filter(Boolean).join(" · ");

  const facts: BriefFact[] = founder
    ? [briefFact(rows, "per_store_month", "점포당 월평균 추정매출"), briefFact(rows, "sales_yoy_pct", "총매출 증감(전년 동기)"), close]
    : [briefFact(rows, "sales_yoy_pct", "상권 총매출 증감(전년 동기)"), stores, close];

  const tooFew = sample === "too_few";
  const sentences = tooFew ? [] : readingSentences(rows);
  const hold = sentences.length > 0 ? null
    : tooFew ? `${sampleNote(inp.sampleStores, unitWord)} 해석은 보류하고 숫자만 보여 드립니다.`
    : "해석할 근거(전년 동기 증감·개폐업)가 부족해 숫자만 보여 드립니다(자료가 없는 것이지 0이 아닙니다).";
  const reading = sentences;
  const caution = sample === "caution" ? sampleNote(inp.sampleStores, unitWord) : null;

  const next: BriefAction[] = founder
    ? [
        { target: "compare", label: "내 관심 지역에 담고 비교하기", why: inp.basketHas ? "저장한 지역 중 2~4곳을 같은 기준으로" : "담아 두면 보고서·비용·답사까지 이어져요" },
        { target: "tab-cost", label: "창업 비용 점검", why: "내가 넣은 비용으로 손익분기 계산" },
        { target: "tab-visit", label: "현장 확인 체크리스트", why: "숫자로 못 보는 동선·가시성 확인" },
      ]
    : [
        { target: "search", label: "내 매장 찾아 점검하기", why: "내 매출·비용 기록과 상권 평균 견주기" },
        { target: "tab-stability", label: "경쟁·점포 변화 자세히", why: "개업·폐업·프랜차이즈 비중" },
        { target: "tab-demand", label: "시간대·수요 확인", why: "언제 손님이 몰리는지" },
      ];

  return {
    eyebrow: founder ? "예비 창업자 · 핵심 상권 요약" : "자영업자 · 상권·경쟁 변화 요약",
    scopeLine: `${unitWord} 단위 · ${inp.scope} 기준`,
    facts, reading, hold, next, sample, caution,
  };
}
