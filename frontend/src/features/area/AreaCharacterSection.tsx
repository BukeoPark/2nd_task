import { railLineBadge, splitRailLines } from "../../lib/railLines";
import { AppIcon, MetricBars } from "../../components/DataVisuals";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Caveat } from "../../components/NoteHost";
import { Block, Caption, ChevronToggle, Stat, StatRow, SubHead } from "../../components/PanelKit";
import { PK, grid2, grid3 } from "../../lib/panelStyle";
import { Fold, Notice, SourceNote } from "../../components/Notice";
import type { AreaCharacter, CharacterStation } from "../../lib/apiClient";
import { cellSub, cellText, countText, demandStructureNote, densityReferenceText, densityText, NEUTRAL_STYLE, pctText, rankText, TRAIT_STYLE, typeNotice } from "../../lib/areaCharacter";
import { useAreaCharacter, useReportExtras } from "../food/useFood";
import { facilityDistance, supplementalAreaFacilities } from "../../lib/facilitySupplement";
import { namedCounts, namedFacilities } from "../../lib/areaFacilityNames";
import { FS } from "../../lib/typography";

interface Props {
  level: "dong" | "trdar";
  code: string;
  svc: string | null;
  scls: string | null;
  unitKind: string;
}

/** 조회 상태(불러오는 중·실패)를 한 곳에서 처리하고, 값이 오면 그리는 함수에 넘긴다 — 요약의 유형·입지·교통·경쟁·소비 수요가 같은 조회를 나눠 쓴다. */
function WithCharacter({ level, code, svc, scls, children }: Omit<Props, "unitKind"> & { children: (d: AreaCharacter) => ReactNode }) {
  const q = useAreaCharacter(level, code, svc, scls);
  if (q.isPending) return <Notice tone="muted">상권 유형·입지 특성을 계산하는 중...</Notice>;
  if (q.isError) {
    return (
      <Notice tone="error">
        조회 실패: {q.error.message}{" "}
        <button type="button" onClick={() => void q.refetch()} style={{ marginLeft: 4, border: "1px solid #DC2626", background: "white", color: "#DC2626", borderRadius: 4, cursor: "pointer" }}>
          다시 시도
        </button>
      </Notice>
    );
  }
  return <>{children(q.data)}</>;
}

/** '유형' — 이 행정동·상권의 참고용 규칙 분류(업무·주거·교통 거점·상업 집중)와 판정 근거, 강점·주의사항, 계산 기준.
 * 종합점수·창업 성공 확률은 없다. 매장 반경 값(매장 상세 '주변')과 다른 값이다. */
export function AreaTypeSection({ level, code, svc, scls, unitKind }: Props) {
  return (
    <WithCharacter level={level} code={code} svc={svc} scls={scls}>
      {(d) => {
        const isDataCaution = (text: string) => /이용량.*연결|승하차.*합계/.test(text);
        const dataCautions = d.cautions.filter(isDataCaution);
        const cautions = d.cautions.filter((text) => !isDataCaution(text));
        const demand = d.type.traits.some((t) => t.key === "residential")
          ? "직장인구보다 상주인구가 많은 지역입니다."
          : d.type.traits.some((t) => t.key === "business")
            ? "상주인구보다 직장인구가 많은 지역입니다."
            : demandStructureNote(d.type);
        return (
        <div>
          <section style={{ background: "#F5F3FF", border: "1px solid #EDE9FE", borderRadius: 12, padding: "16px 18px" }}>
            <Caption style={{ marginTop: 0 }}>{unitKind} 유형 · 외식 전체 기준</Caption>
            <h3 style={{ fontSize: FS.metric, lineHeight: 1.35, color: "#5B21B6", margin: "8px 0 0", wordBreak: "keep-all" }}>{d.type.traits.length > 0 ? d.type.traits.map((t) => t.label).join(" · ") : d.type.headline}</h3>
            {demand && <p style={{ margin: "10px 0 0", fontSize: FS.body, lineHeight: 1.7, color: "#374151", wordBreak: "keep-all" }}>{demand}</p>}
            <Caption style={{ marginTop: 10 }}>인구·입지 통계에 따른 참고용 분류이며, 실제 고객 구성이나 창업 성공 가능성을 뜻하지 않습니다.</Caption>
            {typeNotice(d.type) && <Caption tone="warn" style={{ marginTop: 10 }}>{typeNotice(d.type)}</Caption>}
          </section>
          {d.type.traits.length > 0 && (
            <Block title="판정 근거">
              <div style={{ display: "grid", gap: 10 }}>
                {d.type.traits.map((t) => (
                  <div key={t.key} style={{ background: "#fff", border: `1px solid ${PK.line}`, borderRadius: 10, padding: "12px 14px" }}>
                    <div style={{ fontSize: FS.ui, fontWeight: 700, color: TRAIT_STYLE[t.key].fg }}>{t.label}</div>
                    <ul style={{ margin: "6px 0 0", paddingLeft: 18, display: "grid", gap: 6, fontSize: FS.body, lineHeight: 1.7, color: PK.sub, wordBreak: "keep-all" }}>{t.evidence.map((e) => <li key={e}>{e}</li>)}</ul>
                  </div>
                ))}
              </div>
            </Block>
          )}
          {d.type.held.length > 0 && d.type.kind !== "hold" && <div style={{ marginTop: 16 }}><Notice tone="muted">{d.type.held.map((h) => h.reason).join(" ")}</Notice></div>}
          {d.strengths.length > 0 && <Points title="함께 볼 지역 특징" tone="#475569" items={d.strengths} empty="" />}
          {cautions.length > 0 && <Points title="추가 확인사항" tone="#92400E" items={cautions} empty="" />}
          <Fold title="계산 기준·출처 자세히 보기">
            <div style={{ fontSize: FS.warn, color: PK.sub, lineHeight: 1.75 }}>
              <div>{d.basis.label}</div><div>{d.basis.unit}</div>
              {dataCautions.map((t) => <p key={t}>{t}</p>)}
              <ul style={{ margin: "6px 0", paddingLeft: 16 }}>{d.basis.rules.map((r) => <li key={r}>{r}</li>)}</ul>
              <div>
                기준 분포: 같은 단위 {d.basis.reference.units}곳 — 외식 점포 밀도 상위 25% {d.basis.reference.store_density_p75?.toLocaleString("ko-KR")}곳/㎢ · 집객시설 밀도 중앙값 {d.basis.reference.fac_density_median?.toLocaleString("ko-KR")}곳/㎢ · 역 이용량(연결된 역 승차 합) 상위 25% {d.basis.reference.transit_boardings_p75?.toLocaleString("ko-KR")}명. {d.basis.reference.note}
              </div>
              <div style={{ marginTop: 4 }}>유형 판정은 선택 업종과 무관하게 외식 전체 기준이고, 특성의 '경쟁 환경'만 선택 업종을 따릅니다.</div>
              {d.basis.relative_note && <div style={{ marginTop: 4 }}>{d.basis.relative_note}</div>}
              {d.basis.success_note && <div style={{ marginTop: 4 }}>{d.basis.success_note}</div>}
              {d.basis.data_notes && (
                <>
                  <div style={{ marginTop: 6, fontWeight: 700 }}>값의 집계 기준</div>
                  <ul style={{ margin: "2px 0", paddingLeft: 16 }}>{d.basis.data_notes.map((n) => <li key={n}>{n}</li>)}</ul>
                </>
              )}
            </div>
            {d.basis.sources.map((src) => <SourceNote key={src.title} label="유형·특성 자료" title={src.title} reference={src.reference} />)}
          </Fold>
        </div>
        );
      }}
    </WithCharacter>
  );
}

type CharProps = Omit<Props, "unitKind">;

// '특성' 항목은 없앴다 — 같은 값을 다른 항목이 이미 보여 줘 되풀이였다. 특성에만 있던 정보(교통·점포 밀도·집객시설 밀도·유동인구 시간대 순위)는 아래 조각으로
// 각 항목(입지·교통, 경쟁·개폐업, 소비 수요)에 한 번씩만 둔다. 값은 모두 경계 기준 조회(useAreaCharacter)이고 유형 탭·요약의 판정 근거와 같은 조회를 나눠 쓴다.

/** 입지·교통 — 지하철·버스(경계 안 + 경계 밖 250m 이내 역). 이용량은 이용량이 확인된 곳만 더한 값이다. */
export function AreaTransitBlock(p: CharProps) {
  return (
    <WithCharacter {...p}>
      {(d) => (
        <Block title={<span className="data-heading"><AppIcon name="train" />교통 접근성</span>}>
          <div className="environment-summary environment-transit-summary">
          <div>
            <span><AppIcon name="train"/>지하철역</span>
            {[...d.sections.transit.rail.inside, ...d.sections.transit.rail.within_250m].map(st => <div key={st.name + st.lines} className="environment-station-row"><StationName st={st}/><Caption>{st.where === "inside" ? "지역 안" : `경계에서 ${st.distance_m}m`}</Caption></div>)}
            {d.sections.transit.rail.count === 0 && <Caption>경계에서 250m 이내 지하철역이 없어요.</Caption>}
          </div>
          <div><span><AppIcon name="bus"/>근처 버스정류장</span><strong>{d.sections.transit.bus.count.toLocaleString()}곳</strong><small>경계 밖 250m까지</small></div>
          </div>
          <RailPart rail={d.sections.transit.rail} />
          <BusPart bus={d.sections.transit.bus} />
          <Caveat>{d.sections.transit.note}</Caveat>
        </Block>
      )}
    </WithCharacter>
  );
}

/** 집객시설 이름 — 백화점·쇼핑몰·대형마트·영화관·문화시설·종합병원의 이름과 종류(매장 상세의 '어떤 시설인가요'와 같은 모양). 처음 5곳만 보이고 나머지는 '더 보기'. */
function AreaFacilityNames({ level, code, svc, scls }: CharProps) {
  const q = useReportExtras(level, code, svc, scls);
  if (q.isPending) return <Caption>시설 이름을 불러오는 중...</Caption>;
  if (q.isError) return <Caption>시설 이름을 불러오지 못했어요.</Caption>;
  const map = q.data?.facility_map?.kind === "facilities" ? q.data.facility_map : q.data?.map?.kind === "facilities" ? q.data.map : null;
  const points = [...(map?.points ?? []), ...supplementalAreaFacilities(map?.boundary).filter(p=>p.category === "시장")];
  const list = namedFacilities(points);
  const ring = map?.boundary?.type === "Polygon" ? (map.boundary.coordinates as number[][][])[0] : map?.boundary?.type === "MultiPolygon" ? (map.boundary.coordinates as number[][][][])[0]?.[0] : [];
  const center = ring?.length ? {lon:ring.reduce((s,p)=>s+p[0],0)/ring.length,lat:ring.reduce((s,p)=>s+p[1],0)/ring.length} : null;
  if (list.length === 0) return <Caption>이름을 보일 대표 시설이 없어요.</Caption>;
  return <>
    {[...new Set(list.map(x=>x.shown))].map(category=><div key={category}><SubHead>{/병원/.test(category) ? "의료" : /시장|쇼핑|마트|백화점/.test(category) ? "상업" : "문화·여가"} · {category}</SubHead>{list.filter(x=>x.shown===category).map(x=><StatRow key={`${x.shown}-${x.name}`} label={x.name} value={center ? `${facilityDistance(center,x).toLocaleString()}m` : "거리 자료 없음"} note={x.shown}/>)}</div>)}
  </>;
}


/** 입지·교통 — 집객시설 수와 밀도(같은 단위 중앙값과 견줌). */
export function AreaFacilitiesBlock(p: CharProps) {
  const [expanded, setExpanded] = useState(false);
  const extras = useReportExtras(p.level, p.code, p.svc, p.scls);
  // 병원급(중형병원)은 시설 지도의 이름으로 센다 — 서버의 '병원·의원' 개수에는 개인의원이 섞여 있다
  const facilityMap = extras.data?.facility_map?.kind === "facilities" ? extras.data.facility_map : extras.data?.map?.kind === "facilities" ? extras.data.map : null;
  const extraPoints = supplementalAreaFacilities(facilityMap?.boundary);
  const midHospitals = namedCounts(facilityMap?.points)["중형병원"] ?? 0;
  const markets = extraPoints.filter(p=>p.category === "시장").length;
  return (
    <WithCharacter {...p}>
      {(d) => {
        const fa = d.sections.anchor.facilities;
        const schoolKeys = ["elementary", "middle", "high"];
        const schoolRows = fa.by_type?.filter(t => schoolKeys.includes(t.key)) ?? [];
        const schoolCount = schoolRows.length === 3 && schoolRows.every(t => t.count !== null)
          ? schoolRows.reduce((sum, t) => sum + (t.count ?? 0), 0) : null;
        const supplemented = new Set((fa.supplementary ?? []).map(t => t.key));
        // 병원·의원·은행·약국은 개수 표에서 뺀다(수가 많고 대부분 개인 점포). 규모가 큰 병원만 대형병원(종합병원)·중형병원(병원급)으로 보인다.
        const hidden = ["bank", "pharmacy", "hospital"];
        const facilityTypes = (fa.by_type ?? []).filter(t => !schoolKeys.includes(t.key) && !["subway", "bus_stop"].includes(t.key) && !hidden.includes(t.key) && !supplemented.has(t.key)).map(t => t.key === "general_hospital" ? { ...t, label: "대형병원" } : t);
        facilityTypes.push(...(fa.supplementary ?? []).filter(t => !hidden.includes(t.key)));
        if (markets > 0) facilityTypes.push({ key: "market", label: "시장", count: markets });
        if (midHospitals > 0) facilityTypes.push({ key: "mid_hospital", label: "중형병원", count: midHospitals });
        if (schoolRows.length > 0) facilityTypes.push({ key: "schools", label: "초·중·고", count: schoolCount });
        const sortedFacilities = facilityTypes.filter(t => t.count !== null && t.count > 0).sort((a, b) => (b.count ?? 0) - (a.count ?? 0) || a.label.localeCompare(b.label, "ko"));
        const visibleFacilities = sortedFacilities;
        return (
          <Block title={<span className="data-heading"><AppIcon name="building"/>집객시설</span>} >
            <div className="environment-summary"><div><span><AppIcon name="building"/>표시 시설 합계</span><strong>{sortedFacilities.reduce((sum,t)=>sum+(t.count ?? 0),0).toLocaleString()}곳</strong><small>의원·약국·은행 제외 · 종류별 공식 자료 기준</small></div></div>
            <SubHead>어떤 시설이 있나요?</SubHead>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "4px 16px" }}>{visibleFacilities.map(t => <StatRow key={t.key} label={t.label} value={t.count === null ? "자료 없음" : `${t.count.toLocaleString()}곳`} missing={t.count === null}/>)}</div>
            <ChevronToggle open={expanded} onClick={() => setExpanded(v => !v)} label="집객시설 상세" />
            {!facilityTypes.some(t => t.count !== null && t.count > 0) && <Caption>종류별로 확인되는 시설이 없어요.</Caption>}
            {expanded && <><AreaFacilityNames level={p.level} code={p.code} svc={p.svc} scls={p.scls} /><Caption>거리: 지역 경계 대표점 기준 직선거리 · 시장은 서울시 전통시장 상권 대표 좌표 기준. 이름·좌표가 있는 시설만 상세 목록에 표시합니다.</Caption></>}
            <Caveat>시설은 공식 목록·인허가 기준입니다. 의원·약국은 제외하며, 확인된 시설만 표시합니다. 시장 거리는 대표 좌표 기준입니다.</Caveat>
            <Caveat>집객시설 자료: {cellSub(fa.total) || "서울시 상권분석서비스"}. 지역 경계 안 시설 기준입니다.</Caveat>
          </Block>
        );
      }}
    </WithCharacter>
  );
}

/** 경쟁·개폐업 — 현재 점포 수와 밀도(상가정보). 선택 업종 기준이고, 밀도는 같은 단위 상위 25% 기준선과 견준다. */
export function AreaStoreStatusBlock(p: CharProps) {
  return (
    <WithCharacter {...p}>
      {(d) => {
        const c = d.sections.competition;
        return (
          <Block title="현재 점포 현황">
            <div style={grid2}>
              <Mini label="점포 수(현재)" value={cellText(c.stores, countText)} sub={cellSub(c.stores)} />
              <Mini label="점포 밀도" value={densityText(c.density_per_km2, c.small_area)} sub={densityReferenceText(c.reference_applies, c.reference_density_p75)} />
            </div>

            <Caveat>{c.note}</Caveat>
          </Block>
        );
      }}
    </WithCharacter>
  );
}

/** 소비 수요 — 직장인구 비율(업무·주거 판정). 직장·상주 인구 값은 위 표에 이미 있어 비율만 더한다. */
export function AreaWorkerShareRow(p: CharProps) {
  return (
    <WithCharacter {...p}>
      {(d) => {
        const dm = d.sections.demand;
        return (
          <>
            <StatRow label="직장인구 비율" value={`${dm.worker_share_pct === null ? "자료 없음" : pctText(dm.worker_share_pct)}${dm.demand_type ? ` · ${dm.demand_type}` : ""}`} missing={dm.worker_share_pct === null} />
            {!dm.base_ok && <div style={{ marginTop: 6 }}><Notice tone="warn">직장·상주 인구 합이 1,000명 미만이거나 자료가 없어 업무·주거 판정은 보류했습니다.</Notice></div>}
          </>
        );
      }}
    </WithCharacter>
  );
}

/** 소비 수요 — 유동인구 시간대 비중의 점심·야간·주말 순위(같은 단위끼리 비교). 시간대 전체 막대는 위의 시간대 비중에 있다. */
export function AreaFloatingStats({ unitKind, ...p }: CharProps & { unitKind: string }) {
  return (
    <WithCharacter {...p}>
      {(d) => {
        const f = d.sections.demand.floating;
        if (!f) return null;
        return (
          <>
            <div style={{ ...grid3, marginTop: 10 }}>
              <Mini label="점심 비중" value={f.lunch_pct === null ? "자료 없음" : pctText(f.lunch_pct)} sub={rankText(f.lunch_rank, "").trim()} />
              <Mini label="야간 비중" value={f.late_pct === null ? "자료 없음" : pctText(f.late_pct)} sub={rankText(f.late_rank, "").trim()} />
              <Mini label="주말 비중" value={f.weekend_pct === null ? "자료 없음" : pctText(f.weekend_pct)} />
            </div>
            <Caption>점심 11~14시 · 야간 21~24시</Caption>
            <Fold title="비교 범위·집계 기준">
              <Caption>양천·영등포의 {unitKind}끼리 비교합니다. 점심 비중은 {f.lunch_peer_count === undefined ? "대상 수 미제공" : `자료가 있는 ${f.lunch_peer_count}곳`}, 야간 비중은 {f.late_peer_count === undefined ? "대상 수 미제공" : `자료가 있는 ${f.late_peer_count}곳`}과 비교했습니다. 길 단위로 배분한 인구 추정치라 실제 행인 수나 중복을 제거한 방문자 수가 아닙니다.</Caption>
            </Fold>
          </>
        );
      }}
    </WithCharacter>
  );
}

/** 매장 상세용 한 줄 요약 — 유형 헤드라인과 이동 링크만(상세는 상권 분석에서). 보류·혼합도 그대로 말한다. */
export function AreaCharacterLine({ level, code, label }: { level: "dong" | "trdar"; code: string; label: string }) {
  const q = useAreaCharacter(level, code, null, null);
  if (q.isPending) return <Caption>{label}: 유형을 계산하는 중...</Caption>;
  if (q.isError) return <Caption>{label}: 유형을 불러오지 못했습니다.</Caption>;
  const t = q.data.type;
  return (
    <div style={{ fontSize: FS.caption, color: "#4B5563", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4 }}>
      <span>{label}:</span>
      {t.traits.length > 0 ? t.traits.map((x) => <Chip key={x.key} text={x.label} style={TRAIT_STYLE[x.key]} small />) : <Chip text={t.headline} style={NEUTRAL_STYLE} small />}
      <span style={{ color: "#6B7280" }}>(참고용 규칙 분류)</span>
    </div>
  );
}

function RailPart({ rail }: { rail: AreaCharacter["sections"]["transit"]["rail"] }) {
  return <div className="environment-transport">
    <div className="data-heading"><AppIcon name="train"/>지하철 이용량</div>
    {rail.count > 0 ? <>
      <MetricBars items={[
        { label: "하루 평균 승차", value: rail.boardings_observed, color: "#3159D9" },
        { label: "하루 평균 하차", value: rail.alightings_observed, color: "#7995E8" },
      ]} format={(n) => `${Math.round(n).toLocaleString("ko-KR")}명`} />
      <Caption>{rail.year}년 · 이용량 확인 {rail.linked}/{rail.count}개 역{rail.usage_state === "partial" ? " · 일부 역·노선만 포함" : ""}</Caption>

    </> : <Caption>경계 안·250m 이내 역 없음 · 가장 가까운 역 {rail.nearest_m == null ? "거리 자료 없음" : `경계에서 ${rail.nearest_m.toLocaleString()}m`}</Caption>}
    <Caveat>{rail.basis}</Caveat>
  </div>;
}

/** 호선 원형 배지 + 역 이름 — 지역 종합분석과 매장 상세 주변이 같이 쓴다. */
export function StationName({ st }: { st: Pick<CharacterStation, "name" | "lines"> }) {
  return <span className="station-name">{splitRailLines(st.lines).map(line => { const badge = railLineBadge(line); return <span key={line} className="rail-line-badge" style={{ background: badge.color, color: ["#BDB092", "#F5A200", "#B7C452", "#77C4A3"].includes(badge.color) ? "#172033" : "white" }} title={badge.name} aria-label={badge.name}>{badge.label}</span>; })}<FittedStationName name={`${st.name.replace(/역$/, "")}역`}/></span>;
}

/** 역명만 가용 너비에 맞춘다. 창·카드 폭이 바뀌면 다시 측정한다. */
function FittedStationName({ name }: { name: string }) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.fontSize = `${FS.metric}px`;
      const available = el.clientWidth;
      if (available > 0 && el.scrollWidth > available) el.style.fontSize = `${Math.floor(FS.metric * available / el.scrollWidth * 10) / 10}px`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [name]);
  return <strong ref={ref} className="station-name-text" title={name}>{name}</strong>;
}

function BusPart({ bus }: { bus: AreaCharacter["sections"]["transit"]["bus"] }) {
  return <div className="environment-transport">
    <div className="data-heading"><AppIcon name="bus"/>버스 이용량</div>
    {bus.count > 0 ? <>
      <MetricBars items={[
        { label: "하루 평균 승차", value: bus.boardings_observed, color: "#168581" },
        { label: "하루 평균 하차", value: bus.alightings_observed, color: "#73BDB5" },
      ]} format={(n) => `${Math.round(n).toLocaleString("ko-KR")}명`} />
      <Caption>{bus.year}년 · 이용량 확인 {bus.linked}/{bus.count}곳{bus.usage_state === "partial" ? " · 일부 정류장만 포함" : ""}</Caption>
    </> : <Caption>근처 정류장 없음</Caption>}
    {bus.caution && <Caption tone="warn">{bus.caution}</Caption>}
    <Caveat>{bus.basis}</Caveat>
  </div>;
}

function Points({ title, tone, items, empty }: { title: string; tone: string; items: string[]; empty: string }) {
  return (
    <Block title={title} accent={tone}>
      {items.length === 0 ? <Caption>{empty}</Caption> : (
        <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 8, fontSize: FS.body, lineHeight: 1.7, color: PK.sub, wordBreak: "keep-all" }}>
          {items.map((t) => <li key={t}>{t}</li>)}
        </ul>
      )}
    </Block>
  );
}

function Mini({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <Stat onGray label={label} value={value} sub={sub} missing={/자료 없음|확인 불가|해당 없음/.test(value)} />;
}

function Chip({ text, style, small }: { text: string; style: { bg: string; fg: string }; small?: boolean }) {
  return (
    <span style={{ background: style.bg, color: style.fg, borderRadius: 999, padding: small ? "1px 7px" : "3px 10px", fontSize: small ? FS.caption : FS.warn, fontWeight: 700 }}>{text}</span>
  );
}
