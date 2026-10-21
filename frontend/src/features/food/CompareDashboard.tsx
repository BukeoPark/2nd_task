import { useQueries } from "@tanstack/react-query";
import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";
import { BarList, LineChart } from "../../components/MiniCharts";
import { InfoTip } from "../../components/InfoTip";
import { Notice } from "../../components/Notice";
import { apiClient, type FoodLevel, type UnitOverviewResponse } from "../../lib/apiClient";
import { compareHighlights } from "../../lib/compareHighlights";
import { compactPeriod, formatKrw, formatMetric, shortQuarter } from "../../lib/format";
import { useNarrow } from "../../lib/useNarrow";
import { ModalNav } from "../nav/ModalNav";
import { useOverlayBack } from "../nav/useOverlayBack";
import { viewState } from "../../lib/queryState";
import { SERIES_COLORS } from "../../lib/vizConfig";
import { CompareTable } from "./ComparePanel";
import { useFoodBubbles, useFoodCompare } from "./useFood";
import { CHART_GROUPS, KEY_ROWS } from "../../lib/compareLayout";
import { FS } from "../../lib/typography";

const UNIT_NOUN: Record<FoodLevel, string> = { gu: "자치구", dong: "행정동", trdar: "상권" };
const MAX_COMPARE = 4;
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
  const requestClose = useOverlayBack(onClose);
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
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="지역 비교" style={{ position: "fixed", inset: 0, zIndex: 1000, background: "#F3F4F6", overflowY: "auto", fontSize: FS.body }}>
      <div style={{ position: "sticky", top: 0, background: "white", borderBottom: "1px solid #E5E7EB", padding: "10px 20px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", zIndex: 1 }}>
        <ModalNav onBack={requestClose} />
        <strong style={{ fontSize: FS.screenTitle }}>{UNIT_NOUN[level]} 비교</strong>
        <span style={{ color: "#6B7280", fontSize: FS.warn }}>선택 업종: {filterName}</span>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginLeft: "auto", alignItems: "center" }}>
          {codes.map((c, i) => (
            <span key={c} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 4px 3px 10px", borderRadius: 999, border: `1px solid ${color(c)}`, color: color(c), fontWeight: 600 }}>
              {data?.units.find((u) => u.code === c)?.name ?? trends[i]?.data?.name ?? list.data?.bubbles.find((b) => b.code === c)?.name ?? c}
              {onShowOnMap && (() => {
                const b = list.data?.bubbles.find((x) => x.code === c);
                return b ? (
                  <button type="button" onClick={() => onShowOnMap({ level, code: c, lon: b.lon, lat: b.lat })} aria-label={`${b.name} 지도에서 보기`} style={{ border: "none", background: "none", color: "inherit", cursor: "pointer", fontSize: FS.warn, textDecoration: "underline", padding: "6px 4px", minHeight: 32 }}>지도에서 보기</button>
                ) : null;
              })()}
              <button type="button" onClick={() => onRemove(c)} aria-label="비교에서 삭제" style={{ border: "none", background: "none", color: "inherit", cursor: "pointer", fontSize: 18, padding: "4px 8px", minHeight: 32 }}>×</button>
            </span>
          ))}
          <select value="" disabled={codes.length >= MAX_COMPARE || options.length === 0} onChange={(e) => e.target.value && onAdd(e.target.value)} aria-label={`${UNIT_NOUN[level]} 추가`} style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #D1D5DB" }}>
            <option value="">{codes.length >= MAX_COMPARE ? `최대 ${MAX_COMPARE}곳` : `+ ${UNIT_NOUN[level]} 추가`}</option>
            {options.map((b) => <option key={b.code} value={b.code}>{b.name}{b.type ? ` (${b.type})` : ""}</option>)}
          </select>
        </div>
      </div>

      <div style={{ maxWidth: 1760, margin: "0 auto", padding: "16px 24px 32px", display: "flex", flexDirection: "column", gap: 14 }}>
        {canAddMore && suggestions.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", fontSize: FS.warn }}>
            <span style={{ color: "#4B5563" }}>최근 본 {UNIT_NOUN[level]}:</span>
            {suggestions.slice(0, MAX_COMPARE - codes.length).map((r) => (
              <button key={r.code} type="button" onClick={() => onAdd(r.code)} style={{ padding: "3px 10px", border: "1px solid #93C5FD", borderRadius: 999, background: "white", color: "#1D4ED8", cursor: "pointer", fontSize: FS.warn }}>
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
          <div style={{ opacity: stale ? 0.45 : 1, pointerEvents: stale ? "none" : "auto", display: "flex", flexDirection: "column", gap: 14 }}>
            {/* 맨 위: 지역별 핵심 지표(왼쪽) + 눈여겨볼 차이 3가지(오른쪽). 좁은 화면은 위아래로 쌓인다. */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 460px), 1fr))", gap: 14, alignItems: "start" }}>
              <Card title="지역별 핵심 지표" sub={`${filterName} · 같은 ${UNIT_NOUN[level]} 단위 · 지표마다 기준 기간이 다릅니다`}>
                <KeyTable data={data} color={color} />
              </Card>
              {highlights.length > 0 ? (
                <section aria-label="눈여겨볼 차이" style={cardStyle}>
                  <strong style={{ fontSize: FS.cardTitle }}>눈여겨볼 차이 {highlights.length}가지</strong>
                  <div style={{ fontSize: FS.warn, color: "#4B5563", margin: "2px 0 8px" }}>
                    담은 {data.units.length}곳 사이에서 값이 가장 크게 벌어진 지표예요. 어느 지역이 낫다는 뜻은 아니에요.
                  </div>
                  <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
                    {highlights.map((h) => (
                      <li key={h.key} style={{ background: "#F9FAFB", borderRadius: 10, padding: "10px 12px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 700, fontSize: FS.body }}>{h.label}</span>
                          <span style={{ fontWeight: 800, fontSize: FS.cardTitle, color: "#B45309" }}>{h.gap}</span>
                        </div>
                        <div style={{ display: "flex", gap: "2px 12px", flexWrap: "wrap", marginTop: 4, fontSize: FS.body }}>
                          {h.values.map((v) => {
                            const u = data.units.find((x) => x.name === v.name);
                            return <span key={v.name}><span aria-hidden="true" style={{ color: u ? color(u.code) : "#6B7280" }}>● </span>{v.name} <strong>{v.text}</strong></span>;
                          })}
                        </div>
                      </li>
                    ))}
                  </ul>
                  <details style={{ marginTop: 8, fontSize: FS.warn, color: "#4B5563" }}>
                    <summary style={{ cursor: "pointer", fontWeight: 600, minHeight: 32, display: "flex", alignItems: "center" }}>계산 기준 보기</summary>
                    <ul style={{ margin: "4px 0 0", paddingLeft: 18, lineHeight: 1.6, color: "#6B7280", fontSize: FS.caption }}>
                      <li>비율 지표는 3%p, 금액·인원은 25% 이상 차이 나는 것만 뽑아요.</li>
                      {highlights.map((h) => (
                        <li key={h.key}>{h.label}: 차이 = {h.basis} · {h.scope ? `${h.scope} · ` : ""}{h.asOf ?? "기준 시점 없음"}</li>
                      ))}
                    </ul>
                  </details>
                </section>
              ) : (
                <section aria-label="눈여겨볼 차이" style={cardStyle}>
                  <strong style={{ fontSize: FS.cardTitle }}>눈여겨볼 차이</strong>
                  <div style={{ fontSize: FS.warn, color: "#4B5563", marginTop: 4 }}>
                    {data.units.length < 2 ? "2곳 이상 담으면 값이 크게 벌어진 지표를 보여 드려요." : "뚜렷하게 벌어진 지표가 없습니다(비율은 3%p, 금액·인원은 25% 이상 차이만 뽑아요)."}
                  </div>
                </section>
              )}
            </div>
            {data.scope.notice && <Notice tone="warn">{data.scope.notice}</Notice>}

            <h2 style={{ fontSize: FS.cardTitle, margin: "6px 0 -4px" }}>상세 차트 — 같은 업종·같은 단위·표시된 기간끼리</h2>
            {trendable && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))", gap: 14 }}>
                <Card title="점포당 월평균 추정매출 추이" sub={`서울시 추정 · ${data.scope.sales_label} 기준`}>
                  <LineChart labels={quarters.map(shortQuarter)} series={trendSeries((r) => r.per_store_month)} fmt={formatKrw} height={180} />
                </Card>
                <Card title="점포 수 추이" sub={`서울시 상권분석서비스 · ${data.scope.sales_label} 기준`}>
                  <LineChart labels={quarters.map(shortQuarter)} series={trendSeries((r) => r.stores)} fmt={(v) => `${Math.round(v).toLocaleString()}곳`} height={180} />
                </Card>
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: 14 }}>
              {/* 상세 차트 묶음은 '매출'만 펼쳐 두고 나머지는 접어 둔다(길이를 줄이고, 필요한 묶음만 펼쳐 보게) */}
              {CHART_GROUPS.map((g, gi) => (
                <FoldCard key={g.title} title={g.title} open={gi === 0}>
                  {g.keys.map((k) => {
                    const row = data.rows.find((r) => r.key === k);
                    if (!row) return null;
                    return (
                      <div key={k} style={{ marginBottom: 12 }}>
                        <div style={{ fontWeight: 600, fontSize: FS.body }}>{row.label} <InfoTip label={`${row.label} 출처 보기`}><b>출처</b> {row.source}</InfoTip></div>
                        <div style={{ fontSize: FS.caption, color: "#6B7280", marginBottom: 4 }}>{row.scope ? `${row.scope} · ` : ""}{row.as_of ?? "기준 시점 없음"}</div>
                        <BarList items={data.units.map((u, i) => ({ label: u.name, value: row.cells[i]?.value ?? null, color: color(u.code), note: row.cells[i]?.note }))} fmt={(v) => formatMetric(row.kind, v)} />
                      </div>
                    );
                  })}
                </FoldCard>
              ))}
            </div>
            {/* 위 핵심 지표·상세 차트의 값을 모두 한 표로 모은 것 — 같은 값을 되풀이해 길어지므로 접어 둔다 */}
            <details style={cardStyle}>
              <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: FS.cardTitle, minHeight: 36, display: "flex", alignItems: "center" }}>전체 지표 표 보기</summary>
              <div style={{ marginTop: 8 }}><CompareTable data={data} onRemove={onRemove} /></div>
            </details>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

const cardStyle: CSSProperties = { background: "white", borderRadius: 12, padding: "14px 16px", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" };

/** 맨 위 표 — 열은 담은 지역(색 점), 행은 핵심 지표. 값 아래에 사유(표본 작음·원천에 없음)를 그대로 보인다. */
function KeyTable({ data, color }: { data: NonNullable<ReturnType<typeof useFoodCompare>["data"]>; color: (code: string) => string }) {
  const narrow = useNarrow();
  const rows = KEY_ROWS.map((k) => data.rows.find((r) => r.key === k)).filter((r): r is NonNullable<typeof r> => r !== undefined);
  // 좁은 화면에서 3곳 이상이면 열이 잘려 옆으로 밀어야 하므로, 지표마다 지역 값을 2열 목록으로 풀어 보인다(값·단위·기간은 그대로)
  if (narrow && data.units.length >= 3) {
    return (
      <div role="list" aria-label="지역별 핵심 지표">
        {rows.map((r) => (
          <div key={r.key} role="listitem" style={{ borderTop: "1px solid #F3F4F6", padding: "8px 0" }}>
            <div style={{ fontSize: FS.warn, fontWeight: 600 }}>{r.label} <span style={{ fontWeight: 400, color: "#6B7280", fontSize: FS.caption }}>· {r.as_of ? compactPeriod(r.as_of) : "기준 시점 없음"}</span></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 10px", marginTop: 3 }}>
              {data.units.map((u, i) => {
                const c = r.cells[i];
                return (
                  <div key={u.code} style={{ fontSize: FS.warn, minWidth: 0 }}>
                    <span aria-hidden="true" style={{ color: color(u.code) }}>● </span>{u.name}
                    <div style={{ fontWeight: 800, fontSize: FS.cardTitle, whiteSpace: "nowrap", color: c?.value == null ? "#9CA3AF" : "#111827" }}>{formatMetric(r.kind, c?.value ?? null)}</div>
                    {c?.note && <div style={{ fontSize: FS.caption, color: c.partial || c.caution ? "#B45309" : "#6B7280" }}>{c.note}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: FS.body }}>
        <thead>
          <tr>
            <th scope="col" style={{ textAlign: "left", padding: "4px 8px 6px 0", fontWeight: 600, color: "#4B5563", fontSize: FS.warn }}>지표 (기준 기간)</th>
            {data.units.map((u) => (
              <th key={u.code} scope="col" style={{ textAlign: "right", padding: "4px 0 6px 10px", whiteSpace: "nowrap" }}>
                <span aria-hidden="true" style={{ color: color(u.code) }}>● </span>{u.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} style={{ borderTop: "1px solid #F3F4F6" }}>
              <th scope="row" style={{ textAlign: "left", padding: narrow ? "5px 6px 5px 0" : "7px 8px 7px 0", fontWeight: 500, verticalAlign: "top", fontSize: narrow ? FS.caption : FS.warn }}>
                {r.label}
                <div style={{ fontSize: FS.caption, color: "#6B7280", fontWeight: 400, whiteSpace: narrow ? "nowrap" : undefined }}>{r.as_of ? (narrow ? compactPeriod(r.as_of) : r.as_of) : "기준 시점 없음"}</div>
              </th>
              {data.units.map((u, i) => {
                const c = r.cells[i];
                return (
                  <td key={u.code} style={{ textAlign: "right", padding: narrow ? "5px 0 5px 6px" : "7px 0 7px 10px", verticalAlign: "top" }}>
                    <div style={{ fontWeight: 800, fontSize: narrow ? FS.ui : FS.body, whiteSpace: "nowrap", color: c?.value == null ? "#9CA3AF" : "#111827" }}>{formatMetric(r.kind, c?.value ?? null)}</div>
                    {c?.note && <div style={{ fontSize: FS.caption, color: c.partial || c.caution ? "#B45309" : "#6B7280" }}>{c.note}</div>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FoldCard({ title, open, children }: { title: string; open?: boolean; children: ReactNode }) {
  return (
    <details open={open} style={cardStyle}>
      <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: FS.cardTitle, minHeight: 36, display: "flex", alignItems: "center" }}>{title}</summary>
      <div style={{ marginTop: 8 }}>{children}</div>
    </details>
  );
}

function Card({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section style={cardStyle}>
      <strong style={{ fontSize: FS.cardTitle }}>{title}</strong>
      {sub && <div style={{ fontSize: FS.warn, color: "#1D4ED8", marginBottom: 6 }}>{sub}</div>}
      <div style={{ marginTop: 8 }}>{children}</div>
    </section>
  );
}
