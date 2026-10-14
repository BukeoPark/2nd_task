import { useEffect, useState } from "react";
import { NARROW_MAX_PX } from "./vizConfig";

/** 화면이 좁은지(휴대폰 폭) — 창 크기가 바뀌면 따라간다. */
export function useNarrow(): boolean {
  const query = `(max-width: ${NARROW_MAX_PX}px)`;
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return narrow;
}
