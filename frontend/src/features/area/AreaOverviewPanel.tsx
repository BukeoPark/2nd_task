import { useQueries } from "@tanstack/react-query";
import { apiClient } from "../../lib/apiClient";
import { AppIcon, PopulationMix, MetricBars } from "../../components/DataVisuals";
import { useState, type ReactNode } from "react";
import { Drawer } from "../../components/Drawer";
import { BarList, LineChart } from "../../components/MiniCharts";
import { Notice } from "../../components/Notice";
import { Caveat, NoteHost, NoteSlot } from "../../components/NoteHost";
import { InfoTip } from "../../components/InfoTip";
import type { Mode } from "../../lib/mode";
import { RailHeading } from "../../components/RailHeading";
import { TabRail, type RailItem } from "../../components/TabRail";
import type { FoodCompareResponse, FoodLevel, OverviewTrdar } from "../../lib/apiClient";
import { AREA_QUESTION, AREA_TAB_LABEL, AREA_TAB_STYLE, areaTabsFor, type AreaTabId } from "../../lib/areaTabs";
import { formatKrw, formatMetric, shortQuarter } from "../../lib/format";
import { railPanelId, railTabId } from "../../lib/railIds";
import { useNarrow } from "../../lib/useNarrow";
import { RAIL_WIDTH_PX } from "../../lib/vizConfig";
import { useAreaCharacter, useFoodCategories, useFoodCompare, useFoodUnitStores, useUnitOverview } from "../food/useFood";
import { AreaReportModal } from "./AreaReportModal";
import { glyphFor } from "../../lib/storeGlyph";
import { SummaryTypeBadge, SummaryTypeContext } from "./SummaryType";
import { AreaBriefCard } from "./AreaBriefCard";
import { Block, Caption, ListRow, Stat, StatRow, SubHead } from "../../components/PanelKit";
import { ReportCTA } from "../../components/ReportCTA";
import { CostCheckLauncher } from "./CostCheckSection";
import { computeRentDetail, loadDraft, type CostCheckDraft } from "../../lib/costCheck";
import { rentVsReference } from "../../lib/costSummary";
import { CostCheckModal } from "./CostCheckModal";
import { unitSampleStores } from "../../lib/interpretRules";
import { buildAreaBrief, type BriefTarget } from "../../lib/areaBrief";
import { UnitStoreList } from "../food/UnitStoreList";
import { AreaFacilitiesBlock, AreaFloatingStats, AreaStoreStatusBlock, AreaTransitBlock } from "./AreaCharacterSection";
import { FS } from "../../lib/typography";

type Row = FoodCompareResponse["rows"][number];
const LEVEL_NOUN = { dong: "행정동", trdar: "상권" } as const;

interface Props {
  level: "dong" | "trdar";
  code: string;
  title: string;
  type?: string | null;
  svc: string | null;
  scls: string | null;
  filterName: string;
  parentName?: string;
  /** 지도에서 이 단위 중심으로 확대·비교 담기 같은 버튼(MapPage 가 만든다) */
  actions?: ReactNode;
  favorite?: { saved: boolean; onToggle: () => void; note?: string | null };
  /** 지도 단위와 요약 단위가 다를 때의 안내 — 접지 않고 맨 위에 둔다 */
  notice?: ReactNode;
  onBack?: () => void;
  /** 뒤로 가기 단추 문구(기본: '← 행정동 종합분석으로') */
  backLabel?: string;
  onClose: () => void;
  onSelectTrdar: (t: OverviewTrdar) => void;
  onSelectStore: (id: string) => void;
  /** 화면에서 일어난 일을 알린다(이용 순서 표시) */
  /** 이용 모드 — 인사이트 리포트의 관점(자영업자: 매출 증대·기회 / 예비 창업자: 창업 전 점검)을 정한다 */
  mode: Mode;
  /** 매장 목록 항목에 마우스·초점이 올라가면 그 id, 벗어나면 null — 지도의 같은 점 강조용 */
  onHoverStore?: (id: string | null) => void;
  /** 비교 목록에 이미 담긴 곳이 있는가 — '다음 확인사항'의 비교 문구가 달라진다 */
  basketHas?: boolean;
  /** 이 단위를 비교 목록에 담아(이미 있으면 그대로) 비교 화면을 연다. 없으면 비교 이동 항목을 보이지 않는다 */
  onCompare?: () => void;
  /** 검색창으로 초점을 옮긴다(자영업자: 내 매장 찾기). 없으면 해당 항목을 보이지 않는다 */
  onFocusSearch?: () => void;
}

const RAIL_PREFIX = "area-";
const ICON: Record<AreaTabId, ReactNode> = {
  summary: <path d="M4 4h12v12H4zM7 8h6M7 12h4" />,
  type: <path d="M10 3a7 7 0 100 14 7 7 0 000-14zM10 6v4l3 2" />,
  growth: <path d="M3 15l5-5 3 3 6-7M12 6h5v5" />,
  stability: <path d="M10 3l6 2v5c0 4-3 6-6 7-3-1-6-3-6-7V5z" />,
  demand: (
    <>
      <circle cx="7" cy="7" r="2.5" />
      <circle cx="14" cy="8" r="2" />
      <path d="M2 16c0-3 2-5 5-5s5 2 5 5M12 16c0-2 1-3 3-3s3 1 3 3" />
    </>
  ),
  cost: <path d="M4 16V8M10 16V4M16 16v-6M3 16h14" />,
  location: <path d="M10 18s6-5 6-9a6 6 0 10-12 0c0 4 6 9 6 9zM10 11a2 2 0 100-4 2 2 0 000 4z" />,
  trdars: <path d="M3 4h6v6H3zM11 4h6v6h-6zM3 12h6v4H3zM11 12h6v4h-6z" />,
  stores: <path d="M3 9l1.5-5h11L17 9M4 9v8h12V9M8 17v-4h4v4" />,
};

/** 행정동·상권 종합분석 — 요약(핵심 카드·기준 안내·지도 버튼)이 레일 첫 항목이고, 상세 지표는 같은 레일(성장성·안정·경쟁·소비 수요·입지·세부 상권·매장 목록)로 한 번에 하나씩 본다.
 * 항목 구성은 lib/areaTabs, 모양은 매장 상세와 같은 TabRail. 값은 단위 자신의 경계·표로 계산한 것이다. */
export function AreaOverviewPanel(p: Props) {
  const level: FoodLevel = p.level;
  const cmp = useFoodCompare(level, [p.code], p.svc, p.scls);
  const ov = useUnitOverview(p.level, p.code, p.svc, p.scls);
  const character = useAreaCharacter(p.level, p.code, p.svc, p.scls);
  const row = (key: string): Row | undefined => cmp.data?.rows.find((r) => r.key === key);
  const unitKind = LEVEL_NOUN[p.level];
  const narrow = useNarrow();
  const [tabState, setTab] = useState<AreaTabId>("summary");
  const [reportOpen, setReportOpen] = useState(false);
  const [costOpen, setCostOpen] = useState(false);
  const goTab = (id: AreaTabId) => { setTab(id); };
  const unitWord = p.level === "trdar" ? "상권" : "행정동";
  const sampleStores = unitSampleStores(ov.data?.trend ?? [], row("stores_sbiz")?.cells[0]?.value ?? null);
  const brief = cmp.data
    ? buildAreaBrief({ mode: p.mode, unitWord, scope: p.filterName, rows: cmp.data.rows, sampleStores, basketHas: p.basketHas ?? false })
    : null;
  if (brief) {
    // 연결되지 않은 이동(비교·검색)은 눌러도 아무 일이 없으므로 항목에서 뺀다
    brief.next = brief.next.filter((n) => (n.target === "compare" ? Boolean(p.onCompare) : n.target === "search" ? Boolean(p.onFocusSearch) : true));
  }
  const onBriefAction = (t: BriefTarget) => {
    if (t === "compare") p.onCompare?.();
    else if (t === "search") p.onFocusSearch?.();
    else if (t === "report") setReportOpen(true);
    else goTab(t.slice(4) as AreaTabId);
  };
  const tabIds = areaTabsFor(p.level, p.mode);
  const tab: AreaTabId = tabIds.includes(tabState) ? tabState : "summary"; // 모드를 바꿔 없어진 항목에 머물지 않게
  const items: RailItem[] = tabIds.map((id) => ({ id, label: AREA_TAB_LABEL[id], icon: ICON[id], ...AREA_TAB_STYLE[id] }));
  const railProps = { items, active: tab, onChange: (id: string) => setTab(id as AreaTabId), ariaLabel: `${unitKind} 분석 항목`, idPrefix: RAIL_PREFIX };
  /** 레일 항목 하나의 내용 — 선택하지 않은 항목도 그려 두고 가리기만 해서 하위 컴포넌트의 상태·조회가 유지된다. */
  const pane = (id: AreaTabId, _title: string, children: ReactNode, opts: { scoped?: boolean; manualNotes?: boolean } = {}) => (
    <div key={id} role="tabpanel" id={railPanelId(id, RAIL_PREFIX)} aria-labelledby={railTabId(id, RAIL_PREFIX)} hidden={tab !== id}>
      <div style={{ marginTop: 12, marginBottom: 8 }}>
        <RailHeading fg={AREA_TAB_STYLE[id].fg} bg={AREA_TAB_STYLE[id].bg} title={AREA_QUESTION[id][p.mode]} />
      </div>
      <NoteHost manual={opts.manualNotes || (id === "stability" || id === "location")}>{children}{(id === "stability" || id === "location") && <NoteSlot />}</NoteHost>
    </div>
  );
  return (
    <>
    {!narrow && <TabRail {...railProps} orientation="vertical" />}
    <Drawer title={p.title} titleAside={<div className="area-header-badges">
      {character.data && <SummaryTypeBadge data={character.data} />}
      <span aria-label={`선택 업종: ${p.svc ? p.filterName : "업종 전체"}`} style={{ display: "inline-flex", alignItems: "center", gap: 7, borderRadius: 24, padding: "6px 13px", background: "#F1F5F9", border: "1px solid #E2E8F0", color: "#334155", fontSize: FS.cardTitle, fontWeight: 700, lineHeight: 1.4, wordBreak: "keep-all" }}>
        {p.svc && <span aria-hidden="true">{glyphFor(p.svc).glyph}</span>}{p.svc ? p.filterName : "업종 전체"}
      </span>
      {p.mode === "founder" && p.favorite && <button type="button" aria-label={p.favorite.saved ? "내 관심 지역에서 빼기" : "내 관심 지역에 담기"} aria-pressed={p.favorite.saved} onClick={p.favorite.onToggle} title={p.favorite.saved ? "내 관심 지역에서 빼기" : "내 관심 지역에 담기"} style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 40, minWidth: 40, justifyContent: "center", padding: "6px", borderRadius: 24, border: "1px solid #D97706", background: p.favorite.saved ? "#FEF3C7" : "#FFFBEB", color: "#92400E", fontSize: FS.ui, fontWeight: 700, cursor: "pointer" }}><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill={p.favorite.saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8"><path d="m12 3 2.8 5.7 6.3.9-4.6 4.4 1.1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.6l6.2-.9Z"/></svg></button>}
    </div>} onBack={p.onBack} backLabel={p.backLabel ?? `← ${p.parentName ?? "행정동"} 종합분석으로`} onClose={p.onClose} left={narrow ? 0 : RAIL_WIDTH_PX}>
      {cmp.isPending && <div style={{ marginTop: 10 }}><Notice tone="muted">종합분석을 불러오는 중...</Notice></div>}
      {cmp.isError && (
        <div style={{ marginTop: 10 }}>
          <Notice tone="error">지표 조회 실패: {cmp.error.message} <button type="button" onClick={() => void cmp.refetch()}>다시 시도</button></Notice>
        </div>
      )}

      {narrow && <div style={{ marginTop: 10 }}><TabRail {...railProps} orientation="horizontal" /></div>}

      {pane("summary", "요약", (
        <>
          {p.mode === "founder" && p.favorite?.note && <div role="status"><Notice tone="warn">{p.favorite.note}</Notice></div>}
          {character.isPending && <Notice tone="muted">지역 유형을 불러오는 중...</Notice>}
          {character.isError && <Notice tone="error">지역 유형을 불러오지 못했어요. <button type="button" onClick={() => void character.refetch()}>다시 시도</button></Notice>}
          {character.data && <SummaryTypeContext data={character.data} />}
          {brief && <AreaBriefCard brief={brief} onAction={onBriefAction} />}
          {brief && (
            <div style={{ marginTop: 12 }}>
              <ReportCTA tourId="area-report-button" onClick={() => setReportOpen(true)} title="상권분석 보고서 보기 ›"
                sub={`${unitKind} 전체 · ${p.mode === "owner" ? "내 매장 주변 경쟁·상권 변화·고객 수요" : "매출 흐름·경쟁·입지·확인사항"} · 지역 보고서 · 인쇄·PDF 저장`} />
            </div>
          )}
          {p.notice && <div style={{ marginTop: 10 }}>{p.notice}</div>}
          {p.actions}
          {/* 지표 카드·기준 안내와 읽는 법·유의사항은 접이식 하나로 모은다(요약에 접이식이 셋이던 것을 둘로) */}
          <NoteSlot label="기준·읽는 법 자세히">
            {cmp.data && <Summary stores={row("stores_sbiz")} />}
            <div style={{ marginTop: 10 }}>
              <Notice tone="info">
                {p.level === "trdar"
                  ? "이 상권 경계 안 점포·매출·유동인구로 계산한 값입니다. 행정동 통계를 가져다 쓰지 않았어요."
                  : "행정동 전체 기준 값입니다. '세부 상권' 항목에서 상권을 누르면 그 상권 경계 기준으로 따로 분석합니다."}{" "}
                선택 업종: <strong>{p.filterName}</strong>
              </Notice>
            </div>
            {cmp.data?.scope.notice && <div style={{ marginTop: 6 }}><Notice tone="warn">{cmp.data.scope.notice}</Notice></div>}
          </NoteSlot>
          {reportOpen && <AreaReportModal level={p.level} code={p.code} name={plainName(p.title, p.type)} type={p.type} svc={p.svc} scls={p.scls} mode={p.mode} onClose={() => setReportOpen(false)} />}
        </>
      ), { manualNotes: true })}

      {cmp.data && pane("growth", "매출 흐름 — 추정매출 수준·추이·증감",
        <GrowthMenu key={`${p.level}:${p.code}:${p.svc}:${p.scls}`} level={p.level} code={p.code} svc={p.svc} scls={p.scls} overview={ov} yoy={row("sales_yoy_pct")} />, { scoped: true })}
      {cmp.data && pane("stability", "경쟁 — 점포 현황·변화·개폐업·프랜차이즈",
        <>
          <AreaStoreStatusBlock level={p.level} code={p.code} svc={p.svc} scls={p.scls} />
          <CategoryMixBlock level={p.level} code={p.code} svc={p.svc} scls={p.scls} />
          <Block title={<span className="data-heading"><AppIcon name="trend" />점포 변화</span>}>
            {ov.data ? <StoreChangeBlock ov={ov.data} change={row("stores_change_2y")} /> : <OvState q={ov} />}
            <SubHead>최근 1년 개업·폐업률</SubHead>
            <MetricBars rate items={[{ label: "개업률", value: row("open_rate_y")?.cells[0]?.value ?? null, color: "#3159D9" }, { label: "폐업률", value: row("close_rate_y")?.cells[0]?.value ?? null, color: "#9A6B3D" }]} format={v => `${v.toFixed(1)}%`} />
            <Caption>{row("open_rate_y")?.as_of ?? "집계 기간 없음"} <InfoTip label="개폐업 집계 기준">{row("open_rate_y")?.source}<br />{row("open_rate_y")?.basis}</InfoTip></Caption>
            {["open_rate_y", "close_rate_y"].map(key => { const r = row(key); const c = r?.cells[0]; return c && (c.partial || c.caution) ? <Caption key={key} tone="warn">{r?.label}: {c.note ?? (c.partial ? "일부 집계" : "표본 주의")}</Caption> : null; })}
          </Block>
          <Block title={<span className="data-heading"><AppIcon name="store" />프랜차이즈 비율</span>}>
            <Rows rows={[row("frc_share")]} />
          </Block>
        </>, { scoped: true })}
      {cmp.data && pane("demand", "소비 수요 — 유동·상주·직장인구, 시간대별 소비",
        <>
          <Block title="인구·유동">
            <PopulationMix workers={row("wrc_total")?.cells[0]?.value} residents={row("repop_total")?.cells[0]?.value} period={row("repop_total")?.as_of ?? undefined} />
            <Rows rows={[row("sales_per_10k_flpop")]} />
          </Block>
          {ov.data ? <DemandBlock ov={ov.data} extra={<AreaFloatingStats level={p.level} code={p.code} svc={p.svc} scls={p.scls} unitKind={unitKind} />} /> : <OvState q={ov} />}
        </>, { scoped: true })}
      {cmp.data && pane("location", "입지·교통 — 역·정류장·집객시설·앵커 브랜드·임대료",
        <>
          <AreaTransitBlock level={p.level} code={p.code} svc={p.svc} scls={p.scls} />
          <AreaFacilitiesBlock level={p.level} code={p.code} svc={p.svc} scls={p.scls} />
          <NearbyBrandsBlock level={p.level} code={p.code} svc={p.svc} scls={p.scls} />

        </>, { scoped: true })}

      {pane("cost", "비용·임대", <>
        {p.mode === "founder" && <Block title="내 창업 비용 계산"><CostCheckLauncher unitKey={`${p.level}:${p.code}`} unitWord={unitWord} benchWon={row("per_store_month")?.cells[0]?.value ?? null} benchNote={[row("per_store_month")?.scope, row("per_store_month")?.as_of].filter(Boolean).join(" · ")} onOpen={() => setCostOpen(true)} /></Block>}
        <RentMarketBlock rent={row("rent_small_shop")} vacancy={row("vacancy_small_shop_pct")} loading={cmp.isPending} failed={cmp.isError} founderDraft={p.mode === "founder" ? loadDraft(`${p.level}:${p.code}`) : undefined}/>

      </>)}
      {p.mode === "founder" && costOpen && <CostCheckModal unitKey={`${p.level}:${p.code}`} unitName={plainName(p.title, p.type)} unitWord={unitWord} scopeLabel={p.filterName} benchWon={row("per_store_month")?.cells[0]?.value ?? null} onClose={() => setCostOpen(false)} />}

      {p.level === "dong" && pane("trdars", `세부 상권 — 이 행정동과 겹치는 발달·골목상권${ov.data?.trdars ? ` (${ov.data.trdars.length})` : ""}`,
        ov.data?.trdars ? (
          <>
            {ov.data.trdars.length === 0 && <Notice tone="muted">겹치는 상권이 없습니다(조회는 정상).</Notice>}
            {ov.data.trdars.map((t) => <ListRow key={t.code} name={t.name} kind={t.type} meta={`경계 ${t.overlap_pct}% 겹침`} onClick={() => p.onSelectTrdar(t)} />)}
            <Caption>{ov.data.trdars_basis}{ov.data.trdars_excluded ? ` · 그 미만 ${ov.data.trdars_excluded}곳 제외` : ""}. 겹침 % = 상권 면적 중 이 행정동 안에 든 비율.</Caption>
          </>
        ) : <OvState q={ov} />)}

      {pane("stores", `매장 목록 — 이 ${unitKind} 경계 안 매장`,
        <>
          <Caption style={{ marginBottom: 8 }}>아래는 개별 매장 목록입니다. 매장을 누르면 그 매장 고유 정보(고객평가·운영이력)로 넘어가며, 위의 상권 통계와는 별개입니다.</Caption>
          <UnitStoreList level={level} code={p.code} svc={p.svc} scls={p.scls} filterName={p.filterName} onSelect={p.onSelectStore} onHover={p.onHoverStore} />
        </>)}
    </Drawer>
    </>
  );
}

/** 선택 제목은 '이름 (유형)' 으로 오므로, 리포트에는 이름만 넘긴다(유형은 따로 붙인다). */
function plainName(title: string, type?: string | null): string {
  return type && title.endsWith(`(${type})`) ? title.slice(0, -(type.length + 2)).trim() : title;
}

/** 값이 모두 없으면 같은 결측 사유를 두 번 반복하지 않는다. 0은 유효한 통계다. */
function RentMarketBlock({ rent, vacancy, loading, failed, founderDraft }: { rent?: Row; vacancy?: Row; loading: boolean; failed: boolean; /** 예비 창업자가 비용 점검에 저장한 입력 — 있으면 내 ㎡당 월세를 참고값과 견준다 */ founderDraft?: CostCheckDraft }) {
  const hasRent = rent?.cells[0]?.value != null;
  const mine = founderDraft && hasRent ? rentVsReference(computeRentDetail(founderDraft).rentPerSqm, rent!.cells[0].value as number) : null;
  const hasVacancy = vacancy?.cells[0]?.value != null;
  const tip = <InfoTip label="임대시장 자료 기준">인근 1km 이내 R-ONE 조사상권의 참고 통계이며, 선택 지역의 실제 계약금액이 아닙니다.<br/>{rent?.cells[0]?.note ?? vacancy?.cells[0]?.note}<br/>{rent?.as_of ?? vacancy?.as_of}<br/>{rent?.source ?? vacancy?.source}</InfoTip>;
  return <Block title={<>주변 임대시장 참고 {tip}</>}>
    {loading ? <Caption>임대자료를 확인하는 중...</Caption> : failed ? <Caption>임대자료를 불러오지 못했어요.</Caption> : !hasRent && !hasVacancy ? <Caption>{rent?.cells[0]?.note ?? vacancy?.cells[0]?.note ?? "이번 분기 주변 임대자료가 없어요."}</Caption> : <>
      <Caption>인근 조사상권 기준{rent?.cells[0]?.note ? ` · ${rent.cells[0].note}` : ""}{rent?.as_of ? ` · ${rent.as_of}` : ""}</Caption>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, marginTop: 10 }}>
        <Stat onGray big label="㎡당 월 임대료" value={hasRent ? `${Math.round((rent!.cells[0].value as number) * 1000).toLocaleString()}원` : "자료 없음"} missing={!hasRent}/>
        <Stat onGray big label="공실률" value={hasVacancy ? formatMetric(vacancy!.kind, vacancy!.cells[0].value) : "자료 없음"} missing={!hasVacancy}/>
      </div>
      {founderDraft && hasRent && (mine
        ? <div style={{ marginTop: 10 }}><Stat onGray label="내가 입력한 월세 단가" value={`${Math.round(mine.mine * 1000).toLocaleString()}원/㎡·월`} sub={mine.level === "similar" ? `참고값과 비슷해요 (${mine.diffPct > 0 ? "+" : ""}${mine.diffPct}%)` : `참고값보다 약 ${Math.abs(mine.diffPct)}% ${mine.level === "high" ? "높아요" : "낮아요"}`}/><Caption>관리비를 뺀 월세를 면적으로 나눈 값이에요. 층·면적·계약 조건에 따라 실제와 다를 수 있어요.</Caption></div>
        : <Caption>비용 계산에서 월세와 면적을 넣으면 이 임대료와 견줘 드려요.</Caption>)}
    </>}
  </Block>;
}

function OvState({ q }: { q: ReturnType<typeof useUnitOverview> }) {
  if (q.isError) return <Notice tone="error">조회 실패: {q.error.message} <button type="button" onClick={() => void q.refetch()}>다시 시도</button></Notice>;
  return <Notice tone="muted">불러오는 중...</Notice>;
}

/** 지표 이름 옆의 '?' — 범위(업종)·출처·기준 시점은 여기에 담고, 값 아래에 반복해서 적지 않는다. */
function MetricTip({ row, hint }: { row?: Row; hint?: string }) {
  if (!row && !hint) return null;
  return (
    <InfoTip label="범위·출처·기준 보기">
      {row?.scope && <><b>업종 범위</b> {row.scope}<br /></>}
      {row?.source && <><b>출처</b> {row.source}<br /></>}
      {hint && <><b>출처·기준</b> {hint}<br /></>}
      <b>기준</b> {row?.as_of ?? "기준 시점 없음"}
    </InfoTip>
  );
}

function Card({ row, label, hint }: { row: Row | undefined; label: string; hint?: string }) {
  const c = row?.cells[0];
  return <Stat big onGray label={<>{label} <MetricTip row={row} hint={hint} /></>} value={row ? formatMetric(row.kind, c?.value ?? null) : "자료 없음"} missing={c?.value == null} sub={c?.note} subTone={c && (c.partial || c.caution) ? "warn" : undefined} />;
}

/** 접힘 안의 점포 수 카드 — 점포당 매출·증감은 위 '핵심 숫자'에 있어 되풀이하지 않는다. perStore·yoy 를 주면 그 카드도 그린다(다른 화면용). */
function Summary({ stores, perStore, yoy }: { stores?: Row; perStore?: Row; yoy?: Row }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: perStore ? "1fr 1fr" : "1fr", gap: 8 }}>
        <Card row={stores} label="점포 수" hint={`소상공인 상가정보 ${stores?.as_of ?? ""}`} />
        {perStore && <Card row={perStore} label="점포당 월평균 추정매출" hint={`서울시 공개 자료(추정) · ${perStore.as_of ?? ""}`} />}
      </div>
      {yoy && <div style={{ marginTop: 8 }}><Card row={yoy} label="총매출 증감률(전년 동기·명목)" /></div>}
      <Caveat>점포당 매출은 서울시 추정치의 평균이며 개별 매장의 실제 매출이 아닙니다. 매출 증감률은 점포 수 변화가 섞인 총매출 증감이고 물가는 보정하지 않았습니다. 점포 수(상가정보)와 매출·추이의 점포 수(서울시)는 집계 기준이 달라 숫자가 같지 않습니다.</Caveat>
    </div>
  );
}

/** 지표 행 목록 — 값 옆에 업종 범위·출처·기준 시점·결측 사유를 붙인다. */
function Rows({ rows }: { rows: (Row | undefined)[] }) {
  return (
    <div>
      {rows.filter((r): r is Row => r !== undefined).map((r) => {
        const c = r.cells[0];
        return <StatRow key={r.key} label={<>{r.label} <MetricTip row={r} /></>} value={formatMetric(r.kind, c.value)} missing={c.value === null} note={c.note} noteTone={c.partial || c.caution ? "warn" : undefined} />;
      })}
    </div>
  );
}

/** 지도 업종 필터와 독립적으로 업종별 매출을 살펴본다. 세부 업종에 상위 값을 복제하지 않는다. */
function GrowthMenu({ level, code, svc, scls, overview, yoy }: { level: "dong" | "trdar"; code: string; svc: string | null; scls: string | null; overview: ReturnType<typeof useUnitOverview>; yoy?: Row }) {
  const categories = useFoodCategories();
  const groups = categories.data?.groups ?? [];
  const group = groups.find(g => g.svc_cd === svc);
  return <>
    <SubHead>{group?.svc_nm ?? "업종 전체"}</SubHead>
    {svc ? <SelectedIndustryGrowth level={level} code={code} name={group?.svc_nm ?? "선택 업종"} overview={overview} yoy={yoy}/> : overview.data ? <GrowthBlock ov={overview.data} yoy={yoy}/> : <OvState q={overview}/>}
    {scls && <Caption>매출은 {group?.svc_nm ?? "상위 업종"} 전체 기준입니다.</Caption>}
    {!svc && <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid #E5E7EB" }}>
      <SubHead>각 업종의 매출 흐름</SubHead>
      {categories.isPending && <Notice tone="muted">업종을 불러오는 중...</Notice>}
      {categories.isError && <Notice tone="error">업종을 불러오지 못했어요. <button type="button" onClick={() => void categories.refetch()}>다시 시도</button></Notice>}
      {groups.length > 0 && <IndustryComparisonGraphs level={level} code={code} groups={groups}/>}
    </div>}

  </>;
}

function SelectedIndustryGrowth({ level, code, name, overview, yoy }: { level: "dong" | "trdar"; code: string; name: string; overview: ReturnType<typeof useUnitOverview>; yoy?: Row }) {
  const overall = useUnitOverview(level, code, null, null);
  const overallCompare = useFoodCompare(level, [code], null, null);
  const quarters = [...new Set([...(overall.data?.trend.map(t => t.quarter) ?? []), ...(overview.data?.trend.map(t => t.quarter) ?? [])])].sort();
  const wholeYoy = overallCompare.data?.rows.find(r => r.key === "sales_yoy_pct");
  return <>
    <Block title="최근 증감" hint="총매출 · 전년 동기 대비">
      {overallCompare.isError ? <Notice tone="error">전체 업종 증감을 불러오지 못했어요. <button type="button" onClick={() => void overallCompare.refetch()}>다시 시도</button></Notice> : <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
        <Stat onGray big label={<>업종 전체 <MetricTip row={wholeYoy}/></>} value={overallCompare.isPending || overallCompare.isPlaceholderData ? "불러오는 중" : formatMetric("growth", wholeYoy?.cells[0]?.value ?? null)} missing={wholeYoy?.cells[0]?.value == null} sub={wholeYoy?.cells[0]?.note}/>
        <Stat onGray big label={<>{name} <MetricTip row={yoy}/></>} value={formatMetric("growth", yoy?.cells[0]?.value ?? null)} missing={yoy?.cells[0]?.value == null} sub={yoy?.cells[0]?.note}/>
      </div>}
    </Block>
    <Block title="점포당 월평균 추정매출 추이">
      {overall.isError ? <Notice tone="error">전체 업종 추이를 불러오지 못했어요. <button type="button" onClick={() => void overall.refetch()}>다시 시도</button></Notice> : overall.isPending ? <Notice tone="muted">전체 업종 추이를 불러오는 중...</Notice> : null}
      {overview.isError ? <OvState q={overview}/> : overview.isPending ? <Notice tone="muted">선택 업종 추이를 불러오는 중...</Notice> : null}
      {quarters.length > 0 && <LineChart labels={quarters.map(shortQuarter)} height={200} series={[
        { name: "업종 전체", color: "#94A3B8", values: quarters.map(q => overall.data?.trend.find(t => t.quarter === q)?.per_store_month ?? null) },
        { name, color: "#2563EB", values: quarters.map(q => overview.data?.trend.find(t => t.quarter === q)?.per_store_month ?? null) },
      ]} fmt={formatKrw}/>}
      <Caveat>두 선은 같은 지역 경계 기준입니다. 업종 전체는 외식 전체의 추정매출 합계를 점포 수로 나눈 값이고, 선택 업종은 해당 업종의 값입니다. 최근 증감은 점포당 매출이 아닌 총매출의 전년 동기 대비 변화입니다.</Caveat>
    </Block>
  </>;
}

const INDUSTRY_COLORS = ["#2563EB", "#D97706"];
function IndustryComparisonGraphs({ level, code, groups }: { level: "dong" | "trdar"; code: string; groups: { svc_cd: string; svc_nm: string }[] }) {
  const trends = useQueries({ queries: groups.map(g => ({ queryKey: ["unit-overview", level, code, g.svc_cd, null], queryFn: () => apiClient.getUnitOverview(level, code, g.svc_cd, null), staleTime: 10 * 60 * 1000 })) });
  const changes = useQueries({ queries: groups.map(g => ({ queryKey: ["food-compare", level, [code], g.svc_cd, null], queryFn: () => apiClient.getFoodCompare(level, [code], g.svc_cd, null), staleTime: 10 * 60 * 1000 })) });
  const overall = useUnitOverview(level, code, null, null);
  const [selected, setSelected] = useState<string[]>([groups[0].svc_cd]);
  const [limitNote, setLimitNote] = useState(false);
  const active = selected.map(code => ({ group: groups.find(g => g.svc_cd === code), index: groups.findIndex(g => g.svc_cd === code) })).filter(g => g.group !== undefined);
  const quarters = [...new Set([...(overall.data?.trend.map(t => t.quarter) ?? []), ...active.flatMap(g => trends[g.index].data?.trend.map(t => t.quarter) ?? [])])].sort();
  const loading = trends.some(q => q.isPending) || changes.some(q => q.isPending);
  const failed = trends.some(q => q.isError) || changes.some(q => q.isError);
  const ranked = groups.map((g, i) => ({ label: g.svc_nm, value: changes[i].data?.rows.find(r => r.key === "sales_yoy_pct")?.cells[0]?.value ?? null })).sort((a, b) => a.value === null ? (b.value === null ? a.label.localeCompare(b.label, "ko") : 1) : b.value === null ? -1 : b.value - a.value);
  const toggle = (code: string) => {
    if (selected.includes(code)) { setSelected(old => old.filter(x => x !== code)); setLimitNote(false); }
    else if (selected.length < 2) { setSelected(old => [...old, code]); setLimitNote(false); }
    else setLimitNote(true);
  };
  return <>
    {loading && <Notice tone="muted">업종별 매출을 불러오는 중...</Notice>}
    {failed && <Notice tone="warn">일부 업종을 불러오지 못했어요. <button type="button" onClick={() => { trends.filter(q => q.isError).forEach(q => void q.refetch()); changes.filter(q => q.isError).forEach(q => void q.refetch()); }}>다시 시도</button></Notice>}
    <Block title="업종별 최근 증감" hint="총매출 · 전년 동기 대비 · 증감률 높은 순">
      <BarList items={ranked.map(g => ({ ...g, color: g.value !== null && g.value >= 0 ? "#3B6BB5" : "#AB7358" }))} fmt={v => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`}/>
    </Block>
    <Block title="업종별 점포당 월평균 추정매출 추이">
      <Caption>전체 평균과 비교할 업종을 골라주세요. 최대 2개</Caption>
      <div aria-label="비교할 업종" style={{ display: "flex", flexWrap: "wrap", gap: 7, margin: "12px 0 16px" }}>
        {groups.map(g => { const on = selected.includes(g.svc_cd); return <button key={g.svc_cd} type="button" aria-pressed={on} onClick={() => toggle(g.svc_cd)} style={{ minHeight: 36, padding: "6px 10px", border: `1px solid ${on ? "#9CAEC9" : "#E5E7EB"}`, borderRadius: 18, background: on ? "#EAF0F9" : "white", color: on ? "#244570" : "#64748B", fontSize: FS.ui, fontWeight: on ? 700 : 500, cursor: "pointer" }}>{g.svc_nm}</button>; })}
      </div>
      {limitNote && <Caption tone="warn">다른 업종을 선택하려면 선택된 업종 하나를 해제해 주세요.</Caption>}
      {overall.isError && <Notice tone="warn">전체 평균을 불러오지 못했어요. <button type="button" onClick={() => void overall.refetch()}>다시 시도</button></Notice>}
      <LineChart labels={quarters.map(shortQuarter)} height={200} series={[
        { name: "전체 평균", color: "#94A3B8", values: quarters.map(q => overall.data?.trend.find(t => t.quarter === q)?.per_store_month ?? null) },
        ...active.map((g, i) => ({ name: g.group!.svc_nm, color: INDUSTRY_COLORS[i], values: quarters.map(q => trends[g.index].data?.trend.find(t => t.quarter === q)?.per_store_month ?? null) })),
      ]} fmt={formatKrw}/>
    </Block>
  </>;
}

function GrowthBlock({ ov, yoy }: { ov: NonNullable<ReturnType<typeof useUnitOverview>["data"]>; yoy?: Row }) {
  const labels = ov.trend.map((t) => shortQuarter(t.quarter));
  return (
    <>
      <Block title="최근 증감"><Rows rows={[yoy]} /></Block>
      <Block title={<>점포당 월평균 추정매출 추이 <InfoTip label="추이 범위·출처 보기"><b>업종 범위</b> {ov.trend_scope}<br /><b>출처</b> {ov.trend_source}<br /><b>기간</b> {ov.trend[0]?.label ?? ""}~{ov.trend.at(-1)?.label ?? ""}</InfoTip></>}>
        <LineChart labels={labels} series={[{ name: "점포당 월평균 추정매출", color: "#1D4ED8", values: ov.trend.map((t) => t.per_store_month) }]} fmt={(v) => formatKrw(v)} />
      </Block>
    </>
  );
}

/** 경쟁·개폐업 — 점포 수 증감·변동성과 점포 수 추이(서울시 분기 통계). 현재 점포 수(상가정보)와는 출처·시점이 달라 따로 둔다. */
function StoreChangeBlock({ ov, change }: { ov: NonNullable<ReturnType<typeof useUnitOverview>["data"]>; change?: Row }) {
  const labels = ov.trend.map((t) => shortQuarter(t.quarter));
  const partial = ov.trend.filter((t) => t.total > t.used).length;
  return (
    <>
      <SubHead>점포 수 변화 <InfoTip label="추이 범위·출처 보기"><b>업종 범위</b> {ov.trend_scope}<br /><b>출처</b> {ov.trend_source}<br />서울시 집계 점포 수라 위 '현재 점포 현황'(상가정보)과 다를 수 있습니다.</InfoTip></SubHead>
      <Rows rows={[change]} />
      <SubHead>점포 수 추이</SubHead>
      <LineChart labels={labels} series={[{ name: "점포 수", color: "#059669", values: ov.trend.map((t) => t.stores) }]} fmt={(v) => `${Math.round(v).toLocaleString()}곳`} />
      {partial > 0 && <Caption tone="warn">{partial}개 분기는 일부 업종의 매출·점포 수가 비어 그 업종을 뺀 값입니다(0 으로 채우지 않음).</Caption>}
    </>
  );
}

function DemandBlock({ ov, extra }: { ov: NonNullable<ReturnType<typeof useUnitOverview>["data"]>; extra?: ReactNode }) {
  const f = ov.floating;
  const sales = ov.hours;
  return (
    <>
      <Block title={<><AppIcon name="clock" /> 유동인구 시간대별 비중 <InfoTip label="유동인구 안내·집계 기준">이동 인구 추정치이며, 실제 고객·방문객 수와는 다릅니다.<br /><b>출처</b> 서울시 상권분석서비스(유동인구) · 시간대별 비중<br />{f && <><b>기준</b> {f.label}</>}</InfoTip></>}
        hint={f ? `이동 인구 추정치 · ${f.flpop === null ? "자료 없음" : `${Math.round(f.flpop).toLocaleString()}명(분기 합)`}${f.yoy_pct !== null ? ` · 전년 동기 ${f.yoy_pct > 0 ? "+" : ""}${f.yoy_pct}%` : ""}` : "이동 인구 추정치"}>
        {f ? <><BarList items={f.slots.map((s) => ({ label: s.label, value: s.pct, color: "#6366F1" }))} fmt={(v) => `${v}%`} />{extra}</>
          : <Notice tone="muted">이 지역의 유동인구 자료가 없어요(0이 아니라 자료가 없는 것이에요).</Notice>}
      </Block>
      <Block title={<><AppIcon name="clock" /> 시간대별 소비(매출 비중) <InfoTip label="시간대 소비 출처 보기"><b>출처</b> 서울시 상권분석서비스(추정매출) · {ov.trend_scope}<br /><b>기준</b> {sales.label} · 업종 {sales.total}개 중 {sales.used}개 반영(매출액 가중)</InfoTip></>}>
        {sales.slots.every((s) => s.pct === null)
          ? <Notice tone="muted">시간대별 매출 자료가 부족해요.</Notice>
          : <BarList items={sales.slots.map((s) => ({ label: s.label, value: s.pct, color: "#F59E0B" }))} fmt={(v) => `${v}%`} />}
      </Block>
    </>
  );
}

/** 매장 목록과 같은 조회를 공유하되, 구성은 50곳 페이지가 아닌 지역 전체 집계다. */
function CategoryMixBlock({ level, code, svc, scls }: { level: "dong" | "trdar"; code: string; svc: string | null; scls: string | null }) {
  const q = useFoodUnitStores(level, code, svc, scls, "distance");
  const data = q.data?.pages[0];
  const mix = data?.category_mix;
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? mix : mix?.slice(0, 3);
  return <Block title={<span className="data-heading"><AppIcon name="store"/>세부 업종 구성</span>}>
    {q.isPending && <Notice tone="muted">세부 업종 구성을 불러오는 중...</Notice>}
    {q.isError && !data && <Notice tone="error">업종 구성을 불러오지 못했어요. <button type="button" onClick={() => void q.refetch()}>다시 시도</button></Notice>}
    {data && data.total === 0 && <Notice tone="muted">선택한 조건에 해당하는 매장이 없습니다.</Notice>}
    {data && data.total > 0 && mix && <>
      <div style={{ display: "grid", gap: 14, marginTop: 14 }}>{shown?.map(item => <div key={item.code ?? item.name}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", fontSize: FS.body }}><span>{item.name}</span><span style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}><strong>{item.count.toLocaleString()}곳</strong><span style={{ color: "#6B7280", marginLeft: 10 }}>{item.share_pct.toFixed(1)}%</span></span></div>
        <div role="img" aria-label={`${item.name} ${item.count}곳, ${item.share_pct.toFixed(1)}%`} style={{ height: 8, background: "#E5E7EB", borderRadius: 4, marginTop: 7, overflow: "hidden" }}><div style={{ width: `${item.share_pct}%`, height: "100%", background: "#3159D9", borderRadius: 4 }}/></div>
      </div>)}</div>
      {mix.length > 3 && <div style={{ display: "flex", justifyContent: "center", marginTop: 10 }}><button type="button" onClick={() => setExpanded(v => !v)} aria-expanded={expanded} aria-label={expanded ? "업종 접기" : "업종 더보기"} title={expanded ? "접기" : "더보기"} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 40, height: 36, padding: 0, border: "none", borderRadius: 8, background: "transparent", color: "#6B7280", cursor: "pointer" }}><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={expanded ? "m6 15 6-6 6 6" : "m6 9 6 6 6-6"}/></svg></button></div>}

    </>}
  </Block>;
}

function NearbyBrandsBlock({ level, code, svc, scls }: { level: "dong" | "trdar"; code: string; svc: string | null; scls: string | null }) {
  const q = useAreaCharacter(level, code, svc, scls);
  return <Block title="근처 스타벅스·다이소·올리브영">
    {q.isPending && <Notice tone="muted">매장 수를 확인하는 중...</Notice>}
    {q.isError && <Notice tone="error">자료를 불러오지 못했어요. <button type="button" onClick={() => void q.refetch()}>다시 시도</button></Notice>}
    {q.data && <div className="nearby-brand-grid">
      {(["starbucks", "daiso", "oliveyoung"] as const).map(brand => {
        const label = { starbucks: "스타벅스", daiso: "다이소", oliveyoung: "올리브영" }[brand];
        const count = q.data.sections.anchor[brand]?.inside;
        return <div className="nearby-brand-card" key={brand}>
          <div className="nearby-brand-logo"><img src={`/brands/${brand}.png`} alt={label}/></div>
          <strong style={{ fontSize: FS.metric, fontVariantNumeric: "tabular-nums", color: count == null ? "#9CA3AF" : "#111827" }}>{count == null ? "자료 없음" : `${count.toLocaleString()}곳`}</strong>
        </div>;
      })}
    </div>}

    <Caveat>선택 지역 경계 안에 있는 브랜드 매장 수입니다. 선택 업종과 관계없이 집계하며, 지역 밖 매장은 포함하지 않습니다. 보유 브랜드 목록 기준으로 실제 영업 여부와 차이가 있을 수 있습니다. 올리브영은 소상공인 상가정보의 소매업 매장을 상호로 식별하고 같은 이름·주소 중복을 제외합니다.</Caveat>
  </Block>;
}
