import { useState, type ReactNode } from "react";
import { Drawer } from "../../components/Drawer";
import { BarList, LineChart } from "../../components/MiniCharts";
import { Notice, SourceNote } from "../../components/Notice";
import { InfoTip } from "../../components/InfoTip";
import type { ProgressKey } from "../../lib/flow";
import { RailHeading } from "../../components/RailHeading";
import { TabRail, type RailItem } from "../../components/TabRail";
import { Term } from "../../components/Term";
import type { FoodCompareResponse, FoodLevel, OverviewTrdar } from "../../lib/apiClient";
import { AREA_TAB_LABEL, AREA_TAB_STYLE, areaTabsFor, type AreaTabId } from "../../lib/areaTabs";
import { formatKrw, formatMetric, shortQuarter } from "../../lib/format";
import { railPanelId, railTabId } from "../../lib/railIds";
import { useNarrow } from "../../lib/useNarrow";
import { RAIL_WIDTH_PX } from "../../lib/vizConfig";
import { useFoodCompare, useUnitOverview } from "../food/useFood";
import { AreaReportModal } from "./AreaReportModal";
import { UnitStoreList } from "../food/UnitStoreList";
import { AreaCharacterSection } from "./AreaCharacterSection";

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
  onBack?: () => void;
  onClose: () => void;
  onSelectTrdar: (t: OverviewTrdar) => void;
  onSelectStore: (id: string) => void;
  /** 화면에서 일어난 일을 알린다(이용 순서 표시) */
  onProgress?: (k: ProgressKey) => void;
  /** 매장 목록 항목에 마우스·초점이 올라가면 그 id, 벗어나면 null — 지도의 같은 점 강조용 */
  onHoverStore?: (id: string | null) => void;
}

const RAIL_PREFIX = "area-";
const ICON: Record<AreaTabId, ReactNode> = {
  summary: <path d="M4 4h12v12H4zM7 8h6M7 12h4" />,
  character: <path d="M10 3a7 7 0 100 14 7 7 0 000-14zM10 6v4l3 2" />,
  growth: <path d="M3 15l5-5 3 3 6-7M12 6h5v5" />,
  stability: <path d="M10 3l6 2v5c0 4-3 6-6 7-3-1-6-3-6-7V5z" />,
  demand: (
    <>
      <circle cx="7" cy="7" r="2.5" />
      <circle cx="14" cy="8" r="2" />
      <path d="M2 16c0-3 2-5 5-5s5 2 5 5M12 16c0-2 1-3 3-3s3 1 3 3" />
    </>
  ),
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
  const row = (key: string): Row | undefined => cmp.data?.rows.find((r) => r.key === key);
  const unitKind = LEVEL_NOUN[p.level];
  const narrow = useNarrow();
  const [tab, setTab] = useState<AreaTabId>("summary");
  const [reportOpen, setReportOpen] = useState(false);
  const tabIds = areaTabsFor(p.level);
  const items: RailItem[] = tabIds.map((id) => ({ id, label: AREA_TAB_LABEL[id], icon: ICON[id], ...AREA_TAB_STYLE[id] }));
  const railProps = { items, active: tab, onChange: (id: string) => setTab(id as AreaTabId), ariaLabel: `${unitKind} 분석 항목`, idPrefix: RAIL_PREFIX };
  /** 레일 항목 하나의 내용 — 선택하지 않은 항목도 그려 두고 가리기만 해서 하위 컴포넌트의 상태·조회가 유지된다. */
  const pane = (id: AreaTabId, title: string, children: ReactNode) => (
    <div key={id} role="tabpanel" id={railPanelId(id, RAIL_PREFIX)} aria-labelledby={railTabId(id, RAIL_PREFIX)} hidden={tab !== id}>
      <div style={{ marginTop: 12, fontSize: 12, color: "#6B7280" }}>{p.title}{p.type ? ` · ${p.type}` : ""}</div>
      <div style={{ marginBottom: 8 }}><RailHeading fg={AREA_TAB_STYLE[id].fg} bg={AREA_TAB_STYLE[id].bg} title={title} /></div>
      {children}
    </div>
  );
  return (
    <>
    {!narrow && <TabRail {...railProps} orientation="vertical" />}
    <Drawer title={p.title} subtitle={`${p.type ? `${p.type} · ` : ""}${unitKind} 종합분석`} onBack={p.onBack} backLabel={`← ${p.parentName ?? "행정동"} 종합분석으로`} onClose={p.onClose} left={narrow ? 0 : RAIL_WIDTH_PX}>
      {cmp.isPending && <div style={{ marginTop: 10 }}><Notice tone="muted">종합분석을 불러오는 중...</Notice></div>}
      {cmp.isError && (
        <div style={{ marginTop: 10 }}>
          <Notice tone="error">지표 조회 실패: {cmp.error.message} <button type="button" onClick={() => void cmp.refetch()}>다시 시도</button></Notice>
        </div>
      )}

      {narrow && <div style={{ marginTop: 10 }}><TabRail {...railProps} orientation="horizontal" /></div>}

      {pane("summary", "요약", (
        <>
          <Notice tone="info">
            {p.level === "trdar"
              ? "이 상권 경계 안 점포·매출·유동인구로 계산한 값입니다. 행정동 통계를 가져다 쓰지 않았어요."
              : "행정동 전체 기준 값입니다. '세부 상권' 항목에서 상권을 누르면 그 상권 경계 기준으로 따로 분석합니다."}{" "}
            선택 업종: <strong>{p.filterName}</strong>
          </Notice>
          {cmp.data?.scope.notice && <div style={{ marginTop: 6 }}><Notice tone="warn">{cmp.data.scope.notice}</Notice></div>}
          {p.actions && <div style={{ marginTop: 10 }}>{p.actions}</div>}
          {cmp.data && <Summary stores={row("stores_sbiz")} perStore={row("per_store_month")} yoy={row("sales_yoy_pct")} />}
          <button
            type="button"
            data-tour="area-report-button"
            onClick={() => { setReportOpen(true); p.onProgress?.("report"); }}
            style={{ width: "100%", marginTop: 12, padding: "9px 12px", border: "none", borderRadius: 8, background: "#C2410C", color: "white", fontWeight: 700, fontSize: 13, cursor: "pointer", textAlign: "left" }}
          >
            {unitKind} 인사이트 리포트 뽑기
            <span style={{ display: "block", fontSize: 11, fontWeight: 500, opacity: 0.85 }}>예비 창업자용 4쪽 요약 · 인쇄·PDF 저장 가능</span>
          </button>
          {reportOpen && <AreaReportModal level={p.level} code={p.code} name={plainName(p.title, p.type)} type={p.type} svc={p.svc} scls={p.scls} onClose={() => setReportOpen(false)} />}
        </>
      ))}

      {pane("character", "유형·특성 — 교통·배후 수요·앵커·경쟁", <AreaCharacterSection level={p.level} code={p.code} svc={p.svc} scls={p.scls} unitKind={unitKind} />)}

      {cmp.data && pane("growth", "성장성 — 매출 추이·점포 수 증감",
        ov.data ? <GrowthBlock ov={ov.data} change={row("stores_change_2y")} yoy={row("sales_yoy_pct")} /> : <OvState q={ov} />)}
      {cmp.data && pane("stability", "안정성·경쟁 — 개폐업·변동성·프랜차이즈",
        <Rows rows={["open_rate_y", "close_rate_y", "stores_volatility", "frc_share"].map(row)} />)}
      {cmp.data && pane("demand", "소비 수요 — 유동·상주·직장인구, 시간대별 소비",
        <>
          <Rows rows={["wrc_total", "repop_total", "fac_total", "sales_per_10k_flpop"].map(row)} />
          {ov.data ? <DemandBlock ov={ov.data} /> : <OvState q={ov} />}
        </>)}
      {cmp.data && pane("location", "입지 — 앵커 브랜드·임대료·공실률",
        <>
          <Rows rows={["starbucks_zone_share", "daiso_zone_share"].map(row)} />
          <div style={{ marginTop: 8 }}><Notice tone="warn">임대료·공실률은 이 {unitKind}의 실제 값이 아니라, 가까운(1km 이내) R-ONE 조사상권의 <strong>참고값</strong>입니다.</Notice></div>
          <Rows rows={["rent_small_shop", "vacancy_small_shop_pct"].map(row)} />
        </>)}

      {p.level === "dong" && pane("trdars", `세부 상권 — 이 행정동과 겹치는 발달·골목상권${ov.data?.trdars ? ` (${ov.data.trdars.length})` : ""}`,
        ov.data?.trdars ? (
          <>
            {ov.data.trdars.length === 0 && <Notice tone="muted">겹치는 상권이 없습니다(조회는 정상).</Notice>}
            {ov.data.trdars.map((t) => (
              <button key={t.code} type="button" onClick={() => p.onSelectTrdar(t)}
                style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center", padding: "7px 10px", marginBottom: 4, border: "1px solid #E5E7EB", borderRadius: 8, background: "white", cursor: "pointer", textAlign: "left" }}>
                <span><strong>{t.name}</strong> <span style={{ fontSize: 11, color: "#6B7280" }}>{t.type}</span></span>
                <span style={{ fontSize: 11, color: "#6B7280" }}>경계 {t.overlap_pct}% 겹침 ›</span>
              </button>
            ))}
            <div style={{ fontSize: 11, color: "#9CA3AF" }}>{ov.data.trdars_basis}{ov.data.trdars_excluded ? ` · 그 미만 ${ov.data.trdars_excluded}곳 제외` : ""}. 겹침 % = 상권 면적 중 이 행정동 안에 든 비율.</div>
          </>
        ) : <OvState q={ov} />)}

      {pane("stores", `매장 목록 — 이 ${unitKind} 경계 안 매장`,
        <>
          <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 6 }}>아래는 개별 매장 목록입니다. 매장을 누르면 그 매장 고유 정보(고객평가·운영이력)로 넘어가며, 위의 상권 통계와는 별개입니다.</div>
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

function Card({ row, label, hint }: { row: Row | undefined; label: string; hint?: string }) {
  const c = row?.cells[0];
  return (
    <div style={{ background: "#F9FAFB", borderRadius: 8, padding: "8px 10px" }}>
      <div style={{ fontSize: 11, color: "#6B7280" }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 16, color: c?.value == null ? "#9CA3AF" : "#111827" }}>{row ? formatMetric(row.kind, c?.value ?? null) : "자료 없음"}</div>
      {row?.scope && <div style={{ fontSize: 10, fontWeight: 600, color: "#1D4ED8" }}>{row.scope}</div>}
      {(hint ?? row?.as_of) && <div style={{ fontSize: 10, color: "#9CA3AF" }}>출처·기준 <InfoTip label="출처·기준 보기">{hint ?? row?.as_of}</InfoTip></div>}
      {c?.note && <div style={{ fontSize: 10, color: c.partial || c.caution ? "#B45309" : "#9CA3AF" }}>{c.note}</div>}
    </div>
  );
}

function Summary({ stores, perStore, yoy }: { stores?: Row; perStore?: Row; yoy?: Row }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <Card row={stores} label="점포 수" hint={`소상공인 상가정보 ${stores?.as_of ?? ""}`} />
        <Card row={perStore} label="점포당 월평균 추정매출" hint={`서울시 공개 자료(추정) · ${perStore?.as_of ?? ""}`} />
      </div>
      <div style={{ marginTop: 8 }}><Card row={yoy} label="총매출 증감률(전년 동기·명목)" /></div>
      <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 4 }}>점포당 매출은 서울시 추정치의 평균이며 개별 매장의 실제 매출이 아닙니다. 매출 증감률은 점포 수 변화가 섞인 총매출 증감이고 물가는 보정하지 않았습니다. 점포 수(상가정보)와 매출·추이의 점포 수(서울시)는 집계 기준이 달라 숫자가 같지 않습니다.</div>
    </div>
  );
}

/** 지표 행 목록 — 값 옆에 업종 범위·출처·기준 시점·결측 사유를 붙인다. */
function Rows({ rows }: { rows: (Row | undefined)[] }) {
  return (
    <div>
      {rows.filter((r): r is Row => r !== undefined).map((r) => {
        const c = r.cells[0];
        return (
          <div key={r.key} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "5px 0", borderBottom: "1px solid #F3F4F6" }}>
            <div>
              <div>{r.label}</div>
              <div style={{ fontSize: 10, color: "#9CA3AF" }}>
                {r.scope ? `${r.scope} · ` : ""}출처·기준 <InfoTip label="출처·기준 보기"><b>출처</b> {r.source}<br /><b>기준</b> {r.as_of ?? "기준 시점 없음"}</InfoTip>
              </div>
              {c.note && <div style={{ fontSize: 10, color: c.partial || c.caution ? "#B45309" : "#9CA3AF" }}>{c.note}</div>}
            </div>
            <div style={{ fontWeight: 600, whiteSpace: "nowrap", color: c.value === null ? "#9CA3AF" : "#111827" }}>{formatMetric(r.kind, c.value)}</div>
          </div>
        );
      })}
    </div>
  );
}

function GrowthBlock({ ov, change, yoy }: { ov: NonNullable<ReturnType<typeof useUnitOverview>["data"]>; change?: Row; yoy?: Row }) {
  const labels = ov.trend.map((t) => shortQuarter(t.quarter));
  const partial = ov.trend.filter((t) => t.total > t.used).length;
  return (
    <div>
      <Rows rows={[yoy, change]} />
      <div style={{ fontSize: 12, fontWeight: 600, margin: "10px 0 2px" }}>점포당 월평균 추정매출 추이 <span style={{ color: "#1D4ED8", fontSize: 10 }}>{ov.trend_scope}</span></div>
      <LineChart labels={labels} series={[{ name: "점포당 월평균 추정매출", color: "#1D4ED8", values: ov.trend.map((t) => t.per_store_month) }]} fmt={(v) => formatKrw(v)} />
      <div style={{ fontSize: 12, fontWeight: 600, margin: "10px 0 2px" }}>점포 수 추이 <span style={{ color: "#1D4ED8", fontSize: 10 }}>{ov.trend_scope}</span></div>
      <LineChart labels={labels} series={[{ name: "점포 수", color: "#059669", values: ov.trend.map((t) => t.stores) }]} fmt={(v) => `${Math.round(v).toLocaleString()}곳`} />
      <SourceNote title={ov.trend_source} reference={`${ov.trend[0]?.label ?? ""}~${ov.trend.at(-1)?.label ?? ""}`} />
      <div style={{ fontSize: 10, color: "#9CA3AF" }}>이 추이의 점포 수는 서울시 집계라 위 요약의 점포 수(상가정보)와 다릅니다.</div>
      {partial > 0 && <div style={{ fontSize: 10, color: "#B45309" }}>{partial}개 분기는 일부 업종의 매출·점포 수가 비어 그 업종을 뺀 값입니다(0 으로 채우지 않음).</div>}
    </div>
  );
}

function DemandBlock({ ov }: { ov: NonNullable<ReturnType<typeof useUnitOverview>["data"]> }) {
  const f = ov.floating;
  const sales = ov.hours;
  return (
    <div>
      {f ? (
        <>
          <div style={{ fontSize: 12, fontWeight: 600, margin: "10px 0 4px" }}><Term id="floatingIndex" label="유동인구" /> {f.flpop === null ? "자료 없음" : `${Math.round(f.flpop).toLocaleString()}명(분기 합)`}{f.yoy_pct !== null && ` · 전년 동기 ${f.yoy_pct > 0 ? "+" : ""}${f.yoy_pct}%`}</div>
          <BarList items={f.slots.map((s) => ({ label: s.label, value: s.pct, color: "#6366F1" }))} fmt={(v) => `${v}%`} />
          <SourceNote title="서울시 상권분석서비스(유동인구) · 시간대별 비중" reference={f.label} />
        </>
      ) : <div style={{ marginTop: 8 }}><Notice tone="muted">이 단위의 유동인구 자료가 원천에 없습니다(0 이 아님).</Notice></div>}
      <div style={{ fontSize: 12, fontWeight: 600, margin: "12px 0 4px" }}>시간대별 소비(매출 비중)</div>
      {sales.slots.every((s) => s.pct === null)
        ? <Notice tone="muted">시간대 비중이 모두 확인되는 업종 행이 없어 계산하지 않았습니다(자료 없음).</Notice>
        : <BarList items={sales.slots.map((s) => ({ label: s.label, value: s.pct, color: "#F59E0B" }))} fmt={(v) => `${v}%`} />}
      <SourceNote title={`서울시 상권분석서비스(추정매출) · ${ov.trend_scope}`} reference={`${sales.label} · 업종 ${sales.total}개 중 ${sales.used}개 반영(매출액 가중)`} />
    </div>
  );
}
