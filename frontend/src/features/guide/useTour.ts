import { useCallback, useEffect, useState } from "react";
import type { Mode } from "../../lib/mode";
import { shouldWelcome, TOURS, tourStorageKey } from "../../lib/tour";

export type TourPhase = "idle" | "welcome" | "running";

function read(mode: Mode): string | null {
  try { return window.localStorage.getItem(tourStorageKey(mode)); } catch { return null; }
}
function markDone(mode: Mode) {
  try { window.localStorage.setItem(tourStorageKey(mode), "done"); } catch { /* 저장 못 해도 이번 방문에는 다시 띄우지 않는다 */ }
}

const WELCOME_DELAY_MS = 1200; // 기본 행정동이 열리고 화면이 자리 잡은 뒤에 띄운다

export interface Tour {
  phase: TourPhase;
  index: number;
  total: number;
  start: () => void;
  next: () => void;
  prev: () => void;
  /** 환영 팝업 닫기(neverAgain 이면 다시 띄우지 않음) */
  dismissWelcome: (neverAgain: boolean) => void;
  /** 진행 중인 튜토리얼 닫기 — 끝까지 봤거나 건너뛰면 이 모드에서는 자동으로 다시 띄우지 않는다 */
  close: () => void;
  /** 도움말 버튼 — 언제든 환영 팝업부터 다시 본다 */
  openHelp: () => void;
}

/** 튜토리얼 상태 — 처음 방문하면(모드별로) 환영 팝업, 시작하면 단계별 안내. 모드를 바꾸면 진행 중이던 안내는 멈춘다. */
export function useTour(mode: Mode): Tour {
  const [phase, setPhase] = useState<TourPhase>("idle");
  const [index, setIndex] = useState(0);
  const total = TOURS[mode].length;

  // 처음 접속할 때 한 번만 환영 팝업을 띄운다(모드를 바꿀 때마다 띄우지 않는다)
  useEffect(() => {
    if (!shouldWelcome(read(mode))) return;
    const id = window.setTimeout(() => setPhase((p) => (p === "idle" ? "welcome" : p)), WELCOME_DELAY_MS);
    // 사용자가 탐색을 시작했다면 자동 안내로 검색·선택을 가로막지 않는다.
    // 도움말에서는 언제든 직접 안내를 열 수 있다.
    const cancel = () => window.clearTimeout(id);
    window.addEventListener("pointerdown", cancel, { once: true, capture: true });
    window.addEventListener("keydown", cancel, { once: true, capture: true });
    window.addEventListener("input", cancel, { once: true, capture: true });
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("pointerdown", cancel, true);
      window.removeEventListener("keydown", cancel, true);
      window.removeEventListener("input", cancel, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { setPhase((p) => (p === "running" ? "idle" : p)); setIndex(0); }, [mode]);

  const start = useCallback(() => { setIndex(0); setPhase("running"); }, []);
  const close = useCallback(() => { markDone(mode); setPhase("idle"); }, [mode]);
  const next = useCallback(() => {
    if (index >= total - 1) { markDone(mode); setPhase("idle"); return; }
    setIndex(index + 1);
  }, [index, total, mode]);
  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const dismissWelcome = useCallback((neverAgain: boolean) => { if (neverAgain) markDone(mode); setPhase("idle"); }, [mode]);
  const openHelp = useCallback(() => setPhase("welcome"), []);

  return { phase, index, total, start, next, prev, dismissWelcome, close, openHelp };
}
