import type { ReactNode } from "react";

export type NoticeTone = "info" | "pending" | "warn" | "error" | "muted";

const TONE: Record<NoticeTone, { bg: string; fg: string }> = {
  info: { bg: "#EFF6FF", fg: "#1E3A8A" },
  pending: { bg: "#F5F3FF", fg: "#5B21B6" },
  warn: { bg: "#FFFBEB", fg: "#92400E" },
  error: { bg: "#FEF2F2", fg: "#991B1B" },
  muted: { bg: "#F3F4F6", fg: "#4B5563" },
};

/** '연동 준비 중'·'분석 자료 부족'·'매장 연결 확인 필요'·'조회 실패' 같은 상태 안내. 값이 0인 것과 구분되도록 문구로만 표시한다. */
export function Notice({ tone, children }: { tone: NoticeTone; children: ReactNode }) {
  return (
    <div style={{ background: TONE[tone].bg, color: TONE[tone].fg, borderRadius: 6, padding: "6px 10px", fontSize: 12, lineHeight: 1.5 }}>
      {children}
    </div>
  );
}

export function SourceNote({ title, reference }: { title: string; reference: string }) {
  return (
    <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 6 }}>
      출처: {title} · {reference}
    </div>
  );
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section style={{ borderTop: "1px solid #E5E7EB", paddingTop: 12, marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <strong style={{ fontSize: 14 }}>{title}</strong>
        {right}
      </div>
      {children}
    </section>
  );
}
