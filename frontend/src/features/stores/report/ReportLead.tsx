import type { Lead } from "../../../lib/reportLead";
import { C } from "./reportColors";

/** 보고서 맨 위 — 모드에 맞는 순서로 '이 보고서에서 볼 수 있는 것'과 그 쪽 번호. 없는 쪽은 없다고 말한다. */
export function ReportLead({ lead, compact = false }: { lead: Lead; compact?: boolean }) {
  return (
    <div style={{ border: `1px solid ${C.line}`, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6 }} aria-label={lead.heading}>
      <b style={{ fontSize: 15 }}>{compact ? "보고서 길잡이" : lead.heading}</b>
      {!compact && <span style={{ fontSize: 12.5, color: C.mute }}>{lead.scopeNote}</span>}
      <ol style={{ margin: "4px 0 0", padding: 0, listStyle: "none", display: "grid", gridTemplateColumns: compact ? "repeat(3,minmax(0,1fr))" : "repeat(auto-fit, minmax(210px, 1fr))", gap: "6px 14px" }}>
        {lead.rows.map((r, i) => (
          <li key={r.title} style={{ fontSize: 14, display: "flex", gap: 8, alignItems: "baseline" }}>
            <span aria-hidden="true" style={{ color: C.accent, fontWeight: 800 }}>{i + 1}</span>
            <span><b style={/종합 정리|실전 팁/.test(r.title) ? {color:C.accent} : undefined}>{/종합 정리|실전 팁/.test(r.title) ? "★ " : ""}{compact ? r.title.replace("경쟁(개폐업·프랜차이즈)","경쟁 변화").replace("입지(교통·임대료 참고값)","입지 여건").replace("내 매장 주변 경쟁(개폐업·프랜차이즈)","주변 경쟁") : r.title}</b><br /><span style={{ fontSize: 12.5, color: r.kind === "missing" ? C.bad : C.mute }}>{r.where}</span></span>
          </li>
        ))}
      </ol>
    </div>
  );
}
