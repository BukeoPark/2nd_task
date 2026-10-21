import { useState, type ReactNode } from "react";
import { Drawer } from "../../components/Drawer";
import { BarList, LineChart } from "../../components/MiniCharts";
import { Fold, Notice } from "../../components/Notice";
import { Caveat, NoteHost, NoteSlot } from "../../components/NoteHost";
import { InfoTip } from "../../components/InfoTip";
import type { Mode } from "../../lib/mode";
import { RailHeading } from "../../components/RailHeading";
import { TabRail, type RailItem } from "../../components/TabRail";
import { Term } from "../../components/Term";
import type { FoodCompareResponse, FoodLevel, OverviewTrdar } from "../../lib/apiClient";
import { AREA_QUESTION, AREA_TAB_LABEL, AREA_TAB_STYLE, areaTabsFor, type AreaTabId } from "../../lib/areaTabs";
import { formatKrw, formatMetric, shortQuarter } from "../../lib/format";
import { railPanelId, railTabId } from "../../lib/railIds";
import { useNarrow } from "../../lib/useNarrow";
import { RAIL_WIDTH_PX } from "../../lib/vizConfig";
import { useAreaCharacter, useFoodCompare, useUnitOverview } from "../food/useFood";
import { AreaReportModal } from "./AreaReportModal";
import { SummaryTypeBadge, SummaryTypeContext, SummaryTypeInsights } from "./SummaryType";
import { AreaBriefCard } from "./AreaBriefCard";
import { Block, Caption, ListRow, Stat, StatRow } from "../../components/PanelKit";
import { CostCheckLauncher } from "./CostCheckSection";
import { CostCheckModal } from "./CostCheckModal";
import { unitSampleStores } from "../../lib/interpretRules";
import { buildAreaBrief, type BriefTarget } from "../../lib/areaBrief";
import { UnitStoreList } from "../food/UnitStoreList";
import { AreaTraitsSection } from "./AreaCharacterSection";
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
  traits: <path d="M5 5h10M5 10h10M5 15h6" />,
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
  const pane = (id: AreaTabId, title: string, children: ReactNode, opts: { scoped?: boolean; manualNotes?: boolean } = {}) => (
    <div key={id} role="tabpanel" id={railPanelId(id, RAIL_PREFIX)} aria-labelledby={railTabId(id, RAIL_PREFIX)} hidden={tab !== id}>
      <div style={{ marginTop: 12, marginBottom: 8 }}>
        <RailHeading fg={AREA_TAB_STYLE[id].fg} bg={AREA_TAB_STYLE[id].bg} title={AREA_QUESTION[id][p.mode]} hint={opts.scoped ? `업종 범위: ${p.filterName}` : undefined} />
        {id !== "summary" && <div style={{ fontSize: FS.caption, color: "#6B7280", marginTop: 4 }}>자세히: {title}</div>}
      </div>
      <NoteHost manual={opts.manualNotes}>{children}</NoteHost>
    </div>
  );
  return (
    <>
    {!narrow && <TabRail {...railProps} orientation="vertical" />}
    <Drawer title={p.title} titleAside={character.data ? <SummaryTypeBadge data={character.data} /> : undefined} subtitle={`${p.type ? `${p.type} · ` : ""}${unitKind} 종합분석`} onBack={p.onBack} backLabel={p.backLabel ?? `← ${p.parentName ?? "행정동"} 종합분석으로`} onClose={p.onClose} left={narrow ? 0 : RAIL_WIDTH_PX}>
      {cmp.isPending && <div style={{ marginTop: 10 }}><Notice tone="muted">종합분석을 불러오는 중...</Notice></div>}
      {cmp.isError && (
        <div style={{ marginTop: 10 }}>
          <Notice tone="error">지표 조회 실패: {cmp.error.message} <button type="button" onClick={() => void cmp.refetch()}>다시 시도</button></Notice>
        </div>
      )}

      {narrow && <div style={{ marginTop: 10 }}><TabRail {...railProps} orientation="horizontal" /></div>}

      {pane("summary", "요약", (
        <>
          {character.isPending && <Notice tone="muted">지역 유형을 불러오는 중...</Notice>}
          {character.isError && <Notice tone="error">지역 유형을 불러오지 못했어요. <button type="button" onClick={() => void character.refetch()}>다시 시도</button></Notice>}
          {character.data && <SummaryTypeContext data={character.data} />}
          {brief && <AreaBriefCard brief={brief} onAction={onBriefAction} insights={character.data ? <SummaryTypeInsights data={character.data} canInterpret={!brief.hold} /> : undefined} />}
          {brief && (
            <button
              type="button"
              data-tour="area-report-button"
              onClick={() => setReportOpen(true)}
              style={{ width: "100%", marginTop: 12, minHeight: 56, padding: "12px 14px", border: "1px solid #D1D5DB", borderRadius: 10, background: "white", color: "#374151", fontWeight: 700, fontSize: FS.body, cursor: "pointer", textAlign: "left" }}
            >
              상권분석 보고서 보기 ›
              <span style={{ display: "block", fontSize: FS.warn, fontWeight: 500, opacity: 0.92, marginTop: 2 }}>
                {unitKind} 전체 · {p.mode === "owner" ? "내 매장 주변 경쟁·상권 변화·고객 수요" : "매출 흐름·경쟁·입지·확인사항"} · 지역 보고서 · 인쇄·PDF 저장
              </span>
            </button>
          )}
          {p.notice && <div style={{ marginTop: 10 }}>{p.notice}</div>}
          <Fold title="그 밖의 작업 — 지도에서 보기 · 내 관심 지역">
            {p.actions}
          </Fold>
          {/* 지표 카드·기준 안내와 읽는 법·유의사항은 접이식 하나로 모은다(요약에 접이식이 셋이던 것을 둘로) */}
          <NoteSlot label="기준·읽는 법 자세히">
            {cmp.data && <Summary stores={row("stores_sbiz")} perStore={row("per_store_month")} yoy={row("sales_yoy_pct")} />}
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

      {pane("traits", "특성 — 교통·배후 수요·앵커·경쟁", <AreaTraitsSection level={p.level} code={p.code} svc={p.svc} scls={p.scls} unitKind={unitKind} />, { scoped: true })}

      {cmp.data && pane("growth", "성장성 — 매출 추이·점포 수 증감",
        ov.data ? <GrowthBlock ov={ov.data} change={row("stores_change_2y")} yoy={row("sales_yoy_pct")} /> : <OvState q={ov} />, { scoped: true })}
      {cmp.data && pane("stability", "안정성·경쟁 — 개폐업·변동성·프랜차이즈",
        <Block title="개폐업·점포 변동·프랜차이즈"><Rows rows={["open_rate_y", "close_rate_y", "stores_volatility", "frc_share"].map(row)} /></Block>, { scoped: true })}
      {cmp.data && pane("demand", "소비 수요 — 유동·상주·직장인구, 시간대별 소비",
        <>
          <Notice tone="info">유동인구는 지나가는 사람 수예요. 이 지역에 오는 손님이나 방문객 수가 아니에요.</Notice>
          <Block title="인구·집객시설"><Rows rows={["wrc_total", "repop_total", "fac_total", "sales_per_10k_flpop"].map(row)} /></Block>
          {ov.data ? <DemandBlock ov={ov.data} /> : <OvState q={ov} />}
        </>, { scoped: true })}
      {cmp.data && pane("location", "입지 — 앵커 브랜드·임대료·공실률",
        <>
          <Block title="앵커 브랜드 근처 매장 비율"><Rows rows={["starbucks_zone_share", "daiso_zone_share"].map(row)} /></Block>
          <Block title="임대료·공실률(참고값)">
            <Notice tone="warn">임대료·공실률은 이 {unitKind}의 실제 값이 아니라, 가까운(1km 이내) R-ONE 조사상권의 <strong>참고값</strong>입니다.</Notice>
            <Rows rows={["rent_small_shop", "vacancy_small_shop_pct"].map(row)} />
          </Block>
        </>, { scoped: true })}

      {p.mode === "founder" && pane("cost", "창업 비용 점검 — 내가 넣은 값으로 계산",
        <CostCheckLauncher unitKey={`${p.level}:${p.code}`} unitWord={unitWord} benchWon={row("per_store_month")?.cells[0]?.value ?? null} onOpen={() => setCostOpen(true)} />)}
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

function Summary({ stores, perStore, yoy }: { stores?: Row; perStore?: Row; yoy?: Row }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <Card row={stores} label="점포 수" hint={`소상공인 상가정보 ${stores?.as_of ?? ""}`} />
        <Card row={perStore} label="점포당 월평균 추정매출" hint={`서울시 공개 자료(추정) · ${perStore?.as_of ?? ""}`} />
      </div>
      <div style={{ marginTop: 8 }}><Card row={yoy} label="총매출 증감률(전년 동기·명목)" /></div>
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

function GrowthBlock({ ov, change, yoy }: { ov: NonNullable<ReturnType<typeof useUnitOverview>["data"]>; change?: Row; yoy?: Row }) {
  const labels = ov.trend.map((t) => shortQuarter(t.quarter));
  const partial = ov.trend.filter((t) => t.total > t.used).length;
  return (
    <>
      <Block title="최근 증감"><Rows rows={[yoy, change]} /></Block>
      <Block title={<>점포당 월평균 추정매출 추이 <InfoTip label="추이 범위·출처 보기"><b>업종 범위</b> {ov.trend_scope}<br /><b>출처</b> {ov.trend_source}<br /><b>기간</b> {ov.trend[0]?.label ?? ""}~{ov.trend.at(-1)?.label ?? ""}</InfoTip></>}>
        <LineChart labels={labels} series={[{ name: "점포당 월평균 추정매출", color: "#1D4ED8", values: ov.trend.map((t) => t.per_store_month) }]} fmt={(v) => formatKrw(v)} />
      </Block>
      <Block title={<>점포 수 추이 <InfoTip label="추이 범위·출처 보기"><b>업종 범위</b> {ov.trend_scope}<br /><b>출처</b> {ov.trend_source}<br />서울시 집계 점포 수라 요약의 점포 수(상가정보)와 다를 수 있습니다.</InfoTip></>}>
        <LineChart labels={labels} series={[{ name: "점포 수", color: "#059669", values: ov.trend.map((t) => t.stores) }]} fmt={(v) => `${Math.round(v).toLocaleString()}곳`} />
        {partial > 0 && <Caption tone="warn">{partial}개 분기는 일부 업종의 매출·점포 수가 비어 그 업종을 뺀 값입니다(0 으로 채우지 않음).</Caption>}
      </Block>
    </>
  );
}

function DemandBlock({ ov }: { ov: NonNullable<ReturnType<typeof useUnitOverview>["data"]> }) {
  const f = ov.floating;
  const sales = ov.hours;
  return (
    <>
      <Block title={<><Term id="floatingIndex" label="유동인구" /> 시간대별 비중 <InfoTip label="유동인구 출처 보기"><b>출처</b> 서울시 상권분석서비스(유동인구) · 시간대별 비중<br />{f && <><b>기준</b> {f.label}</>}</InfoTip></>}
        hint={f ? `${f.flpop === null ? "자료 없음" : `${Math.round(f.flpop).toLocaleString()}명(분기 합)`}${f.yoy_pct !== null ? ` · 전년 동기 ${f.yoy_pct > 0 ? "+" : ""}${f.yoy_pct}%` : ""}` : undefined}>
        {f ? <BarList items={f.slots.map((s) => ({ label: s.label, value: s.pct, color: "#6366F1" }))} fmt={(v) => `${v}%`} />
          : <Notice tone="muted">이 지역의 유동인구 자료가 없어요(0이 아니라 자료가 없는 것이에요).</Notice>}
      </Block>
      <Block title={<>시간대별 소비(매출 비중) <InfoTip label="시간대 소비 출처 보기"><b>출처</b> 서울시 상권분석서비스(추정매출) · {ov.trend_scope}<br /><b>기준</b> {sales.label} · 업종 {sales.total}개 중 {sales.used}개 반영(매출액 가중)</InfoTip></>}>
        {sales.slots.every((s) => s.pct === null)
          ? <Notice tone="muted">시간대 비중이 모두 확인되는 업종 행이 없어 계산하지 않았습니다(자료 없음).</Notice>
          : <BarList items={sales.slots.map((s) => ({ label: s.label, value: s.pct, color: "#F59E0B" }))} fmt={(v) => `${v}%`} />}
      </Block>
    </>
  );
}
