// 내 가게 점검 기록 — 이 브라우저의 localStorage 에만 둔다(서버 전송 없음). 가게(storeId)별로 따로 저장한다.
// localStorage 는 시크릿 창·차단·용량 초과에서 막힐 수 있어 모든 접근을 try/catch 로 감싸고, 막히면 저장만 포기한다.

const KEY = "myStoreCheckup:v1";
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const COST_KEYS = ["rent", "labor", "otherFixed", "cogsPct", "feePct"] as const;

export type CostKey = (typeof COST_KEYS)[number];

export interface StoreRecord {
  months: Record<string, number>; // "YYYY-MM" → 월 매출(만원)
  costs: Record<CostKey, string>; // 입력칸 원문(만원 또는 %)
}

export function emptyRecord(): StoreRecord {
  return { months: {}, costs: { rent: "", labor: "", otherFixed: "", cogsPct: "", feePct: "" } };
}

function readAll(): Record<string, unknown> {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** 저장된 값을 믿지 않고 모양을 다시 검사한다(수동 편집·옛 버전 데이터 대비). */
function sanitize(value: unknown): StoreRecord {
  const rec = emptyRecord();
  if (!value || typeof value !== "object") return rec;
  const { months, costs } = value as { months?: unknown; costs?: unknown };
  if (months && typeof months === "object") {
    for (const [m, v] of Object.entries(months)) {
      if (MONTH_RE.test(m) && typeof v === "number" && Number.isFinite(v) && v >= 0) rec.months[m] = v;
    }
  }
  if (costs && typeof costs === "object") {
    for (const k of COST_KEYS) {
      const v = (costs as Record<string, unknown>)[k];
      if (typeof v === "string") rec.costs[k] = v.slice(0, 12);
    }
  }
  return rec;
}

export function loadRecord(storeId: string): StoreRecord {
  return sanitize(readAll()[storeId]);
}

/** 저장에 실패하면 false — 화면은 계속 쓸 수 있지만 새로고침하면 사라진다고 알려야 한다. */
export function saveRecord(storeId: string, record: StoreRecord): boolean {
  try {
    const all = readAll();
    all[storeId] = record;
    window.localStorage.setItem(KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

export function clearRecord(storeId: string): boolean {
  try {
    const all = readAll();
    delete all[storeId];
    window.localStorage.setItem(KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}
