import { useCallback, useState } from "react";
import type { ProgressKey, Seen } from "../../lib/flow";

/** 화면에서 일어난 일을 모아 둔다 — 이용 순서 표시(FlowGuide)가 읽는다. 한 번 일어난 일은 이 방문 동안 유지한다. */
export function useProgress(): { seen: Seen; mark: (k: ProgressKey) => void } {
  const [seen, setSeen] = useState<Seen>(() => new Set<ProgressKey>());
  const mark = useCallback((k: ProgressKey) => {
    setSeen((prev) => (prev.has(k) ? prev : new Set<ProgressKey>(prev).add(k)));
  }, []);
  return { seen, mark };
}
