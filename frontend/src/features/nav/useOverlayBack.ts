import { useCallback, useEffect, useRef } from "react";
import { overlays } from "../../lib/overlayHistory";

/** 전체 화면 작업창이 떠 있는 동안 브라우저 뒤로가 그 창을 닫게 한다. 창은 `{open && <Modal/>}` 처럼 열릴 때 만들어지는 컴포넌트 안에서 `useOverlayBack(onClose)` 로 쓰고,
 * 돌려받은 requestClose 를 '← 뒤로' 단추·Esc 에 연결한다(브라우저 뒤로와 같은 결과). 부모가 창을 직접 닫아도 기록은 어긋나지 않는다. */
export function useOverlayBack(onClose: () => void, enabled = true): () => void {
  const level = useRef<number | null>(null);
  const mounted = useRef(false);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });   // 가장 최근 onClose 를 쓴다
  useEffect(() => {
    if (!enabled) return;
    mounted.current = true;
    if (overlays && level.current === null) {
      level.current = overlays.open(() => { level.current = null; closeRef.current(); });
    }
    return () => {
      mounted.current = false;
      // 개발 모드(StrictMode)는 효과를 한 번 더 돌리므로, 곧바로 다시 붙지 않을 때만 정리한다.
      window.setTimeout(() => {
        if (!mounted.current && level.current !== null) { overlays?.forget(level.current); level.current = null; }
      }, 0);
    };
  }, [enabled]);
  const requestClose = useCallback(() => {
    if (overlays && level.current !== null) overlays.requestClose(level.current);
    else closeRef.current();
  }, []);
  // Esc — 가장 위에 열린 창 하나만 닫는다(비용 점검 창 위에서 Esc 를 눌러도 아래 창은 그대로)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && overlays && level.current !== null && overlays.isTop(level.current)) requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [requestClose]);
  return requestClose;
}
