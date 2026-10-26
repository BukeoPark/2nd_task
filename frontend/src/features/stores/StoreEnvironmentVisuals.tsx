import { useState, type ReactNode } from "react";
import { AppIcon, MetricBars } from "../../components/DataVisuals";
import { Block, Caption, ChevronToggle, StatRow, SubHead } from "../../components/PanelKit";
import type { BusAccess, RailAccess, FacilityAccess } from "../../lib/apiClient";
import { StationName } from "../area/AreaCharacterSection";
import { busCountText } from "../../lib/busText";
import { FACILITY_GROUPS, facilityCountText } from "../../lib/facilityText";
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
  </Block>;
}

/** 서버의 '종합병원'은 화면에서 상권 페이지와 같은 이름('대형병원')으로 보인다. */
const typeLabel = (l: string) => (l === "종합병원" ? "대형병원" : l);

export function StoreFacilityVisuals({ facilities, detail }: { facilities?: FacilityAccess; detail?: ReactNode }) {
  // ⌄ 단추 하나로 접고 편다 — 접힌 상태는 반경 안에 있는 종류의 개수 카드만, 펼치면 카테고리(의료·상업·문화·여가·교육·공공기관)별 시설 이름·종류·거리가 이어진다.
  const [expanded, setExpanded] = useState(false);
  const f = facilities?.status === "ok" ? facilities : null;
  // 카드: 상권 페이지처럼 반경 안에 있는 종류만 개수 많은 순으로 — 0곳이거나 공식 자료가 없는 종류는 보이지 않는다.
  const items = f ? Object.values(f.selected.by_type).filter(t => (t.count ?? 0) > 0).sort((a,b) => (b.count ?? 0) - (a.count ?? 0) || a.label.localeCompare(b.label)) : [];
  // 세부: 카테고리마다 반경 안 시설을 가까운 순으로 한 줄씩. 반경 안에 하나도 없는 종류(0곳)는 줄도 만들지 않는다.
  const groups = f ? FACILITY_GROUPS.map(g => {
    const rows = g.types.flatMap(t => {
      const stat = f.selected.by_type[t];
      if (!stat || stat.count === null) return [];
      const inside = f.facilities.filter(x => x.type === t).sort((a, b) => a.distance_m - b.distance_m).map(x => ({ key: x.facility_id, name: x.display_name ?? x.name, distance: x.distance_m, note: `${typeLabel(stat.label)}${x.subtype && x.subtype !== stat.label ? ` · ${x.subtype}` : ""}` }));
      return inside;
    });
    return { id: g.id, label: g.label, rows };
  }).filter(g => g.rows.length > 0) : [];
  const foldable = groups.length > 0;
  return <Block title={<span className="data-heading"><AppIcon name="building"/>집객시설</span>}>
    {items.length ? <div className="store-detail-grid">{items.map(t => <div className="store-detail-tile store-facility-tile" key={t.type}><span className="data-heading"><AppIcon name={/병원/.test(t.label) ? "hospital" : /마트|쇼핑|백화점|아울렛/.test(t.label) ? "store" : "building"}/>{typeLabel(t.label)}</span><strong>{facilityCountText(t)}</strong></div>)}</div> : <Caption>{f ? "선택 반경에 확인된 시설 없음" : "시설 자료 없음"}</Caption>}
    {foldable && <ChevronToggle open={expanded} onClick={() => setExpanded(!expanded)} label="집객시설 상세" />}
    {expanded && <>
      {groups.map(g => <div key={g.id}><SubHead>{g.label}</SubHead>{g.rows.map(r => <StatRow key={r.key} label={r.name} value={formatDistance(r.distance)} note={r.note} />)}</div>)}
      {detail && <div style={{ marginTop: 10 }}>{detail}</div>}
    </>}
  </Block>;
}
