import { useRef, useState, type CSSProperties } from "react";
import { useQueries } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { LineChart } from "../../components/MiniCharts";
import { InfoTip } from "../../components/InfoTip";
import { Notice } from "../../components/Notice";
import { apiClient, type FoodCompareResponse, type FoodLevel, type UnitOverviewResponse } from "../../lib/apiClient";
import { compareConclusion } from "../../lib/compareConclusion";
import { formatKrw, formatMetric, shortQuarter } from "../../lib/format";
import { ModalNav } from "../nav/ModalNav";
import { useOverlayBack } from "../nav/useOverlayBack";
import { viewState } from "../../lib/queryState";
import { SERIES_COLORS } from "../../lib/vizConfig";
import { useFoodBubbles, useFoodCompare } from "./useFood";
import { KEY_ROWS } from "../../lib/compareLayout";
import { FS } from "../../lib/typography";
import "./compareDashboard.css";

const NOUN: Record<FoodLevel, string> = { gu: "자치구", dong: "행정동", trdar: "상권" };
const views = { summary: "핵심 비교", trends: "변화 추이", all: "전체 지표" } as const;
interface Props {
  level: FoodLevel; codes: string[]; svc: string | null; scls: string | null; filterName: string;
  onAdd: (code: string) => void; onRemove: (code: string) => void; onClose: () => void;
  suggestions?: { code: string; name: string; type: string | null }[];
  onShowOnMap?: (p: { level: FoodLevel; code: string; lon: number; lat: number }) => void;
  onReviewCosts?: (units: FoodCompareResponse["units"]) => void;
}

/** 결론 → 근거 → 비용 확인. 핵심 표·추이·전체 표는 별도 화면으로 보여 반복을 줄인다. */
export function CompareDashboard({ level, codes, svc, scls, filterName, onAdd, onRemove, onClose, suggestions = [], onShowOnMap, onReviewCosts }: Props) {
  const requestClose = useOverlayBack(onClose);
  const surface = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<keyof typeof views>("summary");
  const [category, setCategory] = useState("전체");
  const q = useFoodCompare(level, codes, svc, scls);
  const state = viewState({ isPending: q.isPending, isError: q.isError, isPlaceholderData: q.isPlaceholderData, hasData: q.data !== undefined });
  const list = useFoodBubbles(level, "stores", svc, scls);
  const options = (list.data?.bubbles ?? []).filter(b => !codes.includes(b.code)).sort((a, b) => a.name.localeCompare(b.name, "ko"));
  const trends = useQueries({ queries: codes.map(code => ({
    queryKey: ["unit-overview", level, code, svc, scls],
    queryFn: () => apiClient.getUnitOverview(level as "dong" | "trdar", code, svc, scls),
    enabled: level !== "gu" && view === "trends", staleTime: 600000,
  })) });
  const data = q.data;
  const conclusion = data ? compareConclusion(data) : null;
  const color = (code: string) => SERIES_COLORS[codes.indexOf(code) % SERIES_COLORS.length];
  const quarters = [...new Set(trends.flatMap(t => t.data?.trend.map(r => r.quarter) ?? []))].sort();
  const series = (pick: (r: UnitOverviewResponse["trend"][number]) => number | null) => codes.map((code, i) => ({
    name: data?.units.find(u => u.code === code)?.name ?? code, color: color(code),
    values: quarters.map(qt => { const r = trends[i]?.data?.trend.find(t => t.quarter === qt); return r ? pick(r) : null; }),
  }));
  const style = { "--cmp-body": `${FS.input}px`, "--cmp-small": `${FS.ui}px`, "--cmp-title": `${FS.screenTitle}px`, "--cmp-section": `${FS.cardTitle}px`, "--cmp-value": `${FS.metric}px` } as CSSProperties;
  const groups = data ? [...new Set(data.rows.map(r => r.group))] : [];
  const rows = data ? view === "summary" ? KEY_ROWS.flatMap(key => data.rows.filter(r => r.key === key)) : data.rows.filter(r => category === "전체" || r.group === category) : [];
  return createPortal(<div role="dialog" aria-modal="true" aria-label="지역 비교" className="compare-workspace" style={style} ref={surface}>
    <header className="cmp-toolbar">
      <ModalNav onBack={requestClose} /><strong>{NOUN[level]} 비교</strong><span className="cmp-muted">{filterName}</span>
      <div className="cmp-regions">{codes.map((code, i) => {
        const unit = data?.units.find(u => u.code === code);
        const b = list.data?.bubbles.find(x => x.code === code);
        const name = unit?.name ?? trends[i]?.data?.name ?? b?.name ?? code;
        return <div key={code} className="cmp-region"><span className="cmp-dot" style={{ background: color(code) }} /><b>{name}</b>
          {b && onShowOnMap && <button onClick={() => onShowOnMap({ level, code, lon: b.lon, lat: b.lat })} aria-label={`${name} 지도에서 보기`}>지도</button>}
          <button onClick={() => onRemove(code)} aria-label={`${name} 비교에서 삭제`}>×</button></div>;
      })}<select aria-label={`${NOUN[level]} 추가`} value="" disabled={codes.length >= 4 || options.length === 0} onChange={e => e.target.value && onAdd(e.target.value)}><option value="">{codes.length >= 4 ? "최대 4곳" : "+ 지역 추가"}</option>{options.map(b => <option key={b.code} value={b.code}>{b.name}</option>)}</select></div>
    </header>
    <main className="cmp-content">
      {state === "loading" && <Notice tone="muted">비교 자료를 불러오는 중…</Notice>}
      {state === "error" && <Notice tone="error">자료를 불러오지 못했어요. <button onClick={() => void q.refetch()}>다시 시도</button></Notice>}
      {state === "refetching" && <Notice tone="warn">새 조건으로 계산 중 · 아래는 이전 결과입니다.</Notice>}
      {data && conclusion && <div aria-busy={state === "refetching"} style={{ opacity: state === "refetching" ? 0.45 : 1, pointerEvents: state === "refetching" ? "none" : undefined }}>
        <section className={view === "summary" ? "cmp-verdict" : "cmp-verdict cmp-verdict-compact"} aria-label="비교 결론"><span className="cmp-eyebrow">비교 결론 · {filterName}</span><h1>{conclusion.title}</h1><p>{conclusion.reading}</p>
          <div className="cmp-evidence">{conclusion.evidence.slice(0, 2).map(e => <div key={e.label}><b>{e.label}</b><span>{e.text}</span><small>{e.period}</small></div>)}</div>
          <div className="cmp-next"><div><b>다음은 실제 점포 비용을 확인하세요</b><p>{conclusion.next}</p></div>{onReviewCosts && <button className="cmp-primary" onClick={() => onReviewCosts(data.units)}>후보별 비용 점검 →</button>}</div>
        </section>
        <div className="cmp-tabs" role="tablist" aria-label="비교 자료 보기">{Object.entries(views).map(([key, label]) => <button key={key} role="tab" id={`cmp-tab-${key}`} aria-controls="cmp-view" aria-selected={view === key} onClick={() => { setView(key as keyof typeof views); surface.current?.scrollTo({ top: 0 }); }}>{label}</button>)}</div>
        <section id="cmp-view" role="tabpanel" aria-labelledby={`cmp-tab-${view}`}>
          {view !== "trends" ? <div className="cmp-sheet"><div className="cmp-sheet-heading"><div><h2>{view === "summary" ? "선택을 가르는 핵심 숫자" : "전체 지표 비교"}</h2><span className="cmp-muted">{filterName} · 같은 {NOUN[level]} 단위</span></div>{view === "all" && <label>지표 분류<select value={category} onChange={e => setCategory(e.target.value)}><option>전체</option>{groups.map(g => <option key={g}>{g}</option>)}</select></label>}</div>
            <ComparisonTable data={data} rows={rows} color={color} />
            {data.scope.notice && <p className="cmp-footnote">점포 수는 상가정보, 매출·개폐업은 서울시 외식 업종 집계입니다. <InfoTip label="집계 업종 차이">{data.scope.notice}</InfoTip></p>}
          </div> : <div className="cmp-trend-grid">
            {level === "gu" ? <p>자치구의 추이 자료는 제공되지 않습니다.</p> : trends.some(t => t.isPending) ? <p>추이 자료를 불러오는 중…</p> : <>
              <section className="cmp-sheet cmp-trend"><h2>점포당 월평균 추정매출</h2><p className="cmp-muted">서울시 추정 · {data.scope.sales_label}</p>{trends.some(t => t.isError) && <p role="alert">일부 지역의 추이를 불러오지 못했어요.</p>}<LineChart labels={quarters.map(shortQuarter)} series={series(r => r.per_store_month)} fmt={formatKrw} height={160} /></section>
              <section className="cmp-sheet cmp-trend"><h2>등록 점포 수 변화</h2><p className="cmp-muted">서울시 점포 통계 · {data.scope.sales_label}</p><LineChart labels={quarters.map(shortQuarter)} series={series(r => r.stores)} fmt={n => `${Math.round(n).toLocaleString()}곳`} height={160} /></section>
            </>}
          </div>}
        </section>
        {codes.length < 4 && suggestions.length > 0 && <div className="cmp-suggestions"><span>최근 본 지역 추가</span>{suggestions.slice(0, 4 - codes.length).map(r => <button key={r.code} onClick={() => onAdd(r.code)}>+ {r.name}</button>)}</div>}
      </div>}
    </main>
  </div>, document.body);
}

function ComparisonTable({ data, rows, color }: { data: FoodCompareResponse; rows: FoodCompareResponse["rows"]; color: (code: string) => string }) {
  const hasDifference = data.units.length === 2;
  const diff = (r: FoodCompareResponse["rows"][number]) => {
    const [a, b] = r.cells;
    if (a?.value == null || b?.value == null || a.partial || b.partial || a.caution || b.caution) return "—";
    const n = a.value - b.value;
    if (Math.abs(n) < 0.00001) return "같음";
    return r.kind === "rate" || r.kind === "growth" ? `${n > 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}%p` : `${n > 0 ? "+" : "−"}${formatMetric(r.kind, Math.abs(n))}`;
  };
  return <div className="cmp-table-wrap"><table className="cmp-table"><colgroup><col style={{ width: hasDifference ? "34%" : "30%" }} />{data.units.map(u => <col key={u.code} />)}{hasDifference && <col style={{ width: "17%" }} />}</colgroup><thead><tr><th scope="col">비교 항목</th>{data.units.map(u => <th key={u.code} scope="col"><span className="cmp-dot" style={{ background: color(u.code) }} />{u.name}</th>)}{hasDifference && <th scope="col">차이 <InfoTip label="차이 계산 기준">{data.units[0].name} − {data.units[1].name}. 비율은 %p 차이입니다.</InfoTip></th>}</tr></thead><tbody>
    {rows.map(r => <tr key={r.key}><th scope="row"><div>{r.key === "stores_sbiz" ? "등록 점포 수" : r.label} <InfoTip label={`${r.label} 기준`}><div style={{ fontSize: FS.ui, lineHeight: 1.6 }}><b>{r.source}</b><p>{r.scope} · {r.as_of ?? "기간 미제공"}</p>{r.basis && <p>{r.basis}</p>}</div></InfoTip></div><span className="cmp-period">{r.as_of ?? "기간 미제공"}</span></th>{data.units.map((u, i) => { const c = r.cells[i];return <td key={u.code}><span className={c?.value == null ? "cmp-missing" : "cmp-number"}>{formatMetric(r.kind, c?.value ?? null)}</span>{c?.note && <InfoTip label={`${u.name} ${r.label} 참고`}>{c.note}</InfoTip>}{(c?.partial || c?.caution) && <span className="cmp-cell-warning">{c.partial ? "일부 집계" : "표본 주의"}</span>}</td>;})}{hasDifference && <td className="cmp-difference">{diff(r)}</td>}</tr>)}
  </tbody></table></div>;
}
