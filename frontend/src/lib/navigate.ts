import { isInternalPath } from "./route";

/** 앱 안 이동 이벤트 — pushState 는 popstate 를 일으키지 않으므로 라우트(App)가 이 이벤트로 알아챈다. */
export const NAVIGATE_EVENT = "app:navigate";

/** 새로고침 없이 같은 앱 안의 다른 주소로 간다(기록에 한 칸 쌓음). 안쪽 경로가 아니면 무시한다. */
export function navigate(to: string, opts?: { replace?: boolean }): void {
  if (!isInternalPath(to)) return;
  const cur = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (to === cur) return;
  if (opts?.replace) window.history.replaceState(null, "", to);
  else window.history.pushState(null, "", to);
  window.dispatchEvent(new Event(NAVIGATE_EVENT));
}
