import type { AnchorHTMLAttributes, MouseEvent } from "react";
import { navigate } from "../lib/navigate";

/** 앱 안 주소로 가는 링크 — 평소엔 새로고침 없이 이동하고, 새 탭·Ctrl/⌘ 클릭은 브라우저 기본 동작을 그대로 둔다. href 는 그대로 남아 주소 복사·접근성에 쓰인다. */
export function AppLink({ to, onClick, ...rest }: { to: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || rest.target === "_blank") return;
    e.preventDefault();
    navigate(to);
  };
  return <a {...rest} href={to} onClick={handle} />;
}
