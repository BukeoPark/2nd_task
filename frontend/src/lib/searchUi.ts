// 검색창 보조 로직 — 일치한 글자 강조, 결과 묶음, 최근 검색어. 다른 모듈을 import 하지 않는 순수 함수(tests/searchUi.test.ts).
// 일치 규칙은 서버 검색(backend/app/services/search.normalize)과 같다: 공백·괄호·가운뎃점·쉼표·하이픈을 무시하고 대소문자를 구분하지 않는다.

const SKIP = /[\s()·\-,]/;

export interface Segment { text: string; hit: boolean }

/** 이름 안에서 검색어와 일치하는 부분을 표시한다(없으면 통째로 hit=false). 원래 글자(공백 등)는 그대로 둔다. */
export function highlight(text: string, query: string): Segment[] {
  const q = [...query].filter((c) => !SKIP.test(c)).join("").toLowerCase();
  if (q === "") return [{ text, hit: false }];
  const chars = [...text];
  const kept: number[] = []; // 비교에 쓰는 글자가 원문에서 몇 번째인지
  let stripped = "";
  chars.forEach((c, i) => { if (!SKIP.test(c)) { kept.push(i); stripped += c.toLowerCase(); } });
  const at = stripped.indexOf(q);
  if (at < 0) return [{ text, hit: false }];
  const from = kept[at];
  const to = kept[at + q.length - 1] + 1;
  return [
    { text: chars.slice(0, from).join(""), hit: false },
    { text: chars.slice(from, to).join(""), hit: true },
    { text: chars.slice(to).join(""), hit: false },
  ].filter((s) => s.text !== "");
}

export interface Grouped<T> { kind: string; items: { item: T; index: number }[] }

/** 결과를 종류별로 묶는다 — 서버가 준 순서(역→상권→행정동→브랜드→주소→매장)를 지키고, index 는 전체 목록에서의 위치(키보드 이동용). */
export function groupByKind<T extends { kind: string }>(results: T[]): Grouped<T>[] {
  const groups: Grouped<T>[] = [];
  results.forEach((item, index) => {
    const last = groups[groups.length - 1];
    if (last && last.kind === item.kind) last.items.push({ item, index });
    else groups.push({ kind: item.kind, items: [{ item, index }] });
  });
  return groups;
}

export const RECENT_KEY = "recentSearch:v1";
export const RECENT_MAX = 6;

/** 최근 검색어 목록에 하나를 앞에 더한다(같은 글자는 앞으로 옮김, 최대 RECENT_MAX). */
export function addRecent(list: string[], term: string): string[] {
  const t = term.trim();
  if (t === "") return list;
  return [t, ...list.filter((x) => x !== t)].slice(0, RECENT_MAX);
}

/** 저장된 문자열(JSON)을 목록으로 — 깨졌거나 형식이 다르면 빈 목록. */
export function parseRecent(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}
