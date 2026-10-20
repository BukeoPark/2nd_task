import { useCallback, useState } from "react";
import { MODE_STORAGE_KEY, resolveMode, withMode, type Mode } from "../../lib/mode";

function readStored(): string | null {
  try {
    return window.localStorage.getItem(MODE_STORAGE_KEY);
  } catch {
    return null; // 저장소를 못 쓰는 환경(사생활 보호 창 등)에서도 화면은 동작한다
  }
}

/** 이용 모드 — 주소(?mode=) > 이 브라우저에 기억한 값 > 기본. 바꾸면 기억하고 주소의 mode 도 맞춘다(다른 값은 그대로). */
export function useMode(): [Mode, (m: Mode) => void] {
  const [mode, setModeState] = useState<Mode>(() => resolveMode(window.location.search, readStored()));
  const setMode = useCallback((m: Mode) => {
    setModeState(m);
    try {
      window.localStorage.setItem(MODE_STORAGE_KEY, m);
    } catch {
      /* 저장 못 해도 이번 방문에는 적용된다 */
    }
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${withMode(window.location.search, m)}${window.location.hash}`);
  }, []);
  return [mode, setMode];
}
