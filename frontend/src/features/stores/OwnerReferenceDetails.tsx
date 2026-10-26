import { Notice } from "../../components/Notice";
import { ActionButton, Caption, StatRow } from "../../components/PanelKit";
import { PK } from "../../lib/panelStyle";
import { FS } from "../../lib/typography";
import { useNearbyAnalysis, useLocationInfluence } from "./useStores";
import { StoreTransitVisuals, StoreFacilityVisuals } from "./StoreEnvironmentVisuals";
import { RadiusBasisSection, StoreBrandCards } from "./LocationInfluenceSection";

const cell = { padding: "8px 6px", borderBottom: `1px solid ${PK.faint}`, textAlign: "right", fontWeight: 400 } as const;
const checkLabel = { display: "flex", alignItems: "center", gap: 6, fontSize: FS.caption, color: PK.sub, marginTop: 8, cursor: "pointer" } as const;

/** 자영업자 '주변 경쟁'의 연도별 개폐업 — 접힘 안에서 상권 보고서와 같은 값 행·보조 줄 조각으로 보인다. */
export function OwnerChurnDetails({ storeId, radius }: { storeId: string; radius: number }) {
  const q = useNearbyAnalysis(storeId, radius);
  if (q.isPending) return <Caption>불러오는 중…</Caption>;
  if (q.isError) return <Notice tone="error">개폐업 자료를 불러오지 못했어요. <ActionButton variant="ghost" onClick={() => void q.refetch()}>다시 시도</ActionButton></Notice>;
  const d = q.data;
  if (!d || d.status !== "ok") return <Caption>개폐업 자료 없음</Caption>;
  const trend = (d.trend ?? []).slice(-5);
  const c = d.competitors;
  return <div>
    <Caption>반경 {radius}m · {d.scope?.license_names.join("·") ?? "동일 업종"} · 인허가 {d.as_of ?? "기준일 미제공"}</Caption>
    <StatRow label="인허가상 영업" value={d.active_count == null ? "자료 없음" : `${d.active_count}건`} missing={d.active_count == null} />
    {trend.length > 0 && <table style={{ width: "100%", borderCollapse: "collapse", fontVariantNumeric: "tabular-nums", fontSize: FS.body, margin: "8px 0" }}>
      <thead><tr><th style={{ ...cell, textAlign: "left" }}>연도</th><th style={cell}>개업</th><th style={cell}>폐업</th></tr></thead>
      <tbody>{trend.map(t => <tr key={t.year}><th scope="row" style={{ ...cell, textAlign: "left" }}>{t.year}{t.partial_year ? " (진행 중)" : ""}</th><td style={cell}>{t.opened}건</td><td style={cell}>{t.closed == null ? "자료 없음" : `${t.closed}건`}</td></tr>)}</tbody>
    </table>}
    {d.closure_cohort?.status === "ok" && d.closure_cohort.rate != null && <StatRow label={`과거 ${d.closure_cohort.horizon_years}년 이내 폐업`} value={`${(d.closure_cohort.rate * 100).toFixed(1)}% (${d.closure_cohort.numerator}/${d.closure_cohort.denominator})`} />}
    <Caption>인허가는 등록 건수로, 상가정보의 매장 수와 집계가 달라요.</Caption>
    {c && <Caption>상가정보 {c.as_of.store_info ?? "기준일 미제공"} · 폐업 기록 확인 {c.excluded_closed_count ?? "미확인"}곳 · 영업 여부 미확인 {c.unconfirmed_count}곳</Caption>}
    <Caption>출처: {d.source?.title ?? "인허가 정보"}</Caption>
  </div>;
}

/** 자영업자 '주변 경쟁'의 교통·시설·근처 브랜드 — 매장 상세 '주변 환경'과 같은 순서(교통 → 집객시설 → 근처 브랜드). */
export function OwnerLocationDetails({ storeId, radius, showFacilities, onShowFacilitiesChange, showExits, onShowExitsChange }: {
  storeId: string; radius: number; showFacilities: boolean; onShowFacilitiesChange: (v: boolean) => void;
  showExits: boolean; onShowExitsChange: (v: boolean) => void;
}) {
  const q = useLocationInfluence(storeId, radius);
  if (q.isPending || q.isPlaceholderData) return <Caption>불러오는 중…</Caption>;
  if (q.isError) return <Notice tone="error">교통·시설 자료를 불러오지 못했어요. <ActionButton variant="ghost" onClick={() => void q.refetch()}>다시 시도</ActionButton></Notice>;
  if (!q.data) return null;
  const { rail, bus, facilities } = q.data.radius_metrics;
  return <div>
    <StoreTransitVisuals rail={rail} bus={bus}/>
    <StoreFacilityVisuals facilities={facilities}/>
    <StoreBrandCards data={q.data}/>
    {facilities?.status === "ok" && <label style={checkLabel}><input type="checkbox" checked={showFacilities} onChange={e => onShowFacilitiesChange(e.target.checked)}/>지도에 시설 표시</label>}
    {rail?.status === "ok" && rail.entrance_data?.enabled && <label style={checkLabel}><input type="checkbox" checked={showExits} onChange={e => onShowExitsChange(e.target.checked)}/>지도에 지하철 출입구 표시</label>}
    <RadiusBasisSection storeId={storeId} radius={radius}/>
  </div>;
}
