import { useQueries } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { BarList, LineChart } from "../../components/MiniCharts";
import { Notice } from "../../components/Notice";
import { apiClient, type FoodLevel, type UnitOverviewResponse } from "../../lib/apiClient";
import { compareHighlights } from "../../lib/compareHighlights";
import { formatKrw, formatMetric, shortQuarter } from "../../lib/format";
import { viewState } from "../../lib/queryState";
import { SERIES_COLORS } from "../../lib/vizConfig";
import { CompareTable } from "./ComparePanel";
import { useFoodBubbles, useFoodCompare } from "./useFood";

const UNIT_NOUN: Record<FoodLevel, string> = { gu: "자치구", dong: "행정동", trdar: "상권" };
const MAX_COMPARE = 4;
// 차트로 그릴 행 — 표(CompareTable)에는 모든 행이 있다. 종합점수·레이더는 만들지 않는다.
const CHART_GROUPS: { title: string; keys: string[] }[] = [
  { title: "매출·성장성", keys: ["per_store_month", "sales_yoy_pct", "stores_change_2y"] },
  { title: "점포 변동·개폐업", keys: ["stores_volatility", "open_rate_y", "close_rate_y", "frc_share"] },
  { title: "인구·수요", keys: ["wrc_total", "repop_total", "sales_per_10k_flpop"] },
  { title: "앵커·비용(참고값)", keys: ["starbucks_zone_share", "daiso_zone_share", "rent_small_shop", "vacancy_small_shop_pct"] },
];

interface Props {
  level: FoodLevel;
  codes: string[];
  svc: string | null;
  scls: string | null;
  filterName: string;
  onAdd: (code: string) => void;
  onRemove: (code: string) => void;
  onClose: () => void;
  /** 최근 본 같은 단위 지역 중 아직 담지 않은 곳 — 한 번 눌러 비교에 더한다 */
  suggestions?: { code: string; name: string; type: string | null }[];
  /** 비교 중인 지역을 지도에서 보여 준다(경계·위치가 확인된 지역에만 단추를 낸다). 없으면 단추를 내지 않는다 */
  onShowOnMap?: (p: { level: FoodLevel; code: string; lon: number; lat: number }) => void;
}

/** 전체 화면 지역 비교 — 같은 단위 2~4곳. 기존 /api/food/compare 값을 표와 차트로 보여주고, 추이는 단위별 overview 를 쓴다. */
export function CompareDashboard({ level, codes, svc, scls, filterName, onAdd, onRemove, onClose, suggestions = [], onShowOnMap }: Props) {
  const q = useFoodCompare(level, codes, svc, scls);
  const state = viewState({ isPending: q.isPending, isError: q.isError, isPlaceholderData: q.isPlaceholderData, hasData: q.data !== undefined });
  const list = useFoodBubbles(level, "stores", svc, scls);
  const options = [...(list.data?.bubbles ?? [])].filter((b) => !codes.includes(b.code)).sort((a, b) => a.name.localeCompare(b.name, "ko"));
  const stale = state === "refetching";
  const trendable = level !== "gu";
  const trends = useQueries({
    queries: codes.map((c) => ({
      queryKey: ["unit-overview", level, c, svc, scls],
      queryFn: () => apiClient.getUnitOverview(level as "dong" | "trdar", c, svc, scls),
      enabled: trendable,
      staleTime: 10 * 60 * 1000,
    })),
  });
  const data = q.data;
  const highlights = data && data.units.length >= 2 ? compareHighlights({ units: data.units, rows: data.rows }) : [];
  const canAddMore = codes.length < MAX_COMPARE;
  const color = (code: string) => SERIES_COLORS[codes.indexOf(code) % SERIES_COLORS.length];
  const quarters = trendable ? [...new Set(trends.flatMap((t) => t.data?.trend.map((r) => r.quarter) ?? []))].sort() : [];
  const trendSeries = (pick: (r: UnitOverviewResponse["trend"][number]) => number | null) =>
    codes.map((c, i) => {
      const t = trends[i]?.data;
      return { name: t?.name ?? c, color: color(c), values: quarters.map((qt) => { const r = t?.trend.find((x) => x.quarter === qt); return r ? pick(r) : null; }) };
    });
  return (
    <div role="dialog" aria-label="지역 비교" style={{ position: "fixed", inset: 0, zIndex: 100, background: "#F3F4F6", overflowY: "auto", fontSize: 13 }}>
      <div style={{ position: "sticky", top: 0, background: "white", borderBottom: "1px solid #E5E7EB", padding: "10px 20px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", zIndex: 1 }}>
        <button type="button" onClick={onClose} style={{ border: "1px solid #3B82F6", background: "white", color: "#3B82F6", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontWeight: 600 }}>← 지도로 돌아가기</button>
        <strong style={{ fontSize: 17 }}>{UNIT_NOUN[level]} 비교</strong>
        <span style={{ color: "#6B7280", fontSize: 12 }}>선택 업종: {filterName}</span>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginLeft: "auto", alignItems: "center" }}>
          {codes.map((c, i) => (
            <span key={c} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 4px 3px 10px", borderRadius: 999, border: `1px solid ${color(c)}`, color: color(c), fontWeight: 600 }}>
              {data?.units.find((u) => u.code === c)?.name ?? trends[i]?.data?.name ?? list.data?.bubbles.find((b) => b.code === c)?.name ?? c}
              {onShowOnMap && (() => {
                const b = list.data?.bubbles.find((x) => x.code === c);
                return b ? (
                  <button type="button" onClick={() => onShowOnMap({ level, code: c, lon: b.lon, lat: b.lat })} aria-label={`${b.name} 지도에서 보기`} style={{ border: "none", background: "none", color: "inherit", cursor: "pointer", fontSize: 11, textDecoration: "underline" }}>지도에서 보기</button>
                ) : null;
              })()}
              <button type="button" onClick={() => onRemove(c)} aria-label="비교에서 삭제" style={{ border: "none", background: "none", color: "inherit", cursor: "pointer", fontSize: 14 }}>×</button>
            </span>
          ))}
          <select value="" disabled={codes.length >= MAX_COMPARE || options.length === 0} onChange={(e) => e.target.value && onAdd(e.target.value)} aria-label={`${UNIT_NOUN[level]} 추가`} style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #D1D5DB" }}>
            <option value="">{codes.length >= MAX_COMPARE ? `최대 ${MAX_COMPARE}곳` : `+ ${UNIT_NOUN[level]} 추가`}</option>
            {options.map((b) => <option key={b.code} value={b.code}>{b.name}{b.type ? ` (${b.type})` : ""}</option>)}
          </select>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
        {canAddMore && suggestions.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", fontSize: 12 }}>
            <span style={{ color: "#4B5563" }}>최근 본 {UNIT_NOUN[level]}:</span>
            {suggestions.slice(0, MAX_COMPARE - codes.length).map((r) => (
              <button key={r.code} type="button" onClick={() => onAdd(r.code)} style={{ padding: "3px 10px", border: "1px solid #93C5FD", borderRadius: 999, background: "white", color: "#1D4ED8", cursor: "pointer", fontSize: 12 }}>
                + {r.name}{r.type ? ` (${r.type})` : ""}
              </button>
            ))}
          </div>
        )}
        {codes.length < 2 && <Notice tone="muted">한 곳만 담겨 있습니다. 위 '+ 추가'로 고르거나 지도로 돌아가 버블을 눌러 담으세요(2~{MAX_COMPARE}곳).</Notice>}
        {state === "loading" && <Notice tone="muted">비교 자료를 불러오는 중...</Notice>}
        {state === "error" && <Notice tone="error">비교 조회 실패: {q.error?.message} <button type="button" onClick={() => void q.refetch()}>다시 시도</button></Notice>}
        {stale && <Notice tone="warn">새 조건으로 다시 계산하는 중입니다. 아래는 이전 조건의 결과입니다.</Notice>}
        {data && (
          <div style={{ opacity: stale ? 0.45 : 1, pointerEvents: stale ? "none" : "auto", display: "flex", flexDirection: "column", gap: 16 }}>
            {highlights.length > 0 && (
              <section aria-label="차이가 큰 지표" style={{ background: "white", borderRadius: 12, padding: "14px 16px", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
                <strong style={{ fontSize: 14 }}>담은 {data.units.length}곳 사이에서 값이 크게 벌어진 지표 {highlights.length}개</strong>
                <div style={{ fontSize: 11, color: "#6B7280" }}>같은 업종({filterName})·같은 {UNIT_NOUN[level]} 단위·같은 기간끼리 견준 값입니다. 어느 지역이 낫다는 뜻이 아니라 값이 벌어진 정도예요.</div>
                <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
                  {highlights.map((h) => (
                    <li key={h.key} style={{ background: "#F9FAFB", borderRadius: 8, padding: "8px 10px" }}>
                      <div style={{ fontWeight: 600, fontSize: 12 }}>{h.label} <span style={{ color: "#B45309", fontWeight: 500 }}>· {h.gap}</span></div>
                      <div style={{ fontSize: 12 }}>가장 높음: {h.high.name} <strong>{h.high.text}</strong></div>
                      <div style={{ fontSize: 12 }}>가장 낮음: {h.low.name} <strong>{h.low.text}</strong></div>
                      <div style={{ fontSize: 10, color: "#6B7280" }}>{h.asOf ?? "기준 시점 없음"}</div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {data.scope.notice && <Notice tone="warn">{data.scope.notice}</Notice>}
            {trendable && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
                <Card title="점포당 월평균 추정매출 추이" sub={`서울시 추정 · ${data.scope.sales_label} 기준`}>
                  <LineChart labels={quarters.map(shortQuarter)} series={trendSeries((r) => r.per_store_month)} fmt={formatKrw} height={180} />
                </Card>
                <Card title="점포 수 추이" sub={`서울시 상권분석서비스 · ${data.scope.sales_label} 기준`}>
                  <LineChart labels={quarters.map(shortQuarter)} series={trendSeries((r) => r.stores)} fmt={(v) => `${Math.round(v).toLocaleString()}곳`} height={180} />
                </Card>
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
              {CHART_GROUPS.map((g) => (
                <Card key={g.title} title={g.title}>
                  {g.keys.map((k) => {
                    const row = data.rows.find((r) => r.key === k);
                    if (!row) return null;
                    return (
                      <div key={k} style={{ marginBottom: 12 }}>
                        <div style={{ fontWeight: 600, fontSize: 12 }}>{row.label}</div>
                        <div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 4 }}>{row.scope ? `${row.scope} · ` : ""}{row.source} · {row.as_of ?? "기준 시점 없음"}</div>
                        <BarList items={data.units.map((u, i) => ({ label: u.name, value: row.cells[i]?.value ?? null, color: color(u.code), note: row.cells[i]?.note }))} fmt={(v) => formatMetric(row.kind, v)} />
                      </div>
                    );
                  })}
                </Card>
              ))}
            </div>
            <Card title="전체 지표 표">
              <CompareTable data={data} onRemove={onRemove} />
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

function Card({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section style={{ background: "white", borderRadius: 12, padding: "14px 16px", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
      <strong style={{ fontSize: 14 }}>{title}</strong>
      {sub && <div style={{ fontSize: 11, color: "#1D4ED8", marginBottom: 6 }}>{sub}</div>}
      <div style={{ marginTop: 8 }}>{children}</div>
    </section>
  );
}
