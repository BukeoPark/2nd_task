import type { FoodAnchorsResponse, FoodBubblesResponse } from "../../lib/apiClient";
import { InfoTip } from "../../components/InfoTip";
import { scopeLine } from "../../lib/foodText";
import { LEGEND_GLYPHS } from "../../lib/storeGlyph";
import { ANCHOR_MARK, NO_DATA_COLOR, PEER_RING_COLOR, SELECTED_RING_COLOR, STORE_POINT_COLOR, ZONE_COLORS, REB_ZONE_COLOR, SALES_FLAT_PCT, SEQ_HIGH_CSS, SEQ_LOW_CSS, TREND_COLORS } from "../../lib/vizConfig";

/** 외식 지도 범례 — 버블 크기·색 의미와 기준 분기·출처. 지도와 같은 vizConfig 값을 쓴다. */
export function FoodLegend({ data, showStores, rebZonesVisible, anchors, stale = false, rebQuarter = null, storeRoles = null }: {
  data: FoodBubblesResponse | undefined;
  showStores: boolean;
  rebZonesVisible: boolean;
  anchors?: FoodAnchorsResponse;
  /** 새 조건의 결과를 기다리는 중 — 범례는 이전 조건의 것 */
  stale?: boolean;
  /** R-ONE 임대동향의 실제 기준 분기('2026년 2분기') */
  rebQuarter?: string | null;
  /** 매장 상세를 보는 중이면 지도 점의 역할(선택·경쟁·그 외)과 경계 표현을 설명한다 — 지도와 같은 vizConfig 값 */
  storeRoles?: { peers: boolean; boundary: boolean; emphasized: boolean } | null;
}) {
  return (
    <div style={{ opacity: stale ? 0.55 : 1 }}>
      {stale && !showStores && <div style={{ color: "#B45309", fontWeight: 600 }}>새 조건을 불러오는 중 — 아래는 이전 조건의 범례</div>}
      {showStores ? (
        <>
          <div style={{ color: "#374151" }}>외식 매장 — 점을 누르면 매장 상세</div>
          <div aria-label="업종별 점 모양" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 8px", marginTop: 4 }}>
            {LEGEND_GLYPHS.map((g) => (
              <span key={g.label} style={{ display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
                <span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: "50%", background: "white", border: `1.5px solid ${STORE_POINT_COLOR}`, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, lineHeight: 1 }}>{g.glyph}</span>
                {g.label}
              </span>
            ))}
          </div>
          {storeRoles && <StoreRoleLegend roles={storeRoles} />}
        </>
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
              <div style={{ color: "#6B7280", fontSize: 12.5 }}>분기마다 점포 수가 평균 몇 % 바뀌었는지(높을수록 들쭉날쭉). 평균 10곳 미만은 자료 없음</div>
            )}
            <div style={{ color: "#6B7280" }}>원 크기 = 점포 수</div>
            <div style={{ borderTop: "1px solid #E5E7EB", marginTop: 4, paddingTop: 4 }}>
              <div style={{ fontWeight: 600, color: "#374151" }}>업종 범위</div>
              <div>{scopeLine("점포 수", `${data.scope.stores_label} 기준`)}</div>
              {data.metric !== "stores" && <div>{scopeLine(data.label, data.scope.metric_scope)}</div>}
              {data.scope.notice && (
                <div style={{ background: "#FFFBEB", color: "#92400E", borderRadius: 6, padding: "4px 6px", fontSize: 12.5, marginTop: 2 }}>{data.scope.notice}</div>
              )}
            </div>
            <div style={{ color: "#6B7280", fontSize: 12.5 }}>계산: {data.basis}</div>
            <div style={{ color: "#6B7280", fontSize: 12.5 }}>
              출처 <InfoTip label="출처 보기">
                <b>점포 수</b> {data.size_source}
                {data.metric_source && <><br /><b>{data.label}</b> {data.metric_source} · {data.as_of}</>}
              </InfoTip>
            </div>
          </>
        )
      )}
      {anchors && (
        <>
          <Mark brand="starbucks" label={`스타벅스 (${anchors.stores.filter((s) => s.brand === "starbucks").length}곳)`} />
          <Mark brand="daiso" label={`다이소 (${anchors.stores.filter((s) => s.brand === "daiso").length}곳)`} />
          <div style={{ color: "#6B7280", fontSize: 12.5 }}>확대하면 도보권 {anchors.walk_m}m 원 표시. {anchors.note}</div>
        </>
      )}
      {rebZonesVisible && <Dot color={REB_ZONE_COLOR} label={`R-ONE 임대동향 상권 (${rebQuarter ?? "기준 분기 기록 없음"})`} />}
    </div>
  );
}

/** 선택한 매장 주변의 점 표현 — 지도의 SelectedStoreMarker·경쟁 매장 링·비교 단위 경계와 같은 색·모양. */
function StoreRoleLegend({ roles }: { roles: { peers: boolean; boundary: boolean; emphasized: boolean } }) {
  const dot = (size: number, ring: string | null, ringW: number, opacity = 1) => (
    <span aria-hidden="true" style={{ width: size, height: size, borderRadius: "50%", background: "white", border: `1.5px solid ${STORE_POINT_COLOR}`, boxShadow: ring ? `0 0 0 ${ringW}px ${ring}` : "none", opacity, flexShrink: 0, display: "inline-block", margin: ringW }} />
  );
  return (
    <div aria-label="선택한 매장 표시" style={{ borderTop: "1px solid #E5E7EB", marginTop: 6, paddingTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
      <div style={{ fontWeight: 600, color: "#374151" }}>선택한 매장 주변</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>{dot(16, SELECTED_RING_COLOR, 4)} 선택한 매장 — 굵은 검은 링 + 이름표</div>
      {roles.peers ? (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>{dot(14, PEER_RING_COLOR, roles.emphasized ? 3 : 1, roles.emphasized ? 1 : 0.8)} 같은 상권·같은 업종 경쟁 매장 — 파란 링{roles.emphasized ? "" : " (연하게, '주변' 메뉴에서 진하게)"}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>{dot(11, null, 0, 0.3)} 그 외 매장 — 흐리게</div>
        </>
      ) : (
        <div style={{ color: "#6B7280", fontSize: 12.5 }}>경쟁 매장 표시는 비교 대상을 불러오는 중이거나 없습니다.</div>
      )}
      {roles.boundary && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span aria-hidden="true" style={{ width: 16, height: 10, border: `${roles.emphasized ? 3 : 2}px solid ${PEER_RING_COLOR}`, opacity: roles.emphasized ? 0.9 : 0.4, borderRadius: 3, flexShrink: 0 }} /> 비교 단위(상권·행정동) 경계
        </div>
      )}
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
          width: 16, height: 16, borderRadius: 4, background: ZONE_COLORS[brand], color: "white", fontSize: 12, fontWeight: 700, flexShrink: 0,
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
