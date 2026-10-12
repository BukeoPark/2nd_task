import type { CompareBasis } from "../../lib/compareBasis";
import { PEER_RING_COLOR, SELECTED_RING_COLOR, STORE_POINT_COLOR } from "../../lib/vizConfig";

/** 비교 기준 — 어떤 단위·업종과 견준 숫자인지와, 지도에서 무엇이 강조되는지(점 모양 범례 포함). */
export function CompareBasisBox({ basis, quarter, showLegend }: { basis: CompareBasis; quarter?: string; showLegend: boolean }) {
  return (
    <div style={{ background: "#F9FAFB", borderRadius: 8, padding: "8px 10px", marginTop: 10, fontSize: 12, color: "#374151", lineHeight: 1.6 }}>
      <strong>비교 기준</strong>
      {quarter && <span style={{ color: "#6B7280" }}> · {quarter}</span>}
      <div>
        비교 단위: <strong>{basis.unit}</strong>
      </div>
      <div style={{ color: "#6B7280" }}>{basis.why}</div>
      <div>비교 업종: {basis.category}</div>
      {basis.map && <div style={{ color: "#6B7280", marginTop: 2 }}>{basis.map}</div>}
      {showLegend && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 12px", marginTop: 4, color: "#374151" }}>
          <Swatch ring={SELECTED_RING_COLOR} label="선택한 매장" />
          <Swatch ring={PEER_RING_COLOR} label="같은 단위·업종 매장" />
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span aria-hidden="true" style={{ width: 16, height: 10, border: `2px solid ${PEER_RING_COLOR}`, background: "rgba(29,78,216,0.08)", borderRadius: 2 }} />
            비교 단위 경계
          </span>
        </div>
      )}
    </div>
  );
}

function Swatch({ ring, label }: { ring: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span aria-hidden="true" style={{ boxSizing: "border-box", width: 14, height: 14, borderRadius: "50%", background: STORE_POINT_COLOR, border: "2px solid white", boxShadow: `0 0 0 2px ${ring}` }} />
      {label}
    </span>
  );
}
