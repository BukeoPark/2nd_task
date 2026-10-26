import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Notice, Section } from "../../components/Notice";
import { ScopeTag } from "../../components/ScopeTag";
import { glyphFor } from "../../lib/storeGlyph";
import { apiClient } from "../../lib/apiClient";
import { distanceLabel, groupByCategory, radiusBounds, withinRadius, type Competitor, type CompetitorSort } from "../../lib/competitors";
import { FS } from "../../lib/typography";

interface Props {
  storeId: string;
  storeName: string;
  defaultCategory?: string;
  concise?: boolean;
  center: { lon: number; lat: number };
  /** 서울시 외식 업종 코드 — 같은 업종 매장만 모은다. 대응이 없으면(null) 목록을 만들지 않는다 */
  svc: string | null;
  radius: number;
  onSelectStore: (id: string) => void;
  onHoverStore?: (id: string | null) => void;
  /** 지도를 그 매장 위치로 옮긴다(지도가 없으면 단추를 숨긴다) */
  onShowOnMap?: (c: Competitor) => void;
}

const PAGE = 10;
const STATUS_ROWS = 10;   // 영업 상태(인허가 기록)는 가까운 순으로 보이는 처음 몇 곳만 읽어 온다

/** 주변에 같은 업종 가게는 어디에 있을까? — 경쟁 매장 수 → 실제 목록(거리순·세부 업종별) → 지도 위치 → 운영이력·상세. 영업 상태는 인허가 기록 기준이며 현장 영업을 확인한 것이 아니다.
 * 리뷰·평점은 보이지 않는다(Google 고객평가는 매장 상세의 공식 구성요소로만 본다). */
export function CompetitorBlock({ storeId, storeName, center, svc, radius, defaultCategory, concise = false, onSelectStore, onHoverStore, onShowOnMap }: Props) {
  const [sort, setSort] = useState<CompetitorSort>("distance");
  const [category, setCategory] = useState<string>(defaultCategory ?? "");
  const [shown, setShown] = useState(PAGE);
  const bounds = useMemo(() => radiusBounds(center, radius), [center, radius]);
  const q = useQuery({
    queryKey: ["competitor-points", storeId, radius, svc],
    queryFn: () => apiClient.getFoodStores(bounds, svc, null),
    enabled: svc !== null,
    staleTime: 10 * 60 * 1000,
  });
  const all = useMemo(() => (q.data ? withinRadius(q.data.stores, center, radius, storeId) : []), [q.data, center, radius, storeId]);
  const categories = useMemo(() => groupByCategory(all), [all]);
  const filtered = category ? all.filter((c) => c.category === category) : all;
  const visible = sort === "distance" ? filtered.slice(0, shown) : filtered;
  const statusIds = (sort === "distance" ? visible : filtered.slice(0, STATUS_ROWS)).slice(0, STATUS_ROWS).map((c) => c.store_id);
  const details = useQueries({ queries: statusIds.map((id) => ({ queryKey: ["store", id], queryFn: () => apiClient.getStore(id), staleTime: 10 * 60 * 1000 })) });
  const statusOf = (id: string): string | null => {
    const i = statusIds.indexOf(id);
    if (i < 0) return null;
    const d = details[i];
    if (d.isPending) return "확인 중";
    return d.data?.operation_history.business_status?.label ?? "인허가 자료로 확인 안 됨";
  };
  const industry = glyphFor(svc).label;
  const truncated = q.data?.truncated ?? false;

  return (
    <Section title={`주변 ${industry} 가게 찾기`} scope={<ScopeTag kind="compete" label={`반경 ${radius}m`} />}>
      {svc === null ? (
        <Notice tone="muted">이 매장은 서울시 외식 10개 업종에 대응이 없어 같은 업종 목록을 만들지 않았어요(자료가 없는 것이지 0곳이 아닙니다).</Notice>
      ) : q.isPending ? (
        <Notice tone="muted">주변 같은 업종 가게를 찾는 중...</Notice>
      ) : q.isError ? (
        <Notice tone="error">목록을 불러오지 못했어요: {q.error.message} <button type="button" onClick={() => void q.refetch()}>다시 시도</button></Notice>
      ) : (
        <>
          <div style={{ fontSize: FS.body }}>
            반경 {radius}m · {category || `${industry} 전체`} <strong style={{ fontSize: FS.metric }}>{filtered.length.toLocaleString()}{truncated ? "곳 이상" : "곳"}</strong>
          </div>
          {!concise && categories.length > 1 && <div style={{ fontSize: FS.ui, color: "#374151", marginTop: 2 }}>세부 업종별: {categories.slice(0, 4).map((g) => `${g.category} ${g.items.length}곳`).join(" · ")}{categories.length > 4 ? " …" : ""}</div>}
          <div style={{ fontSize: FS.ui, color: "#4B5563", marginTop: 2 }}>
            <>상가정보 · 선택 매장 제외 · 직선거리{truncated ? " · 일부만 조회됨" : ""}</>
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", margin: "10px 0 6px" }}>
            {(["distance", "category"] as const).map((s) => (
              <button key={s} type="button" aria-pressed={sort === s} onClick={() => { setSort(s); setShown(PAGE); }} style={chip(sort === s)}>{s === "distance" ? "가까운 순" : "세부 업종별"}</button>
            ))}
            {categories.length > 1 && (
              <select aria-label="세부 업종으로 거르기" value={category} onChange={(e) => { setCategory(e.target.value); setShown(PAGE); }} style={{ padding: "3px 8px", borderRadius: 8, border: "1px solid #D1D5DB", fontSize: FS.ui }}>
                <option value="">세부 업종 전체 ({all.length})</option>
                {categories.map((g) => <option key={g.category} value={g.category}>{g.category} ({g.items.length})</option>)}
              </select>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", border: "2px solid #111827", borderRadius: 10, background: "#F9FAFB", fontSize: FS.body, marginBottom: 6 }}>
            <span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: "50%", background: "white", border: "2px solid #1D4ED8", boxShadow: "0 0 0 3px #111827", flexShrink: 0 }} />
            <span><strong>지금 보는 매장</strong> · {storeName}</span>
          </div>

          {filtered.length === 0 ? (
            <Notice tone="muted">조건에 맞는 같은 업종 가게가 반경 {radius}m 안에 없어요(조회는 정상).</Notice>
          ) : sort === "distance" ? (
            <>
              <ul style={list}>{visible.map((c) => <Row key={c.store_id} c={c} status={statusOf(c.store_id)} onSelectStore={onSelectStore} onHoverStore={onHoverStore} onShowOnMap={onShowOnMap} />)}</ul>
              {filtered.length > visible.length && <button type="button" onClick={() => setShown((n) => n + PAGE)} style={{ ...chip(false), marginTop: 6 }}>더 보기 ({filtered.length - visible.length}곳 남음)</button>}
            </>
          ) : (
            categories.filter((g) => !category || g.category === category).map((g) => (
              <div key={g.category} style={{ marginTop: 8 }}>
                <div style={{ fontSize: FS.ui, fontWeight: 700 }}>{g.category} · {g.items.length}곳</div>
                <ul style={list}>{g.items.slice(0, 5).map((c) => <Row key={c.store_id} c={c} status={statusOf(c.store_id)} onSelectStore={onSelectStore} onHoverStore={onHoverStore} onShowOnMap={onShowOnMap} />)}</ul>
                {g.items.length > 5 && <div style={{ fontSize: FS.ui, color: "#4B5563" }}>가까운 5곳만 보여요. '가까운 순'에서 모두 볼 수 있어요.</div>}
              </div>
            ))
          )}
          <div style={{ fontSize: FS.ui, color: "#4B5563", marginTop: 8, lineHeight: 1.6 }}>
            {`인허가 상태는 가까운 ${STATUS_ROWS}곳만 확인 · 실제 영업은 현장 확인`}
          </div>
        </>
      )}
    </Section>
  );
}

function Row({ c, status, onSelectStore, onHoverStore, onShowOnMap }: { c: Competitor; status: string | null; onSelectStore: (id: string) => void; onHoverStore?: (id: string | null) => void; onShowOnMap?: (c: Competitor) => void }) {
  return (
    <li onMouseEnter={() => onHoverStore?.(c.store_id)} onMouseLeave={() => onHoverStore?.(null)} onFocus={() => onHoverStore?.(c.store_id)} onBlur={() => onHoverStore?.(null)}
      style={{ border: "1px solid #E5E7EB", borderRadius: 12, padding: "12px 14px", background: "white" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
        <span style={{ fontSize: FS.body, fontWeight: 700 }}><span aria-hidden="true" style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", border: "2px solid #1D4ED8", marginRight: 6 }} />{c.name}{c.branch ? ` ${c.branch}` : ""}</span>
        <span style={{ fontSize: FS.body, fontWeight: 800, whiteSpace: "nowrap" }}>{distanceLabel(c.distance_m)}</span>
      </div>
      <div style={{ fontSize: FS.ui, color: "#4B5563" }}>{c.category}{status ? ` · ${status}` : ""}</div>
      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
        {onShowOnMap && <button type="button" onClick={() => onShowOnMap(c)} style={mini}>지도에서 보기</button>}
        <button type="button" onClick={() => onSelectStore(c.store_id)} style={mini}>운영이력·상세 ›</button>
      </div>
    </li>
  );
}

const list: React.CSSProperties = { listStyle: "none", margin: "4px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 6 };
const mini: React.CSSProperties = { padding: "7px 10px", minHeight: 38, border: "1px solid #BFDBFE", borderRadius: 6, background: "#EFF6FF", color: "#1E3A8A", fontSize: FS.ui, cursor: "pointer" };
const chip = (on: boolean): React.CSSProperties => ({ padding: "7px 12px", minHeight: 38, borderRadius: 999, border: on ? "1px solid #1D4ED8" : "1px solid #D1D5DB", background: on ? "#1D4ED8" : "white", color: on ? "white" : "#374151", fontSize: FS.ui, cursor: "pointer" });
