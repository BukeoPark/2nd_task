import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { OVERLAY_Z_INDEX } from "../lib/vizConfig";

const TIP_WIDTH = 260;
const EDGE = 8;

/** 동그라미 '?' — 마우스를 올리거나 초점을 주거나(키보드) 누르면(휴대폰) 설명 말풍선이 뜬다. Esc 로 닫는다.
 * 출처·기준일처럼 항상 보일 필요는 없지만 찾으면 바로 볼 수 있어야 하는 정보를 숨길 때 쓴다.
 * 말풍선은 화면 기준(fixed)으로 띄워 서랍의 스크롤·잘림에 가리지 않는다. */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false); // 눌러서 고정(휴대폰) — 마우스를 벗어나도 유지
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const id = useId();

  const show = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.min(Math.max(EDGE, r.left + r.width / 2 - TIP_WIDTH / 2), window.innerWidth - TIP_WIDTH - EDGE);
    setPos({ left, top: r.bottom + 6 });
    setOpen(true);
  };
  const hide = () => { setOpen(false); setPinned(false); };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") hide(); };
    const onDown = (e: MouseEvent) => { if (!btn.current?.contains(e.target as Node)) hide(); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", hide, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", hide, true);
    };
  }, [open]);

  return (
    <span style={{ display: "inline-block", verticalAlign: "middle" }}>
      <button
        ref={btn}
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onMouseEnter={show}
        onMouseLeave={() => { if (!pinned) setOpen(false); }}
        onFocus={show}
        onBlur={() => { if (!pinned) setOpen(false); }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (pinned) hide();
          else { show(); setPinned(true); }
        }}
        style={{ width: 14, height: 14, padding: 0, border: "1px solid #9CA3AF", borderRadius: "50%", background: open ? "#E5E7EB" : "#fff", color: "#6B7280", fontSize: 10, lineHeight: "12px", cursor: "help" }}
      >
        ?
      </button>
      {open && pos && (
        <span
          id={id}
          role="tooltip"
          style={{ position: "fixed", left: pos.left, top: pos.top, width: TIP_WIDTH, zIndex: OVERLAY_Z_INDEX + 5, background: "#111827", color: "#F9FAFB", fontSize: 12.5, lineHeight: 1.55, fontWeight: 400, textAlign: "left", padding: "6px 9px", borderRadius: 6, boxShadow: "0 4px 14px rgba(0,0,0,0.3)", pointerEvents: "none" }}
        >
          {children}
        </span>
      )}
    </span>
  );
}
