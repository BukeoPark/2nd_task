// 관심 지역 — 계정 없이 이 브라우저에만 최대 10곳을 저장한다. 같은 지역(단위+코드)은 한 번만 담는다.
// 공유 주소(?unit=trdar:3130205&svc=CS100001)에는 모드·단위·지역 코드·업종 코드만 담는다 — 개인정보·내 매출·비용은 담지 않는다.
// 다른 모듈을 import 하지 않는 순수 함수 + localState(tests/favorites.test.ts).
import { readJson, writeJson } from "./localState.ts";

export const FAVORITES_KEY = "favoriteAreas:v1";
export const MAX_FAVORITES = 10;

export type FavLevel = "dong" | "trdar";

export interface FavoriteArea {
  level: FavLevel;
  code: string;
  name: string;
  type: string | null;
  lon: number | null;
  lat: number | null;
  /** 담을 때 보고 있던 업종(없으면 외식 전체) — 다시 열 때 같은 업종으로 본다 */
  svc: string | null;
  scls: string | null;
}

const CODE_RE = /^[0-9A-Za-z_-]{1,20}$/;
const SVC_RE = /^CS\d{6}$/;
const SCLS_RE = /^[0-9A-Za-z]{1,12}$/;

export const favKey = (f: Pick<FavoriteArea, "level" | "code">) => `${f.level}:${f.code}`;

function cleanOne(v: unknown): FavoriteArea | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if ((o.level !== "dong" && o.level !== "trdar") || typeof o.code !== "string" || !CODE_RE.test(o.code) || typeof o.name !== "string" || o.name.trim() === "") return null;
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
  return {
    level: o.level, code: o.code, name: o.name.slice(0, 40), type: typeof o.type === "string" ? o.type.slice(0, 20) : null,
    lon: num(o.lon), lat: num(o.lat),
    svc: typeof o.svc === "string" && SVC_RE.test(o.svc) ? o.svc : null,
    scls: typeof o.scls === "string" && SCLS_RE.test(o.scls) ? o.scls : null,
  };
}

/** 저장된 값을 믿지 않고 다시 검사한다 — 모양이 틀린 항목·중복·10곳 초과는 버린다. */
export function sanitizeFavorites(raw: unknown): FavoriteArea[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: FavoriteArea[] = [];
  for (const r of raw) {
    const f = cleanOne(r);
    if (!f || seen.has(favKey(f))) continue;
    seen.add(favKey(f));
    out.push(f);
    if (out.length >= MAX_FAVORITES) break;
  }
  return out;
}

export const loadFavorites = (): FavoriteArea[] => sanitizeFavorites(readJson(FAVORITES_KEY));
export const saveFavorites = (list: FavoriteArea[]): boolean => writeJson(FAVORITES_KEY, list);

export type AddStatus = "added" | "duplicate" | "full" | "invalid";

export function addFavorite(list: FavoriteArea[], item: FavoriteArea): { list: FavoriteArea[]; status: AddStatus } {
  const f = cleanOne(item);
  if (!f) return { list, status: "invalid" };
  if (list.some((x) => favKey(x) === favKey(f))) return { list, status: "duplicate" };
  if (list.length >= MAX_FAVORITES) return { list, status: "full" };
  return { list: [...list, f], status: "added" };
}

export const removeFavorite = (list: FavoriteArea[], key: string): FavoriteArea[] => list.filter((x) => favKey(x) !== key);
export const isFavorite = (list: FavoriteArea[], f: Pick<FavoriteArea, "level" | "code">) => list.some((x) => favKey(x) === favKey(f));

export interface ShareTarget { level: FavLevel; code: string; svc: string | null; scls: string | null }

/** 공유 주소의 검색 문자열(?mode=…&unit=…&svc=…) — 위 네 값과 모드만 담는다. */
export function shareSearch(mode: string, t: ShareTarget): string {
  const p = new URLSearchParams();
  p.set("mode", mode === "founder" ? "founder" : "owner");
  p.set("unit", `${t.level}:${t.code}`);
  if (t.svc && SVC_RE.test(t.svc)) p.set("svc", t.svc);
  if (t.scls && SCLS_RE.test(t.scls)) p.set("scls", t.scls);
  return `?${p.toString()}`;
}

/** 주소에서 공유 대상을 읽는다 — 모양이 올바르지 않으면 null(그 값은 무시한다). */
export function parseShare(search: string): ShareTarget | null {
  const p = new URLSearchParams(search);
  const m = /^(dong|trdar):([0-9A-Za-z_-]{1,20})$/.exec(p.get("unit") ?? "");
  if (!m) return null;
  const svc = p.get("svc");
  const scls = p.get("scls");
  return { level: m[1] as FavLevel, code: m[2], svc: svc && SVC_RE.test(svc) ? svc : null, scls: scls && SCLS_RE.test(scls) ? scls : null };
}
