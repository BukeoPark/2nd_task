/** 무료 서버의 무거운 분석 요청이 한꺼번에 몰리지 않도록 동시 조회를 제한한다. */
export function createRequestQueue(limit = 2) {
  let active = 0;
  const waiting: Array<() => void> = [];
  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (active >= limit) await new Promise<void>((resolve) => waiting.push(resolve));
    else active += 1;
    try { return await task(); }
    finally {
      const next = waiting.shift();
      if (next) next();
      else active -= 1;
    }
  };
}
