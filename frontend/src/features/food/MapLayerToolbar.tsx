import { InfoTip } from "../../components/InfoTip";
import type { FoodHeatResponse } from "../../lib/apiClient";
import { HEAT_CSS_GRADIENT, HEAT_METRICS, heatLegendText, type HeatMetric } from "../../lib/heatmap";
import { OVERLAY_Z_INDEX } from "../../lib/vizConfig";

interface MapLayerToolbarProps {
  anchorsOn: boolean;
  /** 스세권·다세권 지표를 보는 동안은 매장 위치를 끌 수 없다 */
  anchorsForced: boolean;
  onAnchorsChange: (on: boolean) => void;
  rebOn: boolean;
  onRebChange: (on: boolean) => void;
  /** 인구 히트맵 — 고른 지표(없으면 꺼짐)와 그 자료 */
  heat: { metric: HeatMetric | null; onChange: (m: HeatMetric | null) => void; data: FoodHeatResponse | undefined; loading: boolean; failed: boolean };
}

/** 지도 오른쪽 레이어 도구 묶음 — 지도 위에 얹는 표시(앵커 마커·임대료)를 켜고 끈다. 상단바에는 업종·지표 선택만 둔다. */
export function MapLayerToolbar({ anchorsOn, anchorsForced, onAnchorsChange, rebOn, onRebChange, heat }: MapLayerToolbarProps) {
  return (
    <div
      role="group"
      data-tour="layers"
      aria-label="지도 레이어"
      style={{
        position: "absolute", zIndex: OVERLAY_Z_INDEX, top: 200, right: 16, width: 160, background: "rgba(255,255,255,0.96)", borderRadius: 8,
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)", overflow: "hidden", fontSize: 13,
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
      <HeatControls heat={heat} />
    </div>
  );
}

/** 인구 히트맵 선택 — 끔 / 유동인구 / 인구밀도 / 직장인구. 켜면 색 범례와 기준(출처·분기·한계)이 함께 나온다. */
function HeatControls({ heat }: { heat: MapLayerToolbarProps["heat"] }) {
  const d = heat.data;
  return (
    <div data-tour="heat" style={{ borderTop: "1px solid #F3F4F6", padding: "8px 10px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontWeight: 600, color: "#374151" }}>인구 히트맵</span>
        {d && heat.metric && (
          <InfoTip label="히트맵 기준 보기">
            <b>{d.label}</b> · {d.quarter.slice(0, 4)}년 {d.quarter.slice(4)}분기<br />
            {d.basis}<br />
            <b>출처</b> {d.source}<br />
            {d.caveats.map((c) => (<span key={c} style={{ display: "block", marginTop: 3 }}>· {c}</span>))}
            {d.missing > 0 && <span style={{ display: "block", marginTop: 3 }}>· 값이 없는 상권 {d.missing}곳은 표시하지 않았습니다.</span>}
          </InfoTip>
        )}
      </div>
      <div role="radiogroup" aria-label="인구 히트맵 지표" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
        {[{ value: null, label: "끔" }, ...HEAT_METRICS].map((o) => {
          const on = heat.metric === o.value;
          return (
            <button
              key={String(o.value)}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => heat.onChange(o.value)}
              style={{ padding: "5px 4px", border: `1px solid ${on ? "#1D4ED8" : "#E5E7EB"}`, borderRadius: 6, background: on ? "#EFF6FF" : "white", color: on ? "#1D4ED8" : "#374151", fontSize: 11.5, fontWeight: on ? 700 : 500, cursor: "pointer" }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {heat.metric && (
        <div style={{ marginTop: 8 }}>
          <div aria-hidden="true" style={{ height: 8, borderRadius: 4, background: HEAT_CSS_GRADIENT }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6B7280", marginTop: 2 }}><span>낮음</span><span>높음</span></div>
          {heat.loading && <div role="status" style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>불러오는 중...</div>}
          {heat.failed && <div role="alert" style={{ fontSize: 12, color: "#B91C1C", marginTop: 2 }}>조회 실패 — 다시 선택해 주세요.</div>}
          {d && <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2, lineHeight: 1.4 }}>상권 단위 · {heatLegendText(d.unit, d.scale.p95)}</div>}
        </div>
      )}
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
        background: on ? "#EFF6FF" : "transparent", color: on ? "#1D4ED8" : "#374151", fontWeight: on ? 700 : 500, fontSize: 13, textAlign: "left", whiteSpace: "nowrap",
        cursor: locked ? "default" : "pointer",
      }}
    >
      <span>{label}</span>
      <span aria-hidden="true" style={{ fontSize: 12.5 }}>{on ? "켜짐" : "꺼짐"}</span>
    </button>
  );
}
