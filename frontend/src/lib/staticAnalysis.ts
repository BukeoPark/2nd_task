/** CDN에 미리 계산한 공식 응답을 읽고, 지원하지 않는 조건만 분석 서버로 보낸다. */
export function canonicalRequest(path: string): string {
  const url = new URL(path, "https://local.invalid");
  url.searchParams.sort();
  return url.pathname + (url.searchParams.size ? `?${url.searchParams}` : "");
}

type JsonObject = Record<string, unknown>;
type Comparison = JsonObject & { units: unknown[]; rows: Array<JsonObject & { key: string; as_of: string; cells: unknown[] }> };
export function combineComparisons(parts: Comparison[]): Comparison | undefined {
  if (!parts.length) return undefined;
  const first = parts[0];
  if (parts.some(p => p.rows.length !== first.rows.length || p.rows.some((r,i) => r.key !== first.rows[i].key || r.as_of !== first.rows[i].as_of))) return undefined;
  return { ...first, units: parts.flatMap(p => p.units), rows: first.rows.map((r,i) => ({...r,cells:parts.flatMap(p => p.rows[i].cells)})) };
}

export function createStaticAnalysisReader(fetchJson: (path: string) => Promise<unknown>) {
  let manifest: Promise<{routes:Record<string,string>}> | undefined;
  const shards = new Map<string, Promise<Record<string,unknown>>>();
  async function lookup(path: string): Promise<unknown> {
    manifest ??= fetchJson("/analysis/manifest.json").then(v => v as {routes:Record<string,string>}).catch(e => {manifest=undefined;throw e;});
    const file = (await manifest).routes[canonicalRequest(path)];
    if (!file) return undefined;
    if (!shards.has(file)) {
      if (shards.size >= 4) shards.delete(shards.keys().next().value!);
      shards.set(file,fetchJson(`/analysis/${file}`).then(v => v as Record<string,unknown>).catch(e => {shards.delete(file);throw e;}));
    }
    return (await shards.get(file)!)[canonicalRequest(path)];
  }
  return async (path: string): Promise<unknown> => {
    const u = new URL(path,"https://local.invalid");
    if (u.pathname === "/api/food/compare" && u.searchParams.get("codes")?.includes(",")) {
      const codes=[...new Set(u.searchParams.get("codes")!.split(","))];
      if(codes.length>10)return undefined;
      const parts=await Promise.all(codes.map(code=>{const q=new URLSearchParams(u.searchParams);q.set("codes",code);return lookup(`${u.pathname}?${q}`);}));
      if(parts.some(p=>p===undefined))return undefined;
      return combineComparisons(parts as Comparison[]);
    }
    return lookup(path);
  };
}
