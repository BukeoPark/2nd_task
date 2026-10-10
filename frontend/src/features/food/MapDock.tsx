import { useState, type ReactNode } from "react";
import { OVERLAY_Z_INDEX } from "../../lib/vizConfig";

type Tab = "legend" | "ranking";

/** 지도 오른쪽 아래 독 — '범례'와 '순위표'를 탭으로 묶고, 탭을 한 번 더 누르면 접는다.
 * 범례가 지도를 가리던 것을 접어 둘 수 있고, 좁은 화면에서는 접힌 채로 시작한다. */
export function MapDock({ legend, ranking }: { legend: ReactNode; ranking: ReactNode }) {
  const [tab, setTab] = useState<Tab | null>(() => (typeof window !== "undefined" && window.matchMedia("(max-width: 720px)").matches ? null : "legend"));
  const toggle = (t: Tab) => setTab((cur) => (cur === t ? null : t));
  const btn = (t: Tab, label: string) => (
    <button
      type="button"
      role="tab"
      id={`dock-tab-${t}`}
      aria-selected={tab === t}
      aria-controls="dock-panel"
      onClick={() => toggle(t)}
      style={{
        flex: 1, padding: "7px 10px", border: "none", cursor: "pointer", fontSize: 13, fontWeight: tab === t ? 700 : 500,
        background: tab === t ? "#EFF6FF" : "transparent", color: tab === t ? "#1D4ED8" : "#374151",
        borderBottom: tab === t ? "2px solid #1D4ED8" : "2px solid transparent",
      }}
    >
      {label} {tab === t ? "▾" : "▸"}
    </button>
  );
  return (
    <div
      style={{
        position: "absolute", zIndex: OVERLAY_Z_INDEX, bottom: 16, right: 16, width: "min(310px, calc(100vw - 32px))",
        background: "rgba(255,255,255,0.96)", borderRadius: 8, boxShadow: "0 2px 8px rgba(0,0,0,0.15)", overflow: "hidden",
      }}
    >
      <div role="tablist" aria-label="지도 보조 정보" style={{ display: "flex" }}>
        {btn("legend", "범례")}
        {btn("ranking", "순위표")}
      </div>
      {tab && (
        <div
          id="dock-panel"
          role="tabpanel"
          aria-labelledby={`dock-tab-${tab}`}
          style={{ padding: "8px 14px 10px", maxHeight: "calc(100vh - 220px)", overflowY: "auto", fontSize: 12, lineHeight: 1.6 }}
        >
          {tab === "legend" ? legend : ranking}
        </div>
      )}
    </div>
  );
}
