import type { AreaBrief, BriefAction, BriefTarget, FactState } from "../../lib/areaBrief";

const FACT_COLOR: Record<FactState, string> = { value: "#111827", missing: "#9CA3AF", hold: "#92400E" };

/** 종합분석 요약 맨 위의 3단 구성 — ① 확인된 사실 ② 어떻게 읽을까? ③ 다음 확인사항(눌러서 이동). 계산은 lib/areaBrief 가 한다. */
export function AreaBriefCard({ brief, onAction }: { brief: AreaBrief; onAction: (t: BriefTarget) => void }) {
  return (
    <section data-tour="area-brief" aria-label="핵심 요약" style={{ marginTop: 12, border: "1px solid #E5E7EB", borderRadius: 12, padding: "14px 14px 12px", background: "#FFFFFF" }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: "#3730A3" }}>{brief.eyebrow}</div>
      <div style={{ fontSize: 12.5, color: "#6B7280" }}>{brief.scopeLine}</div>

      <div style={{ ...stepTitle, marginTop: 10 }}>① 확인된 사실</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))", gap: 10, marginTop: 6 }}>
        {brief.facts.map((f) => (
          <div key={f.key} style={{ background: "#F9FAFB", borderRadius: 10, padding: "8px 10px" }}>
            <div style={{ fontSize: 13, color: "#4B5563" }}>{f.label}</div>
            <div style={{ fontWeight: 800, fontSize: f.state === "value" ? 26 : 17, lineHeight: 1.25, color: FACT_COLOR[f.state] }}>{f.value}</div>
            {f.note && <div style={{ fontSize: 12, color: f.state === "hold" || /주의|일부/.test(f.note) ? "#B45309" : "#6B7280" }}>{f.note}</div>}
          </div>
        ))}
      </div>
      {brief.caution && <div style={{ fontSize: 13.5, color: "#B45309", marginTop: 6 }}>{brief.caution}</div>}

      <div style={{ ...stepTitle, marginTop: 10 }}>② 어떻게 읽을까?</div>
      {brief.reading.length > 0 ? (
        <ul style={{ margin: "4px 0 0", paddingLeft: 16, fontSize: 15, color: "#374151", lineHeight: 1.6 }}>
          {brief.reading.map((t) => <li key={t}>{t}</li>)}
        </ul>
      ) : (
        <div style={{ fontSize: 13.5, color: "#92400E", marginTop: 6 }}>{brief.hold}</div>
      )}

      <div style={{ ...stepTitle, marginTop: 10 }}>③ 다음 확인사항</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
        {brief.next.map((n, i) => <NextLink key={n.target} action={n} primary={i === 0} onClick={() => onAction(n.target)} />)}
      </div>
    </section>
  );
}

function NextLink({ action, primary, onClick }: { action: BriefAction; primary: boolean; onClick: () => void }) {
  return (
    <button type="button" data-tour={action.target === "compare" ? "compare-add" : undefined} onClick={onClick} style={{ textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "8px 12px", minHeight: 40, border: primary ? "1px solid #1D4ED8" : "1px solid #BFDBFE", borderRadius: 8, background: primary ? "#1D4ED8" : "#EFF6FF", color: primary ? "#FFFFFF" : "#1E3A8A", cursor: "pointer", fontSize: 14 }}>
      <span><strong>{action.label}</strong> <span style={{ color: primary ? "#DBEAFE" : "#4B5563", fontSize: 12.5 }}>· {action.why}</span></span>
      <span aria-hidden="true">›</span>
    </button>
  );
}

const stepTitle: React.CSSProperties = { fontSize: 16, fontWeight: 800, color: "#111827" };
