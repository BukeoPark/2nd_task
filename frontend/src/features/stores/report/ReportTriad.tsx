import type { Triad } from "../../../lib/reportTriad";
import { C } from "./reportColors";

/** 리포트 첫 부분 — 확인된 사실 / 주의할 점 / 직접 확인할 것. 아래 상세 차트·해석은 그대로 이어진다. */
export function ReportTriad({ triad }: { triad: Triad }) {
  const col = (title: string, items: string[], color: string, bg: string) => (
    <div style={{ background: bg, borderRadius: 10, padding: "10px 12px", flex: "1 1 200px", minWidth: 0 }}>
      <div style={{ fontWeight: 800, fontSize: 13, color }}>{title}</div>
      <ul style={{ margin: "6px 0 0", paddingLeft: 16, fontSize: 12.5, lineHeight: 1.6, color: C.ink }}>
        {items.map((t) => <li key={t}>{t}</li>)}
      </ul>
    </div>
  );
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }} aria-label="확인된 사실·주의할 점·직접 확인할 것">
      {col("확인된 사실", triad.facts, C.teal, C.tealSoft)}
      {col("주의할 점", triad.cautions, C.accent, C.accentSoft)}
      {col("직접 확인할 것", triad.todo, C.ink, "#F3F4F6")}
    </div>
  );
}
