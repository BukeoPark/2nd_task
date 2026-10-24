import { useNearbyAnalysis, useLocationInfluence } from "./useStores";
import { StoreTransitVisuals, StoreFacilityVisuals } from "./StoreEnvironmentVisuals";
import { RadiusBasisSection, StoreBrandCards } from "./LocationInfluenceSection";

export function OwnerChurnDetails({ storeId, radius }: { storeId: string; radius: number }) {
  const q = useNearbyAnalysis(storeId, radius);
  if (q.isPending) return <p className="owner-caption">불러오는 중…</p>;
  if (q.isError) return <p role="alert">개폐업 자료를 불러오지 못했어요. <button onClick={() => void q.refetch()}>다시 시도</button></p>;
  const d = q.data;
  if (!d || d.status !== "ok") return <p className="owner-caption">개폐업 자료 없음</p>;
  const trend = (d.trend ?? []).slice(-5);
  const c = d.competitors;
  return <div className="owner-reference">
    <p className="owner-caption">반경 {radius}m · {d.scope?.license_names.join("·") ?? "동일 업종"} · 인허가 {d.as_of ?? "기준일 미제공"}</p>
    <div className="owner-time-row"><span>인허가상 영업</span><b>{d.active_count == null ? "자료 없음" : `${d.active_count}건`}</b></div>
    {trend.length > 0 && <table className="owner-compact-table"><thead><tr><th>연도</th><th>개업</th><th>폐업</th></tr></thead><tbody>{trend.map(t => <tr key={t.year}><th scope="row">{t.year}{t.partial_year ? " (진행 중)" : ""}</th><td>{t.opened}건</td><td>{t.closed == null ? "자료 없음" : `${t.closed}건`}</td></tr>)}</tbody></table>}
    {d.closure_cohort?.status === "ok" && d.closure_cohort.rate != null && <div className="owner-time-row"><span>과거 {d.closure_cohort.horizon_years}년 이내 폐업</span><b>{(d.closure_cohort.rate * 100).toFixed(1)}% ({d.closure_cohort.numerator}/{d.closure_cohort.denominator})</b></div>}
    <p className="owner-caption">인허가는 등록 건수로, 위 상가정보의 매장 수와 집계가 달라요.</p>
    {c && <p className="owner-caption">상가정보 {c.as_of.store_info ?? "기준일 미제공"} · 폐업 기록 확인 {c.excluded_closed_count ?? "미확인"}곳 · 영업 여부 미확인 {c.unconfirmed_count}곳</p>}
    <small className="owner-caption">출처: {d.source?.title ?? "인허가 정보"}</small>
  </div>;
}

export function OwnerLocationDetails({ storeId, radius, showFacilities, onShowFacilitiesChange, showExits, onShowExitsChange }: {
  storeId: string; radius: number; showFacilities: boolean; onShowFacilitiesChange: (v: boolean) => void;
  showExits: boolean; onShowExitsChange: (v: boolean) => void;
}) {
  const q = useLocationInfluence(storeId, radius);
  if (q.isPending || q.isPlaceholderData) return <p className="owner-caption">불러오는 중…</p>;
  if (q.isError) return <p role="alert">교통·시설 자료를 불러오지 못했어요. <button onClick={() => void q.refetch()}>다시 시도</button></p>;
  if (!q.data) return null;
  const { rail, bus, facilities } = q.data.radius_metrics;
  return <div className="owner-reference">
    <StoreBrandCards data={q.data}/>
    <StoreTransitVisuals rail={rail} bus={bus}/>
    <StoreFacilityVisuals facilities={facilities}/>
    {facilities?.status === "ok" && <label className="owner-map-toggle"><input type="checkbox" checked={showFacilities} onChange={e => onShowFacilitiesChange(e.target.checked)}/>지도에 시설 표시</label>}
    {rail?.status === "ok" && rail.entrance_data?.enabled && <label className="owner-map-toggle"><input type="checkbox" checked={showExits} onChange={e => onShowExitsChange(e.target.checked)}/>지도에 지하철 출입구 표시</label>}
    <RadiusBasisSection storeId={storeId} radius={radius}/>
  </div>;
}
