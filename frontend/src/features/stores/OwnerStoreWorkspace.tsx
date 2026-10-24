import { AppIcon, PopulationMix, MetricBars } from "../../components/DataVisuals";
import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Drawer } from "../../components/Drawer";
import { TabRail, type RailItem } from "../../components/TabRail";
import { apiClient, type StoreBasic } from "../../lib/apiClient";
import { recordSummary, noteMyStore } from "../../lib/monthlyCheck";
import type { StoreRecord } from "../../lib/myStoreStorage";
import type { GroupId } from "../../lib/panelGroups";
import { railPanelId, railTabId } from "../../lib/railIds";
import { RAIL_WIDTH_PX } from "../../lib/vizConfig";
import { useNarrow } from "../../lib/useNarrow";
import { useNearbyAnalysis, useLocationInfluence } from "./useStores";
import "./ownerWorkspace.css";
import { GoogleReviewSection } from "./GoogleReviewSection";

type Screen = "overview" | "records" | "nearby" | "area" | "info";
const titles: Record<Screen, [string, string]> = {
  overview: ["운영 요약", "우리 가게, 무엇부터 확인할까요?"], records: ["매출·비용", "매출과 비용을 함께 기록하세요"],
  nearby: ["주변 경쟁", "같은 업종의 가게부터 살펴보세요"], area: ["상권·수요", "주변 수요를 운영의 참고로 보세요"],
  info: ["매장 정보", "매장 기본 정보"],
};
const icons: Record<Screen, ReactNode> = {
  overview: <path d="M4 3h12v14H4zM7 7h6M7 10h6M7 13h3" />,
  records: <path d="M3 16h14M5 13V8M10 13V3M15 13V6" />,
  nearby: <><circle cx="10" cy="10" r="7"/><circle cx="10" cy="10" r="2"/></>,
  area: <path d="M3 6l5-3 4 3 5-2v11l-5 2-4-3-5 3z" />,
  info: <><circle cx="10" cy="10" r="7"/><path d="M10 9v5M10 6h.01"/></>,
};
const screens = Object.keys(titles) as Screen[];
const mapping: Record<Screen, GroupId> = { overview: "store", records: "mine", nearby: "radius", area: "area", info: "store" };
const man = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}만원`;
interface Props {
  store: StoreBasic; record: StoreRecord; blocks: Record<string, ReactNode>; radius: number; onRadius: (n: number) => void;
  onBack: () => void; onClose: () => void; onGroupChange: (g: GroupId) => void;
  onOpenArea: (level: "dong" | "trdar") => void;
  overlays: ReactNode;
}
export function OwnerStoreWorkspace({ store, record, blocks, radius, onRadius, onBack, onClose, onGroupChange, onOpenArea, overlays }: Props) {
  const narrow = useNarrow();
  const [googleVisited, setGoogleVisited] = useState(false);
  const [screen, setScreen] = useState<Screen>("overview");
  const [owned, setOwned] = useState(() => { try { return localStorage.getItem("ownerStore:v1") === store.store_id; } catch { return false; } });
  const [saveFailed, setSaveFailed] = useState(false);
  const nearby = useNearbyAnalysis(store.store_id, 500);
  const location = useLocationInfluence(store.store_id, 500);
  const benchmark = useQuery({ queryKey: ["sales-benchmark", store.store_id], queryFn: () => apiClient.getSalesBenchmark(store.store_id), staleTime: 600000 });
  const bench = benchmark.data?.status === "ok" ? benchmark.data : null;
  const sum = recordSummary(record, new Date());
  const go = (next: Screen) => { if (next === "info") setGoogleVisited(true); setScreen(next); onGroupChange(mapping[next]); };
  const toggleOwn = () => {
    try {
      if (owned) localStorage.removeItem("ownerStore:v1");
      else { localStorage.setItem("ownerStore:v1", store.store_id); noteMyStore({ storeId: store.store_id, name: store.name, dong: store.dong }, Date.now()); }
      setOwned(!owned); setSaveFailed(false);
    } catch { setSaveFailed(true); }
  };
  const items: RailItem[] = screens.map(id => ({ id, label: titles[id][0], icon: icons[id], fg: id === "nearby" ? "#BE123C" : "#244BDC", bg: id === "nearby" ? "#FFE4E6" : "#EDF2FF" }));
  const rail = (orientation: "vertical" | "horizontal") => <TabRail items={items} active={screen} onChange={id => go(id as Screen)} orientation={orientation} ariaLabel="자영업자 운영 점검" idPrefix="owner-" wrapLabels />;
  const count = nearby.data?.competitors?.raw_count;
  const growth = bench?.growth?.yoy.total_sales.value;
  return <>{!narrow && rail("vertical")}<Drawer title={`${store.name}${store.branch ? ` ${store.branch}` : ""}`} onBack={onBack} onClose={onClose} left={narrow ? 0 : RAIL_WIDTH_PX} titleAside={<button className="owner-designate" aria-pressed={owned} onClick={toggleOwn}>{owned ? "✓ 내 가게" : "내 가게로 설정"}</button>}>
    {overlays}<div className="owner-workspace store-detail">
    {narrow && rail("horizontal")}{saveFailed && <p role="alert">이 브라우저에서 내 가게 설정을 저장하지 못했어요.</p>}
    {screens.map(id => <div key={id} role="tabpanel" id={railPanelId(id, "owner-")} aria-labelledby={railTabId(id, "owner-")} hidden={screen !== id}>
      <header className="owner-page-heading" style={id === "nearby" ? {background:"#FFE4E6",borderColor:"#BE123C",color:"#BE123C"} : undefined}><span>{titles[id][0]}</span><h2>{titles[id][1]}</h2></header>
      {id === "overview" && <>
        <section className="owner-feature"><span className="owner-eyebrow">내 가게 기록 · 직접 입력</span><h3>{sum.latest ? `${sum.latest.month} 매출 ${man(sum.latest.value)}` : "이번 달 매출부터 기록해 보세요"}</h3><p>{sum.latest ? "기록한 매출과 비용을 확인하고, 다음 달에도 이어서 기록하세요." : "매출을 기록하고, 비용을 넣어 손익분기점을 확인하세요."}</p><button className="owner-primary" onClick={() => go("records")}>매출·비용 {sum.latest ? "확인하기" : "기록하기"} →</button></section>
        <h3 className="owner-section-title">기록 없이도 볼 수 있는 주변 상황</h3><div className="owner-stat-grid">
          <button className="owner-stat" onClick={() => go("nearby")}><span>반경 500m · {store.category.scls}</span><strong>{nearby.isError ? "조회 실패" : nearby.isPending ? "불러오는 중" : count == null ? "자료 없음" : `${count.toLocaleString()}곳`}</strong><small>상가정보 기준 · 선택 매장 제외</small><b>경쟁 매장 확인 →</b></button>
          <button className="owner-stat" onClick={() => go("area")}><span>{bench?.unit?.name ?? "소속 상권"} · {bench?.svc_nm ?? "대응 업종"} 전체</span><strong>{benchmark.isError ? "조회 실패" : benchmark.isPending ? "불러오는 중" : growth == null ? "자료 없음" : `${growth > 0 ? "+" : ""}${growth.toFixed(1)}%`}</strong><small>총매출 · {bench?.quarter_label ?? "집계 기간 확인 필요"} · 전년 동기 대비</small><b>상권 흐름 확인 →</b></button>
        </div>

      </>}
      {id === "records" && <>{blocks.checkup}<details className="owner-report"><summary>상권 평균 참고</summary>
        {bench ? <div className="owner-reference"><span className="owner-caption">{bench.unit?.name} · {bench.svc_nm} 전체 · {bench.quarter_label}</span><div className="owner-time-row"><span>점포당 월평균 추정매출</span><b>{bench.per_store_month == null ? "자료 없음" : man(bench.per_store_month / 10000)}</b></div><p className="owner-caption">{bench.stores ?? "자료 없는"}곳 평균 · 내 가게 실제 매출과는 달라요.</p><small className="owner-caption">출처: {bench.source.title}</small></div> : <p className="owner-caption">상권 매출 자료 없음</p>}
      </details></>}
      {id === "nearby" && <><section className="owner-radius"><label>분석 반경<select value={radius} onChange={e => onRadius(Number(e.target.value))}><option value={250}>250m</option><option value={500}>500m</option><option value={1000}>1km</option></select></label></section>{blocks.competitors}<details className="owner-report"><summary>연도별 개폐업</summary>{blocks["owner-churn"]}</details>{blocks["owner-location"]}</>}
      {id === "area" && <>
        <section className="owner-surface"><span className="owner-eyebrow">{location.data?.area.name ?? "소속 상권"} · 수요 구조</span><h3>{location.data?.area.demand_type ?? "인구 구조"}</h3><PopulationMix residents={location.data?.area.residents} workers={location.data?.area.workers} /><p className="owner-caption">상권 인구 통계 · 방문 고객 수와 다름</p></section>
        <section className="owner-surface"><span className="owner-eyebrow">{bench?.svc_nm ?? "대응 업종"} 전체 · {bench?.quarter_label ?? "자료 없음"}</span><h3 className="data-heading"><AppIcon name="trend" />상권 매출 흐름</h3><strong className="owner-value">{growth == null ? "자료 없음" : `${growth > 0 ? "+" : ""}${growth.toFixed(1)}%`}</strong><p className="owner-caption">전년 동기 대비 · 상권 추정매출</p></section>
        <section className="owner-surface"><h3 className="data-heading"><AppIcon name="clock" />시간대·요일별 유동인구 비중</h3>{location.data?.area.time_pattern ? <><span className="owner-caption">{location.data.area.time_pattern.quarter}</span><MetricBars items={location.data.area.time_pattern.items.map(item => ({ label: item.label, value: item.share, color: "#6864E9" }))} format={n => `${n.toFixed(1)}%`} rate /><p className="owner-caption">유동인구 기준 · 매출 비중과 다름</p></> : <p className="owner-caption">시간대 자료 없음</p>}</section>
        <div className="owner-area-links"><button onClick={() => onOpenArea("dong")}>{store.dong} 종합분석 →</button>{store.trdar && <button onClick={() => onOpenArea("trdar")}>{store.trdar.name} 상권 분석 →</button>}</div>
      </>}
      {id === "info" && <>{blocks.basic}{googleVisited && <GoogleReviewSection storeId={store.store_id} autoLoad />}<details className="owner-report"><summary>인허가·지정 이력</summary>{blocks.history}</details></>}
    </div>)}
    </div>
  </Drawer></>;
}
