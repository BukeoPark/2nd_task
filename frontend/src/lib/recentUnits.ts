// 최근 본 지역 — 비교 후보를 제안하는 데 쓴다. 이 브라우저에만 최대 8곳을 둔다(서버 전송 없음).
// 비교는 같은 공간 단위끼리만 하므로 제안도 같은 단위·아직 비교에 담지 않은 지역만 돌려준다.
// 다른 모듈을 import 하지 않는 순수 함수 + localState(tests/recentUnits.test.ts).
import { readJson, writeJson } from "./localState.ts";

export const RECENT_KEY = "recentUnits:v1";
export const MAX_RECENT = 8;

export interface RecentUnit { level: "dong" | "trdar"; code: string; name: string; type: string | null }

export function sanitizeRecent(raw: unknown): RecentUnit[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: RecentUnit[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    if ((o.level !== "dong" && o.level !== "trdar") || typeof o.code !== "string" || !/^[0-9A-Za-z_-]{1,20}$/.test(o.code) || typeof o.name !== "string" || !o.name.trim()) continue;
    const k = `${o.level}:${o.code}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ level: o.level, code: o.code, name: o.name.slice(0, 40), type: typeof o.type === "string" ? o.type.slice(0, 20) : null });
    if (out.length >= MAX_RECENT) break;
  }
  return out;
}

export const loadRecent = (): RecentUnit[] => sanitizeRecent(readJson(RECENT_KEY));

/** 가장 최근 것이 앞으로 — 같은 지역은 한 번만 남긴다. */
export function pushRecent(list: RecentUnit[], u: RecentUnit): RecentUnit[] {
  return sanitizeRecent([u, ...list.filter((x) => !(x.level === u.level && x.code === u.code))]);
}

export const saveRecent = (list: RecentUnit[]): boolean => writeJson(RECENT_KEY, list);

/** 비교 후보 제안 — 같은 단위, 이미 담은 지역 제외, 최근 순, 최대 limit 곳. */
export function suggestForCompare(recent: RecentUnit[], level: string, basketCodes: string[], limit = 4): RecentUnit[] {
  return recent.filter((r) => r.level === level && !basketCodes.includes(r.code)).slice(0, limit);
}
