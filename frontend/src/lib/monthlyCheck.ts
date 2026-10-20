// 자영업자 '우리 가게 월간 점검' — 내 가게 기록(월 매출·비용)을 달마다 돌아보고, 이번 달 확인할 일을 체크한다.
// 계산은 기존 손익분기(lib/breakeven)와 기록(lib/myStoreStorage)을 그대로 쓰고, 새 통계·점수·경영 처방은 만들지 않는다.
// 기록 없음은 0원이 아니라 '기록 없음'으로 말한다. 이전 달 대비는 연속한 두 달이 모두 기록돼 있을 때만 구한다.
// 모두 이 브라우저에만 저장한다(점검 체크·메모는 `monthlyCheck:v1`, 가게 이름 목록은 `myStoreIndex:v1`). 공유 주소에는 담기지 않는다.
// 다른 모듈은 같은 폴더의 순수 함수와 localState 만 쓴다(tests/monthlyCheck.test.ts).
import { breakeven, parseNum } from "./breakeven.ts";
import { latestMonth } from "./checkup.ts";
import { readJson, writeJson } from "./localState.ts";
import type { StoreRecord } from "./myStoreStorage.ts";

export const MONTHLY_KEY = "monthlyCheck:v1";
export const INDEX_KEY = "myStoreIndex:v1";
export const MEMO_MAX = 200;
const MAX_STORES = 30;
const MAX_MONTHS_KEPT = 24;

/** 이번 달 확인사항 — 'record' 는 기록 여부로 자동 확인되고 나머지는 직접 체크한다. 질문형으로, 정답이 아니라 '해 봤는지'만 묻는다. */
export const MONTHLY_ITEMS = [
  { id: "record", title: "이번 달 매출을 기록했나요?", hint: "기록하면 상권 같은 업종의 변화율과 견줄 수 있어요.", auto: true },
  { id: "cost", title: "임대료·인건비·원가율을 최신으로 고쳤나요?", hint: "비용이 바뀌었다면 손익분기가 달라져요.", auto: false },
  { id: "rivals", title: "주변 같은 업종 가게의 변화를 훑어봤나요?", hint: "새로 생긴 곳·문 닫은 곳은 인허가 기록 기준이라 현장 확인이 필요해요.", auto: false },
  { id: "hours", title: "손님이 몰리는 시간대와 내 영업시간을 견줘 봤나요?", hint: "유동인구는 지나가는 사람이지 우리 가게 손님이 아니에요.", auto: false },
  { id: "action", title: "이번 달에 해 볼 한 가지를 정했나요?", hint: "메뉴·가격·영업시간처럼 작게 시험해 볼 것을 메모해 두세요.", auto: false },
] as const;
export type MonthlyItemId = (typeof MONTHLY_ITEMS)[number]["id"];

export const monthOf = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

function prevMonth(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`;
}

export interface RecordSummary {
  /** 최근 6개월(기록된 달만, 오래된 순) */
  months: { month: string; value: number }[];
  latest: { month: string; value: number } | null;
  /** 이번 달 기록이 있는가 */
  hasThisMonth: boolean;
  /** 직전 달 대비 변화율(%) — 연속한 두 달이 모두 기록돼 있을 때만, 아니면 null */
  momPct: number | null;
  /** 비용 입력 칸 수(5칸 중) */
  costsFilled: number;
  /** 가장 최근 달 매출 기준 손익분기 월매출·예상 영업손익(만원). 비용이 없으면 null */
  bepMan: number | null;
  profitMan: number | null;
}

export function recordSummary(record: StoreRecord, now: Date): RecordSummary {
  const latestKey = latestMonth(record.months);
  const months = Object.entries(record.months).filter(([, v]) => Number.isFinite(v) && v >= 0).sort(([a], [b]) => a.localeCompare(b)).slice(-6).map(([month, value]) => ({ month, value }));
  const latest = latestKey ? { month: latestKey, value: record.months[latestKey] } : null;
  const prev = latest ? record.months[prevMonth(latest.month)] : undefined;
  const momPct = latest && prev !== undefined && prev > 0 ? ((latest.value - prev) / prev) * 100 : null;
  const c = record.costs;
  const costsFilled = Object.values(c).filter((v) => v.trim() !== "").length;
  const be = costsFilled > 0 ? breakeven({ rent: parseNum(c.rent), labor: parseNum(c.labor), otherFixed: parseNum(c.otherFixed), cogsPct: parseNum(c.cogsPct), feePct: parseNum(c.feePct) }, latest ? latest.value : null, null) : null;
  return {
    months, latest, hasThisMonth: record.months[monthOf(now)] !== undefined, momPct, costsFilled,
    bepMan: be && be.status === "ok" ? be.bep : null, profitMan: be && be.status === "ok" ? be.profit : null,
  };
}

// ── 이번 달 확인 체크(가게별·달별) ──
export interface MonthState { done: Partial<Record<MonthlyItemId, boolean>>; memo: string }
export const emptyMonth = (): MonthState => ({ done: {}, memo: "" });

function readAll(): Record<string, Record<string, unknown>> {
  const raw = readJson(MONTHLY_KEY);
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, Record<string, unknown>>) : {};
}

export function sanitizeMonth(v: unknown): MonthState {
  const out = emptyMonth();
  if (!v || typeof v !== "object") return out;
  const o = v as { done?: unknown; memo?: unknown };
  if (o.done && typeof o.done === "object") for (const it of MONTHLY_ITEMS) if ((o.done as Record<string, unknown>)[it.id] === true) out.done[it.id] = true;
  if (typeof o.memo === "string") out.memo = o.memo.slice(0, MEMO_MAX);
  return out;
}

export function loadMonth(storeId: string, month: string): MonthState {
  return sanitizeMonth(readAll()[storeId]?.[month]);
}

/** 저장 실패면 false. 달이 24개를 넘으면 오래된 달부터 지운다. 비어 있으면 그 달 기록을 지운다. */
export function saveMonth(storeId: string, month: string, s: MonthState): boolean {
  const all = readAll();
  const store = { ...(all[storeId] ?? {}) };
  const empty = Object.keys(s.done).length === 0 && s.memo.trim() === "";
  if (empty) delete store[month]; else store[month] = s;
  const keys = Object.keys(store).sort();
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX_MONTHS_KEPT))) delete store[old];
  all[storeId] = store;
  return writeJson(MONTHLY_KEY, all);
}

/** 확인한 개수(자동 항목 'record' 는 이번 달 기록이 있으면 확인된 것으로 센다). */
export function monthlyDone(s: MonthState, hasThisMonth: boolean): number {
  return MONTHLY_ITEMS.filter((it) => (it.id === "record" ? hasThisMonth : s.done[it.id] === true)).length;
}

// ── 점검한 가게 목록(이름만) — 지도에서 가게를 열 때 남겨 두어 '월간 점검'에서 다시 고를 수 있게 한다 ──
export interface MyStoreEntry { storeId: string; name: string; dong: string; seenAt: number }

export function sanitizeIndex(raw: unknown): MyStoreEntry[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const out: MyStoreEntry[] = [];
  for (const [storeId, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^[0-9A-Za-z_-]{1,40}$/.test(storeId) || !v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    if (typeof o.name !== "string" || o.name.trim() === "") continue;
    out.push({ storeId, name: o.name.slice(0, 40), dong: typeof o.dong === "string" ? o.dong.slice(0, 20) : "", seenAt: typeof o.seenAt === "number" && Number.isFinite(o.seenAt) ? o.seenAt : 0 });
  }
  return out.sort((a, b) => b.seenAt - a.seenAt || a.storeId.localeCompare(b.storeId)).slice(0, MAX_STORES);
}
export const loadMyStores = (): MyStoreEntry[] => sanitizeIndex(readJson(INDEX_KEY));

export function noteMyStore(e: Omit<MyStoreEntry, "seenAt">, now: number): boolean {
  const all = Object.fromEntries(loadMyStores().map((x) => [x.storeId, { name: x.name, dong: x.dong, seenAt: x.seenAt }]));
  all[e.storeId] = { name: e.name, dong: e.dong, seenAt: now };
  return writeJson(INDEX_KEY, Object.fromEntries(sanitizeIndex(all).map((x) => [x.storeId, { name: x.name, dong: x.dong, seenAt: x.seenAt }])));
}
