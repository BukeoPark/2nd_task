import { useState } from "react";
import { AppIcon, MetricBars } from "../../components/DataVisuals";
import { Block, Caption } from "../../components/PanelKit";
import type { BusAccess, RailAccess, FacilityAccess } from "../../lib/apiClient";
import { StationName } from "../area/AreaCharacterSection";
import { busCountText } from "../../lib/busText";
import { facilityCountText } from "../../lib/facilityText";
import { formatDistance } from "../../lib/format";

/** 지역 화면과 같은 시각 언어를 쓰되, 매장 분석의 선택 반경은 그대로 유지한다. */
export function StoreTransitVisuals({ rail, bus }: { rail?: RailAccess; bus: BusAccess }) {
  const r = rail?.status === "ok" ? rail : null;
  const b = bus.status === "ok" ? bus : null;
  const format = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}명`;
  return <Block title={<span className="data-heading"><AppIcon name="train"/>교통 접근성</span>}>
    <div className="environment-summary environment-transit-summary">
      <div>
        <span><AppIcon name="train"/>지하철역</span>
        {r ? r.stations.length ? r.stations.map(st => <div key={st.complex_id} className="environment-station-row"><StationName st={st}/><Caption>{formatDistance(st.distance_m)} · 직선거리</Caption></div>) : r.nearest_station ? <div className="environment-station-row"><StationName st={r.nearest_station}/><Caption>{formatDistance(r.nearest_station.distance_m)} · 반경 밖</Caption></div> : <Caption>확인된 역 없음</Caption> : <Caption>지하철 자료 없음</Caption>}
      </div>
      <div>
        <span><AppIcon name="bus"/>버스정류장</span>
        <strong>{b ? busCountText(b.selected) : "자료 없음"}</strong>
        {b?.nearest && <small>{b.nearest.name} · {formatDistance(b.nearest.distance_m)}{!b.nearest.reliable ? " (거리 확인 필요)" : ""}</small>}
        {b && !b.scope.complete && <small>수집 범위 내 확인된 정류장 기준</small>}
      </div>
    </div>
    <div className="environment-transport">
      <div className="data-heading"><AppIcon name="train"/>지하철 이용량</div>
      <MetricBars items={[
        { label: "하루 평균 승차", value: r?.selected.boardings_observed ?? null, color: "#3159D9" },
        { label: "하루 평균 하차", value: r?.selected.alightings_observed ?? null, color: "#7995E8" },
      ]} format={format}/>
      {r && <Caption>{r.usage_basis.year}년 · 이용량 확인 {r.selected.linked}/{r.selected.count}개 역</Caption>}
    </div>
    <div className="environment-transport">
      <div className="data-heading"><AppIcon name="bus"/>버스 이용량</div>
      <MetricBars items={[
        { label: "하루 평균 승차", value: b?.selected.boardings_observed ?? null, color: "#168581" },
        { label: "하루 평균 하차", value: b?.selected.alightings_observed ?? null, color: "#73BDB5" },
      ]} format={format}/>
      {b && <Caption>{b.usage_basis.year}년 · 이용량 확인 {b.selected.linked}/{b.selected.count}곳</Caption>}
    </div>
    <Caption>선택 반경 · 직선거리 기준 · 이용량이 확인된 역·정류장만 집계</Caption>
  </Block>;
}

export function StoreFacilityVisuals({ facilities }: { facilities?: FacilityAccess }) {
  const [expanded, setExpanded] = useState(false);
  const f = facilities?.status === "ok" ? facilities : null;
  const items = f ? Object.values(f.selected.by_type).filter(t => (t.count ?? 0) > 0).sort((a,b) => (b.count ?? 0) - (a.count ?? 0) || a.label.localeCompare(b.label)) : [];
  return <Block title={<span className="data-heading"><AppIcon name="building"/>집객시설</span>}>
    {items.length ? <><div className="store-detail-grid">{(expanded ? items : items.slice(0,6)).map(t => <div className="store-detail-tile store-facility-tile" key={t.type}><span className="data-heading"><AppIcon name={/병원/.test(t.label) ? "hospital" : /마트|쇼핑|백화점|아울렛/.test(t.label) ? "store" : "building"}/>{t.label}</span><strong>{facilityCountText(t)}</strong></div>)}</div>
    {items.length > 6 && <button className="store-more" aria-expanded={expanded} aria-label={expanded ? "시설 접기" : "시설 더보기"} onClick={() => setExpanded(!expanded)}>{expanded ? "접기 ⌃" : "더보기 ⌄"}</button>}</> : <Caption>{f ? "선택 반경에 확인된 시설 없음" : "시설 자료 없음"}</Caption>}
  </Block>;
}
