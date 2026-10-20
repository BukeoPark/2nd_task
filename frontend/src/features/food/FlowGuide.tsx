import { flowStatus, type Seen } from "../../lib/flow";
import type { Mode } from "../../lib/mode";
import { useNarrow } from "../../lib/useNarrow";
import { OVERLAY_Z_INDEX } from "../../lib/vizConfig";

/** 이용 순서(모드별)에서 지금 어느 단계인지와 다음 행동. 좁은 화면에서는 지금 단계 하나만 보인다. */
export function FlowGuide({ mode, seen }: { mode: Mode; seen: Seen }) {
  const { steps, current, hint, finished } = flowStatus(mode, seen);
  const narrow = useNarrow();
  const color = (i: number) => (i === current && !finished ? "#1D4ED8" : steps[i].done ? "#059669" : "#9CA3AF");
  return (
    <div
      data-tour="flow"
      aria-label="이용 순서"
      style={{
        position: "absolute", zIndex: OVERLAY_Z_INDEX, top: 62, left: "50%", transform: "translateX(-50%)", background: "rgba(255,255,255,0.96)", maxWidth: "calc(100vw - 24px)",
        borderRadius: 999, padding: "5px 14px", boxShadow: "0 2px 8px rgba(0,0,0,0.15)", fontSize: 13, display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap",
      }}
    >
      {(narrow ? [current] : steps.map((_, i) => i)).map((i) => (
        <span key={steps[i].label} aria-current={i === current && !finished ? "step" : undefined} style={{ display: "flex", alignItems: "center", gap: 4, color: color(i), fontWeight: i === current ? 700 : 400 }}>
          <span style={{ width: 16, height: 16, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "white", background: color(i) === "#9CA3AF" ? "#D1D5DB" : color(i) }}>
            {steps[i].done && !(i === current && !finished) ? "✓" : i + 1}
          </span>
          {steps[i].label}
          {!narrow && i < steps.length - 1 && <span style={{ color: "#D1D5DB" }}>›</span>}
        </span>
      ))}
      {narrow && <span style={{ color: "#6B7280" }}>{current + 1}/{steps.length}</span>}
      <span style={{ color: "#6B7280", borderLeft: "1px solid #E5E7EB", paddingLeft: 8, overflow: "hidden", textOverflow: "ellipsis", maxWidth: narrow ? "52vw" : 420 }} title={hint}>{hint}</span>
    </div>
  );
}
