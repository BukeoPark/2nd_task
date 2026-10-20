// 예비 창업자 '창업 후보지 검토함' — 관심 후보(favorites)마다 업종·분석으로 가는 길·비용 시뮬레이션·답사 체크·짧은 메모를 한 줄로 묶어 보여 준다.
// 새 점수·순위·추천은 만들지 않는다(후보를 '정렬'하지도 않고 담은 순서 그대로). 모든 입력은 이 브라우저에만 저장되고 서버·공유 주소로 나가지 않는다.
// 비용은 후보 지역별로 저장된 시뮬레이션만 읽는다(없으면 '아직 안 함'). 다른 모듈은 같은 폴더의 순수 함수와 localState 만 쓴다(tests/candidateReview.test.ts).
import { computeCostCheck, loadUnitDraft, type CostCheckResult } from "./costCheck.ts";
import { favKey, type FavoriteArea } from "./favorites.ts";
import { readJson, writeJson } from "./localState.ts";
import { VISIT_ITEMS, doneCount, loadVisit } from "./visitChecklist.ts";

export const NOTES_KEY = "candidateNotes:v1";
export const NOTE_MAX = 200;
const MAX_NOTES = 30;

export function sanitizeNotes(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (/^(dong|trdar):[0-9A-Za-z_-]{1,20}$/.test(k) && typeof v === "string" && v.trim() !== "") out[k] = v.slice(0, NOTE_MAX);
    if (Object.keys(out).length >= MAX_NOTES) break;
  }
  return out;
}
export const loadNotes = (): Record<string, string> => sanitizeNotes(readJson(NOTES_KEY));
/** 빈 메모는 지운다. 저장 실패면 false. */
export function saveNote(key: string, text: string): boolean {
  const all = loadNotes();
  const t = text.slice(0, NOTE_MAX);
  if (t.trim() === "") delete all[key]; else all[key] = t;
  return writeJson(NOTES_KEY, all);
}

export interface ReviewRow {
  key: string;
  fav: FavoriteArea;
  /** 답사 체크 진행 */
  visit: { done: number; total: number };
  /** 이 후보에 저장된 비용 시뮬레이션 요약(없으면 null) */
  cost: { status: CostCheckResult["status"]; bepMan: number | null; profitMan: number | null } | null;
  note: string;
}

/** 후보 한 곳의 검토 현황. 저장된 것만 읽고 새로 계산해 채우지 않는다(없으면 null·0). */
export function buildReviewRow(fav: FavoriteArea, notes: Record<string, string>): ReviewRow {
  const key = favKey(fav);
  const draft = loadUnitDraft(key);
  const res = draft ? computeCostCheck(draft) : null;
  const cost = res && res.status !== "empty" ? { status: res.status, bepMan: res.bep, profitMan: res.profit } : null;
  return { key, fav, visit: { done: doneCount(loadVisit(fav.level, fav.code)), total: VISIT_ITEMS.length }, cost, note: notes[key] ?? "" };
}

export function buildReviewRows(favs: FavoriteArea[]): ReviewRow[] {
  const notes = loadNotes();
  return favs.map((f) => buildReviewRow(f, notes));
}
