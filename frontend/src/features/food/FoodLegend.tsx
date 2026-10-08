import type { FoodBubblesResponse } from "../../lib/apiClient";
import { NO_DATA_COLOR, OVERLAY_Z_INDEX, REB_ZONE_COLOR, SALES_FLAT_PCT, SEQ_HIGH_CSS, SEQ_LOW_CSS, TREND_COLORS } from "../../lib/vizConfig";

/** 외식 지도 범례 — 버블 크기·색 의미와 기준 분기·출처. 지도와 같은 vizConfig 값을 쓴다. */
export function FoodLegend({ data, showStores, rebZonesVisible }: { data: FoodBubblesResponse | undefined; showStores: boolean; rebZonesVisible: boolean }) {
  return (
    <div
      style={{
        position: "absolute", zIndex: OVERLAY_Z_INDEX, bottom: 16, right: 16, background: "rgba(255,255,255,0.94)",
        borderRadius: 8, padding: "10px 14px", boxShadow: "0 2px 8px rgba(0,0,0,0.15)", fontSize: 12, lineHeight: 1.6, maxWidth: 260,
      }}
    >
      {showStores ? (
        <Dot color="#F97316" label="외식 매장 (점을 누르면 매장 상세)" />
      ) : (
        data && (
          <>
            <div style={{ fontWeight: 600 }}>{data.label}</div>
            {data.kind === "growth" ? (
              <>
                <Dot color={TREND_COLORS.up} label={`상승 (+${SALES_FLAT_PCT}% 이상)`} />
                <Dot color={TREND_COLORS.down} label={`하강 (-${SALES_FLAT_PCT}% 이하)`} />
                <Dot color={TREND_COLORS.flat} label={`보합 (±${SALES_FLAT_PCT}% 미만)`} />
              </>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                낮음 <span style={{ width: 70, height: 8, borderRadius: 4, background: `linear-gradient(to right, ${SEQ_LOW_CSS}, ${SEQ_HIGH_CSS})` }} /> 높음
              </div>
            )}
            <Dot color={NO_DATA_COLOR} label="자료 없음 (0 아님)" />
            <div style={{ color: "#6B7280" }}>원 크기 = 점포 수 · {data.quarter.slice(0, 4)}년 {data.quarter[4]}분기</div>
            <div style={{ color: "#9CA3AF", fontSize: 11 }}>점포 수 출처: {data.size_source}</div>
          </>
        )
      )}
      {rebZonesVisible && <Dot color={REB_ZONE_COLOR} label="R-ONE 임대동향 상권" />}
    </div>
  );
}

function Dot({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: 11, height: 11, borderRadius: "50%", background: color, flexShrink: 0 }} />
      {label}
    </div>
  );
}
