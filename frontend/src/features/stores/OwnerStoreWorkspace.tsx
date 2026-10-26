import { PopulationMix, MetricBars } from "../../components/DataVisuals";
import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Drawer } from "../../components/Drawer";
import { Fold, Notice } from "../../components/Notice";
import { ActionButton, Block, Caption, ListRow, Stat } from "../../components/PanelKit";
import { RailHeading } from "../../components/RailHeading";
import { COMPETE_ICON, DEMAND_ICON, STORE_ICON, SUMMARY_ICON } from "../../components/railIcons";
import { TabRail, type RailItem } from "../../components/TabRail";
import { apiClient, type StoreBasic } from "../../lib/apiClient";
import { AREA_TAB_STYLE, type AreaTabId } from "../../lib/areaTabs";
import { noteMyStore } from "../../lib/monthlyCheck";
import type { StoreRecord } from "../../lib/myStoreStorage";
import type { GroupId } from "../../lib/panelGroups";
import { grid2 } from "../../lib/panelStyle";
import { railPanelId, railTabId } from "../../lib/railIds";
import { RAIL_WIDTH_PX } from "../../lib/vizConfig";
import { useNarrow } from "../../lib/useNarrow";
import { useNearbyAnalysis, useLocationInfluence } from "./useStores";
import { GoogleReviewSection } from "./GoogleReviewSection";
import { RadiusToggle } from "./LocationInfluenceSection";

type Screen = "overview" | "nearby" | "area" | "info";

/** 자영업자 매장 상세의 다섯 화면 — 레일 색·아이콘·제목 모양은 상권 페이지(lib/areaTabs)와 같은 것을 빌려 쓴다. 제목은 상권 페이지처럼 궁금한 것을 묻는 질문이다. */
const TABS: Record<Screen, { label: string; like: AreaTabId; icon: ReactNode; question: string }> = {
  overview: { label: "운영 요약", like: "summary", icon: SUMMARY_ICON, question: "우리 가게는 지금 어떤 상태일까?" },
  nearby: { label: "주변 경쟁", like: "stability", icon: COMPETE_ICON, question: "주변 같은 업종 가게는 얼마나 있을까?" },
  area: { label: "상권·수요", like: "demand", icon: DEMAND_ICON, question: "우리 상권 손님은 언제 오갈까?" },
  info: { label: "매장 정보", like: "stores", icon: STORE_ICON, question: "이 매장은 어떤 가게일까?" },
};
const screens = Object.keys(TABS) as Screen[];
const mapping: Record<Screen, GroupId> = { overview: "store", nearby: "compete", area: "area", info: "store" };
const signedPct = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
interface Props {
  store: StoreBasic; record: StoreRecord; blocks: Record<string, ReactNode>; radius: number; onRadius: (n: number) => void;
  onBack: () => void; onClose: () => void; onGroupChange: (g: GroupId) => void;
  onOpenArea: (level: "dong" | "trdar") => void;
  overlays: ReactNode;
}
export function OwnerStoreWorkspace({ store, blocks, radius, onRadius, onBack, onClose, onGroupChange, onOpenArea, overlays }: Props) {
  const narrow = useNarrow();
  const [googleVisited, setGoogleVisited] = useState(false);
  const [screen, setScreen] = useState<Screen>("overview");
  const [owned, setOwned] = useState(() => { try { return localStorage.getItem("ownerStore:v1") === store.store_id; } catch { return false; } });
  const [saveFailed, setSaveFailed] = useState(false);
  const nearby = useNearbyAnalysis(store.store_id, 500);
  const location = useLocationInfluence(store.store_id, 500);
  const benchmark = useQuery({ queryKey: ["sales-benchmark", store.store_id], queryFn: () => apiClient.getSalesBenchmark(store.store_id), staleTime: 600000 });
  const bench = benchmark.data?.status === "ok" ? benchmark.data : null;
  const go = (next: Screen) => { if (next === "info") setGoogleVisited(true); setScreen(next); onGroupChange(mapping[next]); };
  const toggleOwn = () => {
    try {
      if (owned) localStorage.removeItem("ownerStore:v1");
      else { localStorage.setItem("ownerStore:v1", store.store_id); noteMyStore({ storeId: store.store_id, name: store.name, dong: store.dong }, Date.now()); }
      setOwned(!owned); setSaveFailed(false);
    } catch { setSaveFailed(true); }
  };
  const items: RailItem[] = screens.map(id => ({ id, label: TABS[id].label, icon: TABS[id].icon, ...AREA_TAB_STYLE[TABS[id].like] }));
  const rail = (orientation: "vertical" | "horizontal") => <TabRail items={items} active={screen} onChange={id => go(id as Screen)} orientation={orientation} ariaLabel="자영업자 운영 점검" idPrefix="owner-" />;
  const count = nearby.data?.competitors?.raw_count;
  const growth = bench?.growth?.yoy.total_sales.value;
  const countText = nearby.isError ? "조회 실패" : nearby.isPending ? "불러오는 중" : count == null ? "자료 없음" : `${count.toLocaleString()}곳`;
  const growthText = benchmark.isError ? "조회 실패" : benchmark.isPending ? "불러오는 중" : growth == null ? "자료 없음" : signedPct(growth);
  const area = location.data?.area;
  return <>{!narrow && rail("vertical")}<Drawer title={`${store.name}${store.branch ? ` ${store.branch}` : ""}`} onBack={onBack} onClose={onClose} left={narrow ? 0 : RAIL_WIDTH_PX}
    titleAside={<ActionButton variant={owned ? "primary" : "secondary"} aria-pressed={owned} onClick={toggleOwn}>{owned ? "✓ 내 가게" : "내 가게로 설정"}</ActionButton>}>
    {overlays}<div className="store-detail">
    {narrow && rail("horizontal")}{saveFailed && <Notice tone="error">이 브라우저에서 내 가게 설정을 저장하지 못했어요.</Notice>}
    {screens.map(id => {
      const style = AREA_TAB_STYLE[TABS[id].like];
      return <div key={id} role="tabpanel" id={railPanelId(id, "owner-")} aria-labelledby={railTabId(id, "owner-")} hidden={screen !== id}>
        <div style={{ marginTop: 12 }}><RailHeading fg={style.fg} bg={style.bg} title={TABS[id].question} /></div>
        {id === "overview" && <>
          <Block title="주변 상황">
            <div style={grid2}>
              <Stat onGray label={`반경 500m · ${store.category.scls}`} value={countText} sub="상가정보 기준 · 선택 매장 제외" />
              <Stat onGray label={`${bench?.unit?.name ?? "소속 상권"} 총매출`} value={growthText} sub={`전년 동기 대비 · ${bench?.quarter_label ?? "집계 기간 확인 필요"}`} />
            </div>
            <div style={{ marginTop: 10 }}>
              <ListRow name="경쟁 매장 확인" onClick={() => go("nearby")} />
              <ListRow name="상권 흐름 확인" onClick={() => go("area")} />
            </div>
          </Block>
        </>}
        {id === "nearby" && <>
          <div style={{ marginTop: 16 }}><RadiusToggle radius={radius} onChange={onRadius} /></div>
          {blocks.competitors}
          <Fold title="연도별 개폐업">{blocks["owner-churn"]}</Fold>
          {blocks["owner-location"]}
        </>}
        {id === "area" && <>
          <Block title={`${area?.name ?? "소속 상권"} · ${area?.demand_type ?? "수요 구조"}`}>
            <PopulationMix residents={area?.residents} workers={area?.workers} />
            <Caption>상권 인구 통계 · 방문 고객 수와 다름</Caption>
          </Block>
          <Block title="상권 매출 흐름">
            <Stat onGray big label={`${bench?.svc_nm ?? "대응 업종"} 전체 · ${bench?.quarter_label ?? "자료 없음"}`} value={growth == null ? "자료 없음" : signedPct(growth)} missing={growth == null} sub="전년 동기 대비 · 상권 추정매출" />
          </Block>
          <Block title="시간대·요일별 유동인구 비중">
            {area?.time_pattern
              ? <><Caption>{area.time_pattern.quarter}</Caption>
                <MetricBars items={area.time_pattern.items.map(item => ({ label: item.label, value: item.share, color: "#6864E9" }))} format={n => `${n.toFixed(1)}%`} rate />
                <Caption>유동인구 기준 · 매출 비중과 다름</Caption></>
              : <Caption>시간대 자료 없음</Caption>}
          </Block>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
            <ActionButton variant="secondary" onClick={() => onOpenArea("dong")}>{store.dong} 종합분석 ›</ActionButton>
            {store.trdar && <ActionButton variant="secondary" onClick={() => onOpenArea("trdar")}>{store.trdar.name} 상권 분석 ›</ActionButton>}
          </div>
        </>}
        {id === "info" && <>{blocks.basic}{googleVisited && <GoogleReviewSection storeId={store.store_id} autoLoad />}<Fold title="인허가·지정 이력">{blocks.history}</Fold></>}
      </div>;
    })}
    </div>
  </Drawer></>;
}
