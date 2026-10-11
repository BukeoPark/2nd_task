import type { ReactNode } from "react";
import { Drawer } from "../../components/Drawer";
import { BarList, LineChart } from "../../components/MiniCharts";
import { Notice, SourceNote } from "../../components/Notice";
import type { FoodCompareResponse, FoodLevel, OverviewTrdar } from "../../lib/apiClient";
import { formatKrw, formatMetric, shortQuarter } from "../../lib/format";
import { useFoodCompare, useUnitOverview } from "../food/useFood";
import { UnitStoreList } from "../food/UnitStoreList";

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
}

/** 행정동·상권 종합분석 — 핵심 요약을 먼저 보이고 상세 지표는 접어 두며, 매장 목록은 맨 마지막이다. 값은 단위 자신의 경계·표로 계산한 것이다. */
export function AreaOverviewPanel(p: Props) {
  const level: FoodLevel = p.level;
  const cmp = useFoodCompare(level, [p.code], p.svc, p.scls);
  const ov = useUnitOverview(p.level, p.code, p.svc, p.scls);
  const row = (key: string): Row | undefined => cmp.data?.rows.find((r) => r.key === key);
  const unitKind = LEVEL_NOUN[p.level];
  return (
    <Drawer title={p.title} subtitle={`${p.type ? `${p.type} · ` : ""}${unitKind} 종합분석`} onBack={p.onBack} onClose={p.onClose}>
      {p.onBack && <div style={{ fontSize: 11, color: "#6B7280", marginTop: -6, marginBottom: 8 }}>← {p.parentName ?? "행정동"} 종합분석으로</div>}
      <Notice tone="info">
        {p.level === "trdar"
          ? "이 상권 경계 안 점포·매출·유동인구로 계산한 값입니다. 행정동 통계를 가져다 쓰지 않았어요."
          : "행정동 전체 기준 값입니다. 아래 '세부 상권'을 누르면 그 상권 경계 기준으로 따로 분석합니다."}{" "}
        선택 업종: <strong>{p.filterName}</strong>
      </Notice>
      {cmp.data?.scope.notice && <div style={{ marginTop: 6 }}><Notice tone="warn">{cmp.data.scope.notice}</Notice></div>}
      {p.actions && <div style={{ marginTop: 10 }}>{p.actions}</div>}
      {cmp.isPending && <div style={{ marginTop: 10 }}><Notice tone="muted">종합분석을 불러오는 중...</Notice></div>}
      {cmp.isError && (
        <div style={{ marginTop: 10 }}>
          <Notice tone="error">지표 조회 실패: {cmp.error.message} <button type="button" onClick={() => void cmp.refetch()}>다시 시도</button></Notice>
        </div>
      )}

      {cmp.data && (
        <>
          <Summary stores={row("stores_sbiz")} perStore={row("per_store_month")} yoy={row("sales_yoy_pct")} />

          <Fold title="성장성 — 매출 추이·점포 수 증감">
            {ov.data ? <GrowthBlock ov={ov.data} change={row("stores_change_2y")} yoy={row("sales_yoy_pct")} /> : <OvState q={ov} />}
          </Fold>
          <Fold title="안정성·경쟁 — 개폐업·변동성·프랜차이즈">
            <Rows rows={["open_rate_y", "close_rate_y", "stores_volatility", "frc_share"].map(row)} />
          </Fold>
          <Fold title="소비 수요 — 유동·상주·직장인구, 시간대별 소비">
            <Rows rows={["wrc_total", "repop_total", "fac_total", "sales_per_10k_flpop"].map(row)} />
            {ov.data ? <DemandBlock ov={ov.data} /> : <OvState q={ov} />}
          </Fold>
          <Fold title="입지 — 앵커 브랜드·임대료·공실률">
            <Rows rows={["starbucks_zone_share", "daiso_zone_share"].map(row)} />
            <div style={{ marginTop: 8 }}><Notice tone="warn">임대료·공실률은 이 {unitKind}의 실제 값이 아니라, 가까운(1km 이내) R-ONE 조사상권의 <strong>참고값</strong>입니다.</Notice></div>
            <Rows rows={["rent_small_shop", "vacancy_small_shop_pct"].map(row)} />
          </Fold>
        </>
      )}

      {p.level === "dong" && (
        <Fold title={`세부 상권 — 이 행정동과 겹치는 발달·골목상권${ov.data?.trdars ? ` (${ov.data.trdars.length})` : ""}`} open>
          {ov.data?.trdars ? (
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
          ) : <OvState q={ov} />}
        </Fold>
      )}

      <Fold title={`매장 목록 — 이 ${unitKind} 경계 안 매장`} open>
        <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 6 }}>아래는 개별 매장 목록입니다. 매장을 누르면 그 매장 고유 정보(고객평가·운영이력)로 넘어가며, 위의 상권 통계와는 별개입니다.</div>
        <UnitStoreList level={level} code={p.code} svc={p.svc} scls={p.scls} filterName={p.filterName} onSelect={p.onSelectStore} />
      </Fold>
    </Drawer>
  );
}

function Fold({ title, open, children }: { title: string; open?: boolean; children: ReactNode }) {
  return (
    <details open={open} style={{ borderTop: "1px solid #E5E7EB", marginTop: 12, paddingTop: 10 }}>
      <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 14, marginBottom: 8 }}>{title}</summary>
      {children}
    </details>
  );
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
      <div style={{ fontSize: 10, color: "#9CA3AF" }}>{hint ?? row?.as_of}</div>
      {c?.note && <div style={{ fontSize: 10, color: c.partial ? "#B45309" : "#9CA3AF" }}>{c.note}</div>}
    </div>
  );
}

function Summary({ stores, perStore, yoy }: { stores?: Row; perStore?: Row; yoy?: Row }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <Card row={stores} label="점포 수" hint={`소상공인 상가정보 ${stores?.as_of ?? ""}`} />
        <Card row={perStore} label="점포당 추정 월매출" hint={`서울시 추정 · ${perStore?.as_of ?? ""}`} />
      </div>
      <div style={{ marginTop: 8 }}><Card row={yoy} label="매출 증감률(전년 동기)" /></div>
      <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 4 }}>점포당 매출은 서울시 추정치의 상권 평균이며 개별 매장의 실제 매출이 아닙니다. 점포 수(상가정보)와 매출(서울시)은 출처·업종 범위가 다릅니다.</div>
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
              <div style={{ fontSize: 10, color: "#9CA3AF" }}>{r.scope ? `${r.scope} · ` : ""}{r.source} · {r.as_of ?? "기준 시점 없음"}</div>
              {c.note && <div style={{ fontSize: 10, color: c.partial ? "#B45309" : "#9CA3AF" }}>{c.note}</div>}
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
      <div style={{ fontSize: 12, fontWeight: 600, margin: "10px 0 2px" }}>점포당 월평균 매출 추이 <span style={{ color: "#1D4ED8", fontSize: 10 }}>{ov.trend_scope}</span></div>
      <LineChart labels={labels} series={[{ name: "점포당 월매출", color: "#1D4ED8", values: ov.trend.map((t) => t.per_store_month) }]} fmt={(v) => formatKrw(v)} />
      <div style={{ fontSize: 12, fontWeight: 600, margin: "10px 0 2px" }}>점포 수 추이 <span style={{ color: "#1D4ED8", fontSize: 10 }}>{ov.trend_scope}</span></div>
      <LineChart labels={labels} series={[{ name: "점포 수", color: "#059669", values: ov.trend.map((t) => t.stores) }]} fmt={(v) => `${Math.round(v).toLocaleString()}곳`} />
      <SourceNote title={ov.trend_source} reference={`${ov.trend[0]?.label ?? ""}~${ov.trend.at(-1)?.label ?? ""}`} />
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
          <div style={{ fontSize: 12, fontWeight: 600, margin: "10px 0 4px" }}>유동인구 {f.flpop === null ? "자료 없음" : `${Math.round(f.flpop).toLocaleString()}명(분기 합)`}{f.yoy_pct !== null && ` · 전년 동기 ${f.yoy_pct > 0 ? "+" : ""}${f.yoy_pct}%`}</div>
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
