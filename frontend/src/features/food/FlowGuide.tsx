import { FLOW_STEPS, flowStatus, type FlowInput } from "../../lib/flow";
import { OVERLAY_Z_INDEX } from "../../lib/vizConfig";

/** 기본 이용 흐름(검색 → 위치 선택 → 업종 선택 → 후보 지역 비교)에서 지금 어느 단계인지와 다음 행동. */
export function FlowGuide(props: FlowInput) {
  const { current, done, hint } = flowStatus(props);
  return (
    <div
      aria-label="이용 순서"
      style={{
        position: "absolute", zIndex: OVERLAY_Z_INDEX, top: 62, left: "50%", transform: "translateX(-50%)", background: "rgba(255,255,255,0.96)",
        borderRadius: 999, padding: "5px 14px", boxShadow: "0 2px 8px rgba(0,0,0,0.15)", fontSize: 12, display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap",
      }}
    >
      {FLOW_STEPS.map((s, i) => (
        <span key={s} style={{ display: "flex", alignItems: "center", gap: 4, color: i === current ? "#1D4ED8" : done[i] ? "#059669" : "#9CA3AF", fontWeight: i === current ? 700 : 400 }}>
          <span
            style={{
              width: 16, height: 16, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "white",
              background: i === current ? "#1D4ED8" : done[i] ? "#059669" : "#D1D5DB",
            }}
          >
            {done[i] && i !== current ? "✓" : i + 1}
          </span>
          {s}
          {i < FLOW_STEPS.length - 1 && <span style={{ color: "#D1D5DB" }}>›</span>}
        </span>
      ))}
      <span style={{ color: "#6B7280", borderLeft: "1px solid #E5E7EB", paddingLeft: 8 }}>{hint}</span>
    </div>
  );
}
