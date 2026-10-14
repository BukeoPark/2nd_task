import { OVERLAY_Z_INDEX } from "../../lib/vizConfig";

interface MapLayerToolbarProps {
  anchorsOn: boolean;
  /** 스세권·다세권 지표를 보는 동안은 매장 위치를 끌 수 없다 */
  anchorsForced: boolean;
  onAnchorsChange: (on: boolean) => void;
  rebOn: boolean;
  onRebChange: (on: boolean) => void;
}

/** 지도 오른쪽 레이어 도구 묶음 — 지도 위에 얹는 표시(앵커 마커·임대료)를 켜고 끈다. 상단바에는 업종·지표 선택만 둔다. */
export function MapLayerToolbar({ anchorsOn, anchorsForced, onAnchorsChange, rebOn, onRebChange }: MapLayerToolbarProps) {
  return (
    <div
      role="group"
      aria-label="지도 레이어"
      style={{
        position: "absolute", zIndex: OVERLAY_Z_INDEX, top: 200, right: 16, width: 160, background: "rgba(255,255,255,0.96)", borderRadius: 8,
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)", overflow: "hidden", fontSize: 12,
      }}
    >
      <div style={{ padding: "5px 10px", color: "#4B5563", fontWeight: 600, borderBottom: "1px solid #E5E7EB" }}>지도 레이어</div>
      <LayerButton
        label="스타벅스·다이소"
        on={anchorsOn}
        locked={anchorsForced}
        title={anchorsForced ? "스세권·다세권 지표를 보는 동안은 매장 위치를 항상 표시합니다" : "스타벅스·다이소 매장 위치 표시"}
        onToggle={() => onAnchorsChange(!anchorsOn)}
      />
      <LayerButton label="임대료(R-ONE)" on={rebOn} locked={false} title="R-ONE 임대동향 상권 표시" onToggle={() => onRebChange(!rebOn)} />
    </div>
  );
}

function LayerButton({ label, on, locked, title, onToggle }: { label: string; on: boolean; locked: boolean; title: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-disabled={locked}
      title={title}
      onClick={() => { if (!locked) onToggle(); }}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, width: "100%", padding: "8px 10px", border: "none", borderTop: "1px solid #F3F4F6",
        background: on ? "#EFF6FF" : "transparent", color: on ? "#1D4ED8" : "#374151", fontWeight: on ? 700 : 500, fontSize: 12, textAlign: "left", whiteSpace: "nowrap",
        cursor: locked ? "default" : "pointer",
      }}
    >
      <span>{label}</span>
      <span aria-hidden="true" style={{ fontSize: 11 }}>{on ? "켜짐" : "꺼짐"}</span>
    </button>
  );
}
