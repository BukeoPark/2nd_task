import { AppIcon } from "../../components/DataVisuals";
import { Fold } from "../../components/Notice";
import type { StoreBrief, StoreBriefTarget } from "../../lib/storeBrief";
import { FS } from "../../lib/typography";

/** 자영업자가 매장을 열면 맨 위에 보이는 핵심 점검 요약 — 확인된 사실 → 어떻게 읽을까? → 다음 확인사항(눌러서 이동). 계산은 lib/storeBrief. */
export function StoreBriefCard({ brief, onAction }: { brief: StoreBrief; onAction: (t: StoreBriefTarget) => void }) {
  return (
    <section aria-label="핵심 점검 요약" style={{ marginTop: 12, border: "1px solid #E5E7EB", borderRadius: 12, padding: "20px", background: "#FFFFFF" }}>
      <div style={{ fontSize: FS.caption, fontWeight: 700, color: "#3730A3" }}>{brief.eyebrow}</div>
      <div style={{ fontSize: FS.cardTitle, fontWeight: 800, marginTop: 8 }}>매장 한눈에</div>
      <div className="store-brief-facts" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, marginTop: 10 }}>
        {brief.facts.map((f, i) => (
          <div key={f.label} style={{ gridColumn: i === brief.facts.length - 1 && brief.facts.length % 2 === 1 ? "1 / -1" : undefined, minWidth: 0, background: "#F8FAFC", border: "1px solid #EEF2F6", borderRadius: 10, padding: "14px 16px" }}>
            <div className="data-heading" style={{ fontSize: FS.ui, color: "#4B5563" }}><AppIcon name={/상권|지역/.test(f.label) ? "pin" : /업력|기간/.test(f.label) ? "clock" : "store"}/>{f.label}</div>
            <div style={{ fontWeight: 800, fontSize: f.value.length > 8 ? FS.cardTitle : FS.metric, lineHeight: 1.35, marginTop: 6, wordBreak: "keep-all" }}>{f.value}</div>
            <div style={{ fontSize: FS.caption, color: "#6B7280", marginTop: 6, lineHeight: 1.8, display: "grid", gap: 8, wordBreak: "keep-all" }}>{f.note}</div>
          </div>
        ))}
      </div>
      <Fold title="참고할 점">
      <ul style={{ margin: "4px 0 0", paddingLeft: 16, fontSize: FS.body, color: "#374151", lineHeight: 1.8, display: "grid", gap: 8, wordBreak: "keep-all" }}>
        {brief.reading.map((t) => <li key={t}>{t}</li>)}
      </ul></Fold>
      <div style={{ fontSize: FS.cardTitle, fontWeight: 800, marginTop: 20 }}>이어서 살펴보기</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
        {brief.next.map((n, i) => (
          <button key={n.target} type="button" onClick={() => onAction(n.target)} style={i === 0 ? primaryStyle : secondaryStyle}>
            <span style={{ minWidth: 0 }}><strong style={{ display: "block", lineHeight: 1.5 }}>{n.label}</strong><span style={{ display: "block", marginTop: 3, opacity: 0.8, fontSize: FS.caption, lineHeight: 1.6 }}>{n.why}</span></span>
            <span aria-hidden="true">›</span>
          </button>
        ))}
      </div>
    </section>
  );
}

const rowStyle: React.CSSProperties = { textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "12px 16px", borderRadius: 8, cursor: "pointer", fontSize: FS.ui, minHeight: 64 };
/** 기본 행동 1개는 채운 단추, 보조 행동은 테두리만 */
const primaryStyle: React.CSSProperties = { ...rowStyle, border: "1px solid #1D4ED8", background: "#1D4ED8", color: "#FFFFFF" };
const secondaryStyle: React.CSSProperties = { ...rowStyle, border: "1px solid #BFDBFE", background: "#EFF6FF", color: "#1E3A8A" };
