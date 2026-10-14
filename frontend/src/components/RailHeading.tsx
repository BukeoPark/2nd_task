import type { ReactNode } from "react";

/** 레일 항목 내용 맨 위의 제목 줄 — 레일에서 고른 항목과 같은 색(글자·왼쪽 막대·옅은 배경)으로 지금 보는 항목을 눈에 띄게 한다. */
export function RailHeading({ fg, bg, title, hint }: { fg: string; bg: string; title: ReactNode; hint?: ReactNode }) {
  return (
    <div style={{ marginTop: 6, padding: "6px 10px", background: bg, borderLeft: `4px solid ${fg}`, borderRadius: 6, color: fg }}>
      <div style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.4 }}>{title}</div>
      {hint && <div style={{ fontSize: 12, fontWeight: 500 }}>{hint}</div>}
    </div>
  );
}
