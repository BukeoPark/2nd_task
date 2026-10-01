import { OVERLAY_Z_INDEX, REB_ZONE_COLOR, SALES_FLAT_PCT, TREND_COLORS, ZONE_COLORS } from "../../lib/vizConfig";
import type { ViewMode } from "./types";

interface LegendProps {
  viewMode: ViewMode;
  rebZonesVisible: boolean;
}

/** 지도와 항상 같은 값(vizConfig)을 참조하는 반투명 범례. 현재 보기 모드에 맞는 항목만 보여준다. */
export function Legend({ viewMode, rebZonesVisible }: LegendProps) {
  return (
    <div
      style={{
        position: "absolute",
        zIndex: OVERLAY_Z_INDEX,
        bottom: 16,
        right: 16,
        background: "rgba(255,255,255,0.92)",
        borderRadius: 8,
        padding: "10px 14px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        fontSize: 13,
        lineHeight: 1.6,
      }}
    >
      {viewMode === "stores" ? (
        <>
          <LegendDot color={ZONE_COLORS.starbucks} label="스세권 (스타벅스 250m 이내)" />
          <LegendDot color={ZONE_COLORS.daiso} label="다세권 (다이소 250m 이내)" />
          <LegendDot color={ZONE_COLORS.base} label="그 외 — 원 크기 = 점포수" />
        </>
      ) : (
        <>
          <div style={{ fontSize: 11, color: "#6B7280" }}>전년 동기 대비 추정매출(업종 합계)</div>
          <LegendDot color={TREND_COLORS.up} label={`상승 (+${SALES_FLAT_PCT}% 이상)`} />
          <LegendDot color={TREND_COLORS.down} label={`하강 (-${SALES_FLAT_PCT}% 이하)`} />
          <LegendDot color={TREND_COLORS.flat} label={`보합 (±${SALES_FLAT_PCT}% 미만)`} />
        </>
      )}
      {rebZonesVisible && <LegendDot color={REB_ZONE_COLOR} label="R-ONE 임대동향 상권 (크기 = 임대료)" />}
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: 12, height: 12, borderRadius: "50%", background: color, opacity: 0.7, flexShrink: 0 }} />
      {label}
    </div>
  );
}
