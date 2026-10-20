import type { StoreBrief, StoreBriefTarget } from "../../lib/storeBrief";

/** 자영업자가 매장을 열면 맨 위에 보이는 핵심 점검 요약 — 확인된 사실 → 어떻게 읽을까? → 다음 확인사항(눌러서 이동). 계산은 lib/storeBrief. */
export function StoreBriefCard({ brief, onAction }: { brief: StoreBrief; onAction: (t: StoreBriefTarget) => void }) {
  return (
    <section aria-label="핵심 점검 요약" style={{ marginTop: 12, border: "1px solid #E5E7EB", borderRadius: 10, padding: "10px 12px", background: "#FFFFFF" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#3730A3" }}>{brief.eyebrow}</div>
      <div style={{ fontSize: 12, fontWeight: 700, marginTop: 8 }}>① 확인된 사실</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8, marginTop: 4 }}>
        {brief.facts.map((f) => (
          <div key={f.label} style={{ background: "#F9FAFB", borderRadius: 8, padding: "6px 8px" }}>
            <div style={{ fontSize: 11, color: "#6B7280" }}>{f.label}</div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{f.value}</div>
            <div style={{ fontSize: 10, color: "#6B7280" }}>{f.note}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, marginTop: 10 }}>② 어떻게 읽을까?</div>
      <ul style={{ margin: "4px 0 0", paddingLeft: 16, fontSize: 12, color: "#374151", lineHeight: 1.6 }}>
        {brief.reading.map((t) => <li key={t}>{t}</li>)}
      </ul>
      <div style={{ fontSize: 12, fontWeight: 700, marginTop: 10 }}>③ 다음 확인사항</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
        {brief.next.map((n, i) => (
          <button key={n.target} type="button" onClick={() => onAction(n.target)} style={i === 0 ? primaryStyle : secondaryStyle}>
            <span><strong>{n.label}</strong> <span style={{ opacity: 0.8, fontSize: 11 }}>· {n.why}</span></span>
            <span aria-hidden="true">›</span>
          </button>
        ))}
      </div>
    </section>
  );
}

const rowStyle: React.CSSProperties = { textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 8, cursor: "pointer", fontSize: 12.5 };
/** 기본 행동 1개는 채운 단추, 보조 행동은 테두리만 */
const primaryStyle: React.CSSProperties = { ...rowStyle, border: "1px solid #1D4ED8", background: "#1D4ED8", color: "#FFFFFF" };
const secondaryStyle: React.CSSProperties = { ...rowStyle, border: "1px solid #BFDBFE", background: "#EFF6FF", color: "#1E3A8A" };
