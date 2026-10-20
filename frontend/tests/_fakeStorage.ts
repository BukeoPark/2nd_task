// 테스트용 localStorage — window.localStorage 를 흉내 낸다. fail=true 면 쓰기가 막힌 환경(시크릿 창·용량 초과)처럼 던진다.
export function installFakeStorage(opts: { failWrite?: boolean; failRead?: boolean } = {}) {
  const data = new Map<string, string>();
  const ls = {
    getItem: (k: string) => { if (opts.failRead) throw new Error("blocked"); return data.has(k) ? (data.get(k) as string) : null; },
    setItem: (k: string, v: string) => { if (opts.failWrite) throw new Error("quota"); data.set(k, v); },
    removeItem: (k: string) => { data.delete(k); },
  };
  (globalThis as unknown as { window: unknown }).window = { localStorage: ls };
  return { data, ls };
}
