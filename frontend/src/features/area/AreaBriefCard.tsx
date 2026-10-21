import type { AreaBrief, BriefAction, BriefTarget, FactState } from "../../lib/areaBrief";
import { FS } from "../../lib/typography";

const FACT_COLOR: Record<FactState, string> = { value: "#111827", missing: "#9CA3AF", hold: "#92400E" };

/** 종합분석 요약 맨 위의 3단 구성 — ① 확인된 사실 ② 어떻게 읽을까? ③ 다음 확인사항(눌러서 이동). 계산은 lib/areaBrief 가 한다. */
export function AreaBriefCard({ brief, onAction }: { brief: AreaBrief; onAction: (t: BriefTarget) => void }) {
  return (
    <section data-tour="area-brief" aria-label="핵심 요약" style={{ marginTop: 12, border: "1px solid #E5E7EB", borderRadius: 12, padding: "20px", background: "#FFFFFF" }}>
      {/* 모드·'핵심 요약' 이름은 위 질문 제목과 겹쳐 빼고, 어느 단위·업종 기준인지 한 줄만 둔다 */}
      <div style={{ fontSize: FS.caption, color: "#6B7280" }}>{brief.scopeLine}</div>

      <div style={{ ...stepTitle, marginTop: 20 }}>① 확인된 사실</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, marginTop: 10 }}>
        {brief.facts.map((f, i) => (
          <div key={f.key} style={{ gridColumn: i === 0 && brief.facts.length % 2 === 1 ? "1 / -1" : undefined, minWidth: 0, background: "#F8FAFC", border: "1px solid #EEF2F6", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: FS.warn, color: "#4B5563", lineHeight: 1.5, wordBreak: "keep-all" }}>{f.label}</div>
            <div style={{ fontWeight: 800, fontSize: f.state === "value" ? FS.metric : FS.cardTitle, lineHeight: 1.3, marginTop: 6, whiteSpace: f.state === "value" ? "nowrap" : undefined, fontVariantNumeric: "tabular-nums", color: FACT_COLOR[f.state] }}>{f.value}</div>
            {f.note && <div style={{ fontSize: FS.caption, marginTop: 6, lineHeight: 1.6, wordBreak: "keep-all", color: f.state === "hold" || /주의|일부/.test(f.note) ? "#B45309" : "#6B7280" }}>{f.note}</div>}
          </div>
        ))}
      </div>
      {brief.caution && <div style={{ fontSize: FS.warn, color: "#B45309", marginTop: 6 }}>{brief.caution}</div>}

      <div style={{ ...stepTitle, marginTop: 20 }}>② 어떻게 읽을까?</div>
      {brief.reading.length > 0 ? (
        <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: FS.body, color: "#374151", lineHeight: 1.8, display: "grid", gap: 8, wordBreak: "keep-all", overflowWrap: "anywhere" }}>
          {brief.reading.map((t) => <li key={t}>{t}</li>)}
        </ul>
      ) : (
        <div style={{ fontSize: FS.warn, color: "#92400E", marginTop: 6 }}>{brief.hold}</div>
      )}

      <div style={{ ...stepTitle, marginTop: 20 }}>③ 다음 확인사항</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
        {brief.next.map((n, i) => <NextLink key={n.target} action={n} primary={i === 0} onClick={() => onAction(n.target)} />)}
      </div>
    </section>
  );
}

function NextLink({ action, primary, onClick }: { action: BriefAction; primary: boolean; onClick: () => void }) {
  return (
    <button type="button" data-tour={action.target === "compare" ? "compare-add" : undefined} onClick={onClick} style={{ textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "12px 16px", minHeight: 64, border: primary ? "1px solid #1D4ED8" : "1px solid #BFDBFE", borderRadius: 8, background: primary ? "#1D4ED8" : "#EFF6FF", color: primary ? "#FFFFFF" : "#1E3A8A", cursor: "pointer", fontSize: FS.ui }}>
      <span style={{ minWidth: 0 }}><strong style={{ display: "block", fontSize: FS.ui, lineHeight: 1.5 }}>{action.label}</strong><span style={{ display: "block", marginTop: 3, color: primary ? "#DBEAFE" : "#4B5563", fontSize: FS.caption, lineHeight: 1.6, wordBreak: "keep-all" }}>{action.why}</span></span>
      <span aria-hidden="true">›</span>
    </button>
  );
}

const stepTitle: React.CSSProperties = { fontSize: FS.cardTitle, fontWeight: 800, color: "#111827" };
