import type { Lead } from "../../../lib/reportLead";
import { C } from "./reportColors";

/** 보고서 맨 위 — 모드에 맞는 순서로 '이 보고서에서 볼 수 있는 것'과 그 쪽 번호. 없는 쪽은 없다고 말한다. */
export function ReportLead({ lead }: { lead: Lead }) {
  return (
    <div style={{ border: `1px solid ${C.line}`, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6 }} aria-label={lead.heading}>
      <b style={{ fontSize: 15 }}>{lead.heading}</b>
      <span style={{ fontSize: 12.5, color: C.mute }}>{lead.scopeNote}</span>
      <ol style={{ margin: "4px 0 0", padding: 0, listStyle: "none", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "6px 14px" }}>
        {lead.rows.map((r, i) => (
          <li key={r.title} style={{ fontSize: 14, display: "flex", gap: 8, alignItems: "baseline" }}>
            <span aria-hidden="true" style={{ color: C.accent, fontWeight: 800 }}>{i + 1}</span>
            <span><b>{r.title}</b><br /><span style={{ fontSize: 12.5, color: r.kind === "missing" ? C.bad : C.mute }}>{r.where}</span></span>
          </li>
        ))}
      </ol>
    </div>
  );
}
