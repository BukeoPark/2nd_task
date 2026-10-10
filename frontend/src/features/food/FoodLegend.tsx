import type { FoodAnchorsResponse, FoodBubblesResponse } from "../../lib/apiClient";
import { scopeLine } from "../../lib/foodText";
import { ANCHOR_MARK, NO_DATA_COLOR, STORE_POINT_COLOR, ZONE_COLORS, REB_ZONE_COLOR, SALES_FLAT_PCT, SEQ_HIGH_CSS, SEQ_LOW_CSS, TREND_COLORS } from "../../lib/vizConfig";

/** 외식 지도 범례 — 버블 크기·색 의미와 기준 분기·출처. 지도와 같은 vizConfig 값을 쓴다. */
export function FoodLegend({ data, showStores, rebZonesVisible, anchors, stale = false, rebQuarter = null }: {
  data: FoodBubblesResponse | undefined;
  showStores: boolean;
  rebZonesVisible: boolean;
  anchors?: FoodAnchorsResponse;
  /** 새 조건의 결과를 기다리는 중 — 범례는 이전 조건의 것 */
  stale?: boolean;
  /** R-ONE 임대동향의 실제 기준 분기('2026년 2분기') */
  rebQuarter?: string | null;
}) {
  return (
    <div style={{ opacity: stale ? 0.55 : 1 }}>
      {stale && !showStores && <div style={{ color: "#B45309", fontWeight: 600 }}>새 조건을 불러오는 중 — 아래는 이전 조건의 범례</div>}
      {showStores ? (
        <Dot color={STORE_POINT_COLOR} label="외식 매장 (점을 누르면 매장 상세)" />
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
            {data.metric === "stores_volatility" && (
              <div style={{ color: "#6B7280", fontSize: 11 }}>분기마다 점포 수가 평균 몇 % 바뀌었는지(높을수록 들쭉날쭉). 평균 10곳 미만은 자료 없음</div>
            )}
            <div style={{ color: "#6B7280" }}>원 크기 = 점포 수</div>
            <div style={{ borderTop: "1px solid #E5E7EB", marginTop: 4, paddingTop: 4 }}>
              <div style={{ fontWeight: 600, color: "#374151" }}>업종 범위</div>
              <div>{scopeLine("점포 수", `${data.scope.stores_label} 기준`)}</div>
              {data.metric !== "stores" && <div>{scopeLine(data.label, data.scope.metric_scope)}</div>}
              {data.scope.notice && (
                <div style={{ background: "#FFFBEB", color: "#92400E", borderRadius: 6, padding: "4px 6px", fontSize: 11, marginTop: 2 }}>{data.scope.notice}</div>
              )}
            </div>
            <div style={{ color: "#6B7280", fontSize: 11 }}>계산: {data.basis}</div>
            <div style={{ color: "#6B7280", fontSize: 11 }}>점포 수 출처: {data.size_source}</div>
            {data.metric_source && (
              <div style={{ color: "#6B7280", fontSize: 11 }}>
                {data.label} 출처: {data.metric_source} · {data.as_of}
              </div>
            )}
          </>
        )
      )}
      {anchors && (
        <>
          <Mark brand="starbucks" label={`스타벅스 (${anchors.stores.filter((s) => s.brand === "starbucks").length}곳)`} />
          <Mark brand="daiso" label={`다이소 (${anchors.stores.filter((s) => s.brand === "daiso").length}곳)`} />
          <div style={{ color: "#6B7280", fontSize: 11 }}>확대하면 도보권 {anchors.walk_m}m 원 표시. {anchors.note}</div>
        </>
      )}
      {rebZonesVisible && <Dot color={REB_ZONE_COLOR} label={`R-ONE 임대동향 상권 (${rebQuarter ?? "기준 분기 기록 없음"})`} />}
    </div>
  );
}

/** 스타벅스·다이소 — 지도 마커(AnchorLayer)와 같은 글자 든 네모. 빨간 동그라미인 '상승'과 헷갈리지 않게 모양을 다르게 한다. */
function Mark({ brand, label }: { brand: "starbucks" | "daiso"; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span
        aria-hidden="true"
        style={{
          width: 16, height: 16, borderRadius: 4, background: ZONE_COLORS[brand], color: "white", fontSize: 10, fontWeight: 700, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center", border: "1.5px solid white", boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
        }}
      >
        {ANCHOR_MARK[brand]}
      </span>
      {label}
    </div>
  );
}

function Dot({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span aria-hidden="true" style={{ width: 11, height: 11, borderRadius: "50%", background: color, flexShrink: 0 }} />
      {label}
    </div>
  );
}
