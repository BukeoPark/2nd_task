import { AppIcon, type AppIconName } from "../../components/DataVisuals";
import { useNearbyAnalysis, useLocationInfluence } from "./useStores";
import { facilityCountText, facilityReferenceText } from "../../lib/facilityText";
import { busCountText, busUsageLines } from "../../lib/busText";
import { railCountText, railUsageLines } from "../../lib/railText";
import { formatDistance } from "../../lib/format";

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
  const r = rail?.status === "ok" ? rail : null;
  const b = bus.status === "ok" ? bus : null;
  const f = facilities?.status === "ok" ? facilities : null;
  const rows = [
    ["지하철역", r ? railCountText(r.selected) : "자료 없음"],
    ["가장 가까운 역", r?.nearest_station ? `${r.nearest_station.name} · ${formatDistance(r.nearest_station.distance_m)}` : "자료 없음"],
    ["버스정류장", b ? busCountText(b.selected) : "자료 없음"],
  ];
  return <div className="owner-reference">
    <p className="owner-caption">반경 {radius}m · 직선거리</p>
    {rows.map(([label, value]) => <div className="owner-time-row" key={label}><span className="data-heading"><AppIcon name={label.includes("버스") ? "bus" : "train"} />{label}</span><b>{value}</b></div>)}
    <h3 className="data-heading"><AppIcon name="users" />하루 평균 교통 이용량</h3>
    <table className="owner-compact-table"><thead><tr><th>교통수단·기간</th><th>승차</th><th>하차</th></tr></thead><tbody>
      {r && <tr><th scope="row">지하철 · {r.usage_basis.year ?? "기간 미제공"}</th><td>{railUsageLines(r.selected).boardings}</td><td>{railUsageLines(r.selected).alightings}</td></tr>}
      {b && <tr><th scope="row">버스 · {b.usage_basis.year}</th><td>{busUsageLines(b.selected).boardings}</td><td>{busUsageLines(b.selected).alightings}</td></tr>}
    </tbody></table>
    <p className="owner-caption">이용량이 연결된 역·정류장만 집계 · 매장 방문객 수와는 달라요.</p>
    <h3 className="data-heading"><AppIcon name="pin" />주요 집객시설</h3>
    {f ? <>{Object.values(f.selected.by_type).filter(t => (t.count ?? 0) > 0).map(t => <div className="owner-time-row" key={t.type}><div><span className="data-heading"><AppIcon name={facilityIcon(t.label)} />{t.label}</span><small className="owner-caption">{facilityReferenceText(t)}</small></div><b>{facilityCountText(t)}</b></div>)}
      <p className="owner-caption">{Object.values(f.selected.by_type).filter(t => t.count === 0).map(t => t.label).join("·")} 0곳{Object.values(f.selected.by_type).some(t => t.count === null) ? ` / ${Object.values(f.selected.by_type).filter(t => t.count === null).map(t => t.label).join("·")} 자료 없음` : ""}</p>
      <label className="owner-map-toggle"><input type="checkbox" checked={showFacilities} onChange={e => onShowFacilitiesChange(e.target.checked)} />지도에 시설 표시</label>
    </> : <p className="owner-caption">시설 자료 없음</p>}
    {r?.entrance_data?.enabled && <label className="owner-map-toggle"><input type="checkbox" checked={showExits} onChange={e => onShowExitsChange(e.target.checked)} />지도에 지하철 출입구 표시</label>}
    <p className="owner-caption" title={[r?.source.title, b?.source.title, ...(f?.attributions ?? [])].filter(Boolean).join(" · ")}>출처: 국가철도공단·국토교통부·공공데이터포털·서울시{f ? " · 공공누리 제1유형" : ""}</p>
  </div>;
}

function facilityIcon(label: string): AppIconName {
  if (/병원/.test(label)) return "hospital";
  if (/마트|쇼핑|백화점|아울렛/.test(label)) return "store";
  return "building";
}
