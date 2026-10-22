import { useEffect, useState, type ReactNode } from "react";
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
import { MonthlyCheckModal } from "./MonthlyCheckModal";
import "./ownerWorkspace.css";

type Screen = "overview" | "records" | "nearby" | "area" | "monthly" | "info";
const titles: Record<Screen, [string, string]> = {
  overview: ["운영 요약", "우리 가게, 무엇부터 확인할까요?"], records: ["매출·비용", "매출과 비용을 함께 기록하세요"],
  nearby: ["주변 경쟁", "같은 업종의 가게부터 살펴보세요"], area: ["상권·수요", "주변 수요를 운영의 참고로 보세요"],
  monthly: ["이번 달 점검", "이번 달 운영 점검"], info: ["매장 정보", "매장 기본 정보"],
};
const icons: Record<Screen, ReactNode> = {
  overview: <path d="M4 3h12v14H4zM7 7h6M7 10h6M7 13h3" />,
  records: <path d="M3 16h14M5 13V8M10 13V3M15 13V6" />,
  nearby: <><circle cx="10" cy="10" r="7"/><circle cx="10" cy="10" r="2"/></>,
  area: <path d="M3 6l5-3 4 3 5-2v11l-5 2-4-3-5 3z" />,
  monthly: <><rect x="3" y="4" width="14" height="13" rx="2"/><path d="M6 2v4M14 2v4M6 11l3 3 5-5"/></>,
  info: <><circle cx="10" cy="10" r="7"/><path d="M10 9v5M10 6h.01"/></>,
};
const screens = Object.keys(titles) as Screen[];
const mapping: Record<Screen, GroupId> = { overview: "store", records: "mine", nearby: "radius", area: "area", monthly: "mine", info: "store" };
const man = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}만원`;
interface Props {
  store: StoreBasic; record: StoreRecord; blocks: Record<string, ReactNode>; radius: number; onRadius: (n: number) => void;
  onBack: () => void; onClose: () => void; onGroupChange: (g: GroupId) => void;
  onReport: () => void; onAreaReport?: () => void; monthlyOpen: boolean; onMonthlyOpenChange?: (v: boolean) => void; overlays: ReactNode;
}
export function OwnerStoreWorkspace({ store, record, blocks, radius, onRadius, onBack, onClose, onGroupChange, onReport, onAreaReport, monthlyOpen, onMonthlyOpenChange, overlays }: Props) {
  const narrow = useNarrow();
  const [screen, setScreen] = useState<Screen>("overview");
  const [owned, setOwned] = useState(() => { try { return localStorage.getItem("ownerStore:v1") === store.store_id; } catch { return false; } });
  const [saveFailed, setSaveFailed] = useState(false);
  const nearby = useNearbyAnalysis(store.store_id, 500);
  const location = useLocationInfluence(store.store_id, 500);
  const benchmark = useQuery({ queryKey: ["sales-benchmark", store.store_id], queryFn: () => apiClient.getSalesBenchmark(store.store_id), staleTime: 600000 });
  const bench = benchmark.data?.status === "ok" ? benchmark.data : null;
  const sum = recordSummary(record, new Date());
  const go = (next: Screen) => { setScreen(next); onGroupChange(mapping[next]); };
  // External monthly-check requests from the map toolbar select this workspace screen.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { if (monthlyOpen) { setScreen("monthly"); onGroupChange("mine"); onMonthlyOpenChange?.(false); } }, [monthlyOpen, onGroupChange, onMonthlyOpenChange]);
  const toggleOwn = () => {
    try {
      if (owned) localStorage.removeItem("ownerStore:v1");
      else { localStorage.setItem("ownerStore:v1", store.store_id); noteMyStore({ storeId: store.store_id, name: store.name, dong: store.dong }, Date.now()); }
      setOwned(!owned); setSaveFailed(false);
    } catch { setSaveFailed(true); }
  };
  const items: RailItem[] = screens.map(id => ({ id, label: titles[id][0], icon: icons[id], fg: "#244BDC", bg: "#EDF2FF" }));
  const rail = (orientation: "vertical" | "horizontal") => <TabRail items={items} active={screen} onChange={id => go(id as Screen)} orientation={orientation} ariaLabel="자영업자 운영 점검" idPrefix="owner-" wrapLabels />;
  const count = nearby.data?.competitors?.raw_count;
  const growth = bench?.growth?.yoy.total_sales.value;
  return <>{!narrow && rail("vertical")}<Drawer title={`${store.name}${store.branch ? ` ${store.branch}` : ""}`} subtitle={`${store.category.scls} · ${store.dong}`} onBack={onBack} onClose={onClose} left={narrow ? 0 : RAIL_WIDTH_PX} titleAside={<button className="owner-designate" aria-pressed={owned} onClick={toggleOwn}>{owned ? "✓ 내 가게" : "내 가게로 설정"}</button>}>
    {overlays}<div className="owner-workspace">
    {narrow && rail("horizontal")}{saveFailed && <p role="alert">이 브라우저에서 내 가게 설정을 저장하지 못했어요.</p>}
    {screens.map(id => <div key={id} role="tabpanel" id={railPanelId(id, "owner-")} aria-labelledby={railTabId(id, "owner-")} hidden={screen !== id}>
      <header className="owner-page-heading"><span>{titles[id][0]}</span><h2>{id === "monthly" ? `${new Date().getFullYear()}년 ${new Date().getMonth() + 1}월 운영 점검` : titles[id][1]}</h2></header>
      {id === "overview" && <>
        <section className="owner-feature"><span className="owner-eyebrow">내 가게 기록 · 직접 입력</span><h3>{sum.latest ? `${sum.latest.month} 매출 ${man(sum.latest.value)}` : "이번 달 매출부터 기록해 보세요"}</h3><p>{sum.latest ? "기록한 매출과 비용을 확인하고, 다음 달에도 이어서 기록하세요." : "한 달만 기록해도 매출을 보관하고, 비용을 넣으면 손익분기 매출을 확인할 수 있어요."}</p><button className="owner-primary" onClick={() => go("records")}>매출·비용 {sum.latest ? "확인하기" : "기록하기"} →</button></section>
        <h3 className="owner-section-title">기록 없이도 볼 수 있는 주변 상황</h3><div className="owner-stat-grid">
          <button className="owner-stat" onClick={() => go("nearby")}><span>반경 500m · {store.category.scls}</span><strong>{nearby.isError ? "조회 실패" : nearby.isPending ? "불러오는 중" : count == null ? "자료 없음" : `${count.toLocaleString()}곳`}</strong><small>상가정보 기준 · 선택 매장 제외</small><b>경쟁 매장 확인 →</b></button>
          <button className="owner-stat" onClick={() => go("area")}><span>{bench?.unit?.name ?? "소속 상권"} · {bench?.svc_nm ?? "대응 업종"} 전체</span><strong>{benchmark.isError ? "조회 실패" : benchmark.isPending ? "불러오는 중" : growth == null ? "자료 없음" : `${growth > 0 ? "+" : ""}${growth.toFixed(1)}%`}</strong><small>총매출 · {bench?.quarter_label ?? "집계 기간 확인 필요"} · 전년 동기 대비</small><b>상권 흐름 확인 →</b></button>
        </div><section className="owner-next"><div><h3>이번 달 확인할 일을 남겨두세요</h3><p>기록 점검과 현장 확인을 한곳에서 관리합니다.</p></div><button onClick={() => go("monthly")}>월간 점검 →</button></section>
        <details className="owner-report"><summary>보고서 모아보기</summary><p>보고서에 담을 범위를 선택하세요.</p><button onClick={onReport}>매장 중심 · 반경 500m 보고서</button>{onAreaReport && <button onClick={onAreaReport}>소속 상권 전체 보고서</button>}</details>
      </>}
      {id === "records" && <>{!owned && <p className="owner-caption">지금 보는 {store.name}의 기록입니다. 운영 중인 매장이라면 위에서 내 가게로 설정해 주세요.</p>}{blocks.checkup}<details className="owner-report"><summary>소속 상권의 과거 매출 참고</summary>{blocks.benchmark}</details></>}
      {id === "nearby" && <><section className="owner-radius"><label>분석 반경<select value={radius} onChange={e => onRadius(Number(e.target.value))}><option value={250}>250m</option><option value={500}>500m</option><option value={1000}>1km</option></select></label><small>요약과 목록은 선택한 세부 업종을 기본으로 봅니다.</small></section>{blocks.competitors}<details className="owner-report"><summary>인허가 개폐업 · 집계 차이 확인</summary>{blocks.competition}{blocks["radius-basis"]}</details><details className="owner-report"><summary>주변 교통·집객시설 상세</summary>{blocks.radius}</details></>}
      {id === "area" && <><p className="owner-caption">반경 안의 경쟁 매장과 달리, 아래 통계는 소속 상권 전체의 자료입니다.</p>
        <section className="owner-surface"><span className="owner-eyebrow">{location.data?.area.name ?? "소속 상권"} · 수요 구조</span><h3>{location.data?.area.demand_type ?? "인구 구조"}</h3><div className="owner-stat-grid"><div><span>직장인구</span><strong className="owner-value">{location.data?.area.workers?.toLocaleString() ?? "자료 없음"}</strong></div><div><span>상주인구</span><strong className="owner-value">{location.data?.area.residents?.toLocaleString() ?? "자료 없음"}</strong></div></div><p className="owner-caption">인구 구조는 실제 방문 고객 구성이나 내 가게의 매출을 뜻하지 않습니다.</p></section>
        <section className="owner-surface"><span className="owner-eyebrow">{bench?.svc_nm ?? "대응 업종"} 전체 · {bench?.quarter_label ?? "자료 없음"}</span><h3>상권 매출 흐름</h3><strong className="owner-value">{growth == null ? "자료 없음" : `${growth > 0 ? "+" : ""}${growth.toFixed(1)}%`}</strong><p className="owner-caption">전년 동기 대비 총매출 · 내 매장의 실제 매출과 구분된 추정 통계입니다.</p></section>
        <section className="owner-surface"><h3>시간대별 소비 수요</h3>{location.data?.area.time_pattern ? <><span className="owner-caption">{location.data.area.time_pattern.quarter}</span>{location.data.area.time_pattern.items.map(item => <div className="owner-time-row" key={item.key}><span>{item.label}</span><b>{item.share == null ? "자료 없음" : `${item.share.toFixed(1)}%`}</b></div>)}<p className="owner-caption">{location.data.area.time_pattern.note}</p></> : <p className="owner-caption">시간대 자료가 연결되지 않았습니다. 아래 소속 지역 분석에서 제공 범위를 확인하세요.</p>}<button onClick={() => go("monthly")}>현장에서 확인할 일 남기기 →</button></section>
        <details className="owner-report"><summary>지역 분석 · 상세 자료 열기</summary>{blocks["area-links"]}{blocks["area-model"]}{blocks["area-extra"]}</details>
      </>}
      {id === "monthly" && <MonthlyCheckModal inline storeId={store.store_id} storeName={store.name} record={record} onClose={() => go("overview")} onGoMine={() => go("records")} onGoRadius={() => go("nearby")} onGoArea={() => go("area")} />}
      {id === "info" && <>{blocks.basic}{blocks.google}<details className="owner-report"><summary>운영 이력·인허가 상세</summary>{blocks.history}</details></>}
    </div>)}
    </div>
  </Drawer></>;
}
