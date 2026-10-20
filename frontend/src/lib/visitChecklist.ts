// 예비 창업자 '현장 답사 체크리스트' — 체크 상태와 간단한 메모만 이 브라우저에 저장한다(사진·계정·서버 저장 없음).
// 지역(단위:코드)별로 따로 저장한다. 다른 모듈을 import 하지 않는 순수 함수 + localState(tests/visitChecklist.test.ts).
import { readJson, writeJson } from "./localState.ts";

export const VISIT_KEY = "founderVisitChecklist:v1";
export const MEMO_MAX = 200;
export const MAX_UNITS = 30;

export const VISIT_ITEMS = [
  { id: "walk", title: "보행 동선·접근성", hint: "역·정류장에서 후보지까지 걸어 보세요. 횡단보도·경사·유동 방향, 짐을 들고 오기 쉬운지." },
  { id: "view", title: "매장 가시성", hint: "간판이 보이는 거리·방향, 층(1층/2층 이상), 가림 요소(나무·가림막·건물)." },
  { id: "rivals", title: "유사 업종 경쟁 현황", hint: "걸어서 직접 센 같은 업종 가게 수, 메뉴·가격대, 손님이 있는지." },
  { id: "status", title: "실제 영업 상태", hint: "문을 연 가게·폐업·공실을 눈으로 확인하세요(인허가상 영업 상태와 다를 수 있습니다)." },
  { id: "lease", title: "임대 조건·관리비", hint: "보증금·월세·관리비·권리금·계약 기간. 이 서비스에는 실제 임대 조건 자료가 없습니다." },
  { id: "rhythm", title: "주중·주말·시간대별 분위기", hint: "점심·저녁·주말에 각각 가서 유동과 손님 분위기를 비교하세요." },
] as const;

export type VisitItemId = (typeof VISIT_ITEMS)[number]["id"];
const IDS = VISIT_ITEMS.map((i) => i.id) as string[];

export interface VisitState {
  checked: Record<string, boolean>;
  memo: Record<string, string>;
}

export const emptyVisit = (): VisitState => ({ checked: {}, memo: {} });
export const unitKey = (level: string, code: string) => `${level}:${code}`;

export function sanitizeVisit(v: unknown): VisitState {
  const out = emptyVisit();
  if (!v || typeof v !== "object") return out;
  const { checked, memo } = v as { checked?: unknown; memo?: unknown };
  if (checked && typeof checked === "object") for (const id of IDS) if ((checked as Record<string, unknown>)[id] === true) out.checked[id] = true;
  if (memo && typeof memo === "object") for (const id of IDS) {
    const m = (memo as Record<string, unknown>)[id];
    if (typeof m === "string" && m.trim() !== "") out.memo[id] = m.slice(0, MEMO_MAX);
  }
  return out;
}

function readAll(): Record<string, unknown> {
  const raw = readJson(VISIT_KEY);
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

export const loadVisit = (level: string, code: string): VisitState => sanitizeVisit(readAll()[unitKey(level, code)]);

/** 저장 실패면 false. 지역이 너무 많이 쌓이면 가장 오래된 것부터 지운다(MAX_UNITS). */
export function saveVisit(level: string, code: string, s: VisitState): boolean {
  const all = readAll();
  const k = unitKey(level, code);
  delete all[k];
  const empty = Object.keys(s.checked).length === 0 && Object.keys(s.memo).length === 0;
  const next = empty ? all : { ...all, [k]: s };
  const keys = Object.keys(next);
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX_UNITS))) delete next[old];
  return writeJson(VISIT_KEY, next);
}

export const doneCount = (s: VisitState) => VISIT_ITEMS.filter((i) => s.checked[i.id]).length;
