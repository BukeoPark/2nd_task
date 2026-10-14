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

/** scope: 제목 옆에 붙는 범위 라벨(ScopeTag) — 이 블록이 이 매장·주변 반경·소속 상권·내 입력 중 어느 범위의 정보인지. */
export function Section({ title, children, right, scope }: { title: string; children: ReactNode; right?: ReactNode; scope?: ReactNode }) {
  return (
    <section style={{ borderTop: "1px solid #E5E7EB", paddingTop: 12, marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <strong style={{ fontSize: 14 }}>{title}</strong>
          {scope}
        </span>
        {right}
      </div>
      {children}
    </section>
  );
}

/** 접기/펼치기 — 핵심은 위에 두고 상세는 summary 뒤에 숨긴다. */
export function Fold({ title, open, children }: { title: string; open?: boolean; children: ReactNode }) {
  return (
    <details open={open} style={{ marginTop: 10 }}>
      <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#374151" }}>{title}</summary>
      <div style={{ marginTop: 6 }}>{children}</div>
    </details>
  );
}
