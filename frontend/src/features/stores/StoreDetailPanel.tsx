import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { Drawer } from "../../components/Drawer";
import { Fold, Notice, Section, SourceNote } from "../../components/Notice";
import { NoteHost } from "../../components/NoteHost";
import { RailHeading } from "../../components/RailHeading";
import { ScopeTag } from "../../components/ScopeTag";
import type { StoreBasic } from "../../lib/apiClient";
import { latestMonth } from "../../lib/checkup";
import { facilityMapPlan } from "../../lib/facilityText";
import { overlayRadius, validCenter } from "../../lib/radiusOverlay";
import { railMapPlan } from "../../lib/railText";
import type { Mode } from "../../lib/mode";
import { blocksOf, GROUP_IDS, type BlockId, type GroupId } from "../../lib/panelGroups";
import { railPanelId, railTabId } from "../../lib/railIds";
import { SCOPE_GROUP, SCOPE_HINT, SCOPE_STYLE } from "../../lib/scope";
import { useNarrow } from "../../lib/useNarrow";
import { RAIL_WIDTH_PX } from "../../lib/vizConfig";
import { FranchiseSection } from "./FranchiseSection";
import { FacilityLayer } from "./FacilityLayer";
import { GoogleReviewSection } from "./GoogleReviewSection";
import { GroupRail } from "./GroupRail";
import { ImprovementReportSection } from "./ImprovementReportSection";
import { InsightReportModal } from "./report/InsightReportModal";
import { AreaCharacterLine } from "../area/AreaCharacterSection";
import { DEFAULT_RADIUS_M, LocationAreaSection, LocationRadiusSection, RadiusBasisSection } from "./LocationInfluenceSection";
import { CompetitorBlock } from "./CompetitorBlock";
import { MineStatusBar } from "./MineStatusBar";
import { MonthlyCheckModal } from "./MonthlyCheckModal";
import { noteMyStore } from "../../lib/monthlyCheck";
import { toKakaoLatLng } from "../../lib/geo";
import { StoreBriefCard } from "./StoreBriefCard";
import { buildStoreBrief, type StoreBriefTarget } from "../../lib/storeBrief";
import { MyStoreCheckupSection } from "./MyStoreCheckupSection";
import { RadiusCircleLayer } from "./RadiusCircleLayer";
import { RailStationLayer } from "./RailStationLayer";
import { NearbyAnalysisSection } from "./NearbyAnalysisSection";
import { LicenseSummary, OperationHistorySection } from "./OperationHistorySection";
import { SalesBenchmarkSection } from "./SalesBenchmarkSection";
import { useMyStoreRecord } from "./useMyStoreRecord";
import { useLocationInfluence, useStoreDetail } from "./useStores";

interface StoreDetailPanelProps {
  storeId: string;
  onBack: () => void;
  onClose: () => void;
  /** 소속 행정동·세부 상권 분석 화면으로 이동 */
  onOpenArea: (target: { level: "dong" | "trdar"; store: StoreBasic }) => void;
  /** 카카오 지도 핸들 — 있으면 '주변' 묶음에서 선택 반경을 지도에 원으로 그린다(없으면 원 없음). */
  mapView?: { map: any; kakao: typeof window.kakao } | null;
  /** 이용 모드 — 예비 창업자에게는 '내 가게' 묶음(내 매출 기록)을 보이지 않는다. */
  mode: Mode;
  /** 화면에서 일어난 일을 알린다(이용 순서 표시) */
  /** 보고 있는 묶음이 바뀌면 알린다 — 지도가 '주변·경쟁' 분석일 때 경쟁 매장·상권 경계를 진하게 그린다 */
  onGroupChange?: (g: GroupId) => void;
  /** 경쟁 매장 목록에서 다른 매장의 상세·운영이력으로 넘어간다 */
  onSelectStore?: (id: string) => void;
  /** 목록 항목에 마우스·초점이 올라간 매장 id(지도의 같은 점 강조) */
  onHoverStore?: (id: string | null) => void;
  /** 경쟁 가게 목록에서 열어 본 곳이면 true — '내 가게'와 헷갈리지 않게 알린다 */
  asRival?: boolean;
  /** 이 매장이 속한 상권(없으면 행정동)의 지역 보고서를 연다 — 매장 보고서는 자영업자용만 있어서 예비 창업자는 이쪽을 쓴다 */
  onOpenAreaReport?: (t: { level: "dong" | "trdar"; code: string; name: string; type: string | null; svc: string | null }) => void;
  /** 우리 가게 월간 점검 화면(자영업자) — 열림 상태는 상단 바 단추와 함께 쓰려고 MapPage 가 들고 있다 */
  monthlyOpen?: boolean;
  onMonthlyOpenChange?: (open: boolean) => void;
}

/** 매장 상세 — 왼쪽 레일의 네 묶음(이 매장 / 주변 / 상권 / 내 가게)으로 나눠 한 번에 한 묶음만 보인다.
 * 요약 칩은 어느 묶음에서나 위에 보이고, 칩을 누르면 그 묶음으로 간다. 블록 배치는 lib/panelGroups, 범위 라벨은 lib/scope.
 * 선택하지 않은 묶음도 화면에는 그려 두고 가리기만 해서(hidden) 반경 선택·Google 불러오기 같은 상태가 탭을 바꿔도 유지된다.
 * 상권 매출 추이·인구·시간대 그래프는 행정동·상권 상세에만 둔다. 영역을 합친 점수(매장 신뢰도 등)는 만들지 않는다. */
export function StoreDetailPanel(props: StoreDetailPanelProps) {
  // 매장이 바뀌면 묶음 선택과 입력(내 매출)을 처음 상태로 되돌린다.
  return <StoreDetail key={props.storeId} {...props} />;
}

function StoreDetail({ storeId, onBack, onClose, onOpenArea, mapView, mode, onGroupChange, onSelectStore, onHoverStore, asRival = false, onOpenAreaReport, monthlyOpen = false, onMonthlyOpenChange }: StoreDetailPanelProps) {
  const { data, isLoading, isError, error } = useStoreDetail(storeId);
  const narrow = useNarrow();
  const [group, setGroupState] = useState<GroupId>("store");
  const setGroup = (g: GroupId) => { setGroupState(g); onGroupChange?.(g); };
  const [reportOpen, setReportOpen] = useState(false);
  // 주변 묶음의 반경(250·500·1km)은 여기서 한 번만 들고 입지 지표·개폐업·분석 기준이 같은 값을 쓴다.
  const [radius, setRadius] = useState(DEFAULT_RADIUS_M);
  // 지하철 출입구를 지도에 그릴지(기본 꺼짐) — 역 마커는 항상, 출입구는 켰을 때만(지도 혼잡 방지). 매장이 바뀌면 처음 상태로.
  const [showExits, setShowExits] = useState(false);
  // 주요 집객시설을 지도에 그릴지(기본 꺼짐) — 공식 자료·이용 권한 확인 시설만. 매장이 바뀌면 처음 상태로.
  const [showFacilities, setShowFacilities] = useState(false);
  // 내 가게 기록(월 매출·비용)은 여기서 한 번만 들고, 입력은 '내 가게 점검'에서만 받는다. 매출 비교·상권 점검·프랜차이즈는
  // 기록한 가장 최근 달의 월 매출(만원)을 읽는다. 브라우저(localStorage)에만 저장하고 서버로 보내지 않는다.
  const mine = useMyStoreRecord(storeId);
  const lastMonth = latestMonth(mine.record.months);
  // 예비 창업자는 운영 중인 가게가 없어 '내 가게' 묶음을 빼고 세 묶음만 보인다.
  // 자영업자: 내 가게 찾기(이 매장) → 매출·비용 점검(내 가게) → 주변 경쟁 변화(주변) → 상권 수요(상권) 순서. 예비 창업자는 운영 중인 가게 전용 '내 가게'를 숨긴다.
  const groups: GroupId[] = mode === "founder" ? GROUP_IDS.filter((g) => g !== "mine") : ["store", "mine", "radius", "area"];
  const manwon = lastMonth ? String(mine.record.months[lastMonth]) : "";
  const store = data?.store;
  // 자영업자가 연 가게의 이름을 남겨 두면 '월간 점검'에서 다시 고를 수 있다(이름·동만, 이 브라우저에만)
  const storeIdName = store ? `${store.name}${store.branch ? ` ${store.branch}` : ""}` : null;
  useEffect(() => { if (mode === "owner" && store && storeIdName) noteMyStore({ storeId, name: storeIdName, dong: store.dong }, Date.now()); }, [mode, store, storeId, storeIdName]);
  // 지도 원은 위 radius(API 조회와 같은 상태값)로만 그린다. '주변' 묶음을 벗어나거나 매장이 바뀌어(key) 이 컴포넌트가 사라지면 원도 사라진다.
  const circleRadius = overlayRadius(group, radius);
  // 지도의 역·출입구 표시는 아래 반경 블록과 같은 쿼리(같은 키)의 같은 반경 결과만 쓴다 — 이전 반경 결과가 남아 있는 동안은 그리지 않는다.
  const loc = useLocationInfluence(storeId, radius);
  const railResp = loc.data?.radius_metrics.rail;
  const railPlan = useMemo(() => railMapPlan(loc.isPlaceholderData ? null : railResp, radius, showExits), [railResp, loc.isPlaceholderData, radius, showExits]);
  const facResp = loc.data?.radius_metrics.facilities;
  const facilityPlan = useMemo(() => facilityMapPlan(loc.isPlaceholderData ? null : facResp, radius, showFacilities), [facResp, loc.isPlaceholderData, radius, showFacilities]);
  /** 소속 상권(없으면 행정동)의 지역 보고서 — 그 매장의 업종 기준 */
  const areaReport = () => {
    if (!store || !onOpenAreaReport) return;
    onOpenAreaReport(store.trdar
      ? { level: "trdar", code: store.trdar.code, name: store.trdar.name, type: store.trdar.type, svc: store.category.svc ?? null }
      : { level: "dong", code: store.adong_cd, name: store.dong, type: null, svc: store.category.svc ?? null });
  };

  const blocks: Record<BlockId, ReactNode> | null =
    store && data
      ? {
          basic: (
            <div style={{ marginTop: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", marginBottom: 2 }}>기본정보 · 이 매장</div>
              <div style={{ fontSize: 12, color: "#374151" }}>
                {store.address ?? "주소 정보 없음"}
                {store.building ? ` (${store.building})` : ""}
                <SourceNote title={store.source.title} reference={store.source.reference} />
              </div>
              <div style={{ marginTop: 10 }}>
                <LicenseSummary history={data.operation_history} />
              </div>
            </div>
          ),
          google: <GoogleReviewSection storeId={storeId} />,
          history: <OperationHistorySection history={data.operation_history} />,
          radius: <LocationRadiusSection storeId={storeId} radius={radius} onRadiusChange={setRadius} showExits={showExits} onShowExitsChange={setShowExits} showFacilities={showFacilities} onShowFacilitiesChange={setShowFacilities} />,
          competitors: (
            <CompetitorBlock
              storeId={storeId}
              storeName={`${store.name}${store.branch ? ` ${store.branch}` : ""}`}
              center={{ lon: store.lon, lat: store.lat }}
              svc={store.category.svc ?? null}
              radius={radius}
              onSelectStore={(id) => onSelectStore?.(id)}
              onHoverStore={onHoverStore}
              onShowOnMap={mapView ? (c) => { mapView.map.setCenter(toKakaoLatLng(mapView.kakao, { lon: c.lon, lat: c.lat })); } : undefined}
            />
          ),
          competition: <NearbyAnalysisSection storeId={storeId} radius={radius} />,
          "radius-basis": <RadiusBasisSection storeId={storeId} radius={radius} />,
          "area-links": (
            <Section title="소속 상권 — 행정동·발달/골목상권" scope={<ScopeTag kind="area" label="소속 상권" />}>
              <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 6 }}>상권 유형·매출 추이·인구·시간대별 소비는 아래 지역 화면에서 봅니다(이 매장의 정보가 아니라 상권 평균). 유형은 상권 경계 기준의 참고용 규칙 분류이고, 매장 반경 값(주변)과 다릅니다.</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <AreaCharacterLine level="dong" code={store.adong_cd} label={`${store.dong} 행정동`} />
                <button type="button" onClick={() => onOpenArea({ level: "dong", store })} style={linkStyle}>{store.dong} 행정동 종합분석 ›</button>
                {store.trdar ? (
                  <>
                    <AreaCharacterLine level="trdar" code={store.trdar.code} label={`${store.trdar.name} 상권`} />
                    <button type="button" onClick={() => onOpenArea({ level: "trdar", store })} style={linkStyle}>{store.trdar.name}({store.trdar.type}) 상권 분석 ›</button>
                  </>
                ) : (
                  <Notice tone="muted">이 매장은 서울시 지정 상권 경계 밖에 있어 세부 상권 분석이 없습니다.</Notice>
                )}
              </div>
            </Section>
          ),
          "area-model": <LocationAreaSection storeId={storeId} />,
          "area-extra": (
            <Section title="추가 참고 — 상권 평균 기준">
              <Fold title="프랜차이즈 참고 펼치기">
                <FranchiseSection storeId={storeId} manwon={manwon} />
              </Fold>
            </Section>
          ),
          improvement: <ImprovementReportSection storeId={storeId} manwon={manwon} />,
          benchmark: <SalesBenchmarkSection storeId={storeId} manwon={manwon} latestMonth={lastMonth} />,
          checkup: <MyStoreCheckupSection storeId={storeId} record={mine.record} onChange={mine.update} onReset={mine.reset} saveFailed={mine.saveFailed} />,
        }
      : null;

  return (
    <>
      {!narrow && <GroupRail active={group} onChange={setGroup} orientation="vertical" groups={groups} />}
      <Drawer
        title={store ? `${store.name}${store.branch ? ` ${store.branch}` : ""}` : "매장 정보"}
        subtitle={store ? `${store.category.lcls} > ${store.category.mcls} > ${store.category.scls}` : undefined}
        onBack={onBack}
        onClose={onClose}
        left={narrow ? 0 : RAIL_WIDTH_PX}
      >
        {isLoading && <Notice tone="muted">매장 정보를 불러오는 중...</Notice>}
        {isError && <Notice tone="error">조회 실패: {error.message}</Notice>}
        {store && blocks && (
          <>
            {mapView && circleRadius !== null && validCenter(store.lon, store.lat) && (
              <RadiusCircleLayer map={mapView.map} kakao={mapView.kakao} center={{ lon: store.lon, lat: store.lat }} radiusM={circleRadius} />
            )}
            {mapView && circleRadius !== null && validCenter(store.lon, store.lat) && railPlan.stations.length > 0 && (
              <RailStationLayer map={mapView.map} kakao={mapView.kakao} stations={railPlan.stations} exits={railPlan.exits} />
            )}
            {mapView && circleRadius !== null && validCenter(store.lon, store.lat) && facilityPlan.length > 0 && (
              <FacilityLayer map={mapView.map} kakao={mapView.kakao} facilities={facilityPlan} />
            )}
            {narrow && <GroupRail active={group} onChange={setGroup} orientation="horizontal" groups={groups} />}
            {monthlyOpen && (
              <MonthlyCheckModal
                storeId={storeId}
                storeName={`${store.name}${store.branch ? ` ${store.branch}` : ""}`}
                record={mine.record}
                onClose={() => onMonthlyOpenChange?.(false)}
                onGoMine={() => { onMonthlyOpenChange?.(false); setGroup("mine"); }}
                onGoRadius={() => { onMonthlyOpenChange?.(false); setGroup("radius"); }}
                onGoArea={() => { onMonthlyOpenChange?.(false); setGroup("area"); }}
              />
            )}
            {reportOpen && <InsightReportModal storeId={storeId} onClose={() => setReportOpen(false)} />}
            {groups.map((g) => (
              <div key={g} role="tabpanel" id={railPanelId(g)} aria-labelledby={railTabId(g)} hidden={g !== group}>
                <div style={{ marginTop: 12 }}>
                  <RailHeading fg={SCOPE_STYLE[g].fg} bg={SCOPE_STYLE[g].bg} title={SCOPE_GROUP[g]} hint={SCOPE_HINT[g]} />
                </div>
                {g === "store" && asRival && (
                  <div style={{ marginTop: 10 }}><Notice tone="info">경쟁 가게로 열어 본 곳이에요. 아래 '내 가게' 기록이나 점검은 이 가게가 아니라 내 가게 기준이에요(이 가게의 기록은 없어요).</Notice></div>
                )}
                {g === "store" && (
                  <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                    {mode === "owner" && (
                      <button type="button" data-tour="report-button" onClick={() => setReportOpen(true)} style={reportButtonStyle}>
                        내 매장 보고서 보기 ›
                        <span style={reportSubStyle}>이 매장 기준 · 주변 경쟁·상권 변화·고객 수요·확인사항 · 매장 보고서</span>
                      </button>
                    )}
                    {onOpenAreaReport && (
                      <button type="button" data-tour={mode === "founder" ? "report-button" : undefined} onClick={areaReport} style={mode === "owner" ? reportSecondaryStyle : reportButtonStyle}>
                        소속 {store.trdar ? "상권" : "행정동"} 보고서 보기 ›
                        <span style={mode === "owner" ? { ...reportSubStyle, color: "#7C2D12" } : reportSubStyle}>{store.trdar ? store.trdar.name : store.dong} 전체 · {mode === "owner" ? "지역 보고서" : "후보지 매출 흐름·경쟁·입지·확인사항 · 지역 보고서"}</span>
                      </button>
                    )}
                    {mode === "founder" && <div style={{ fontSize: 12.5, color: "#6B7280" }}>매장 한 곳의 보고서는 자영업자용만 제공돼요. 예비 창업자는 이 매장이 속한 지역의 보고서를 볼 수 있어요.</div>}
                  </div>
                )}
                {g === "store" && (
                  <StoreBriefCard
                    brief={buildStoreBrief({
                      mode,
                      monthsRecorded: Object.keys(mine.record.months).length,
                      lastMonth,
                      costsFilled: Object.values(mine.record.costs).filter((v) => v.trim() !== "").length,
                      statusLabel: data?.operation_history.business_status?.label ?? null,
                      ageLabel: data?.operation_history.license?.age_label ?? null,
                      trdarName: store.trdar?.name ?? null,
                      dongName: store.dong,
                    })}
                    onAction={(t: StoreBriefTarget) => setGroup(t)}
                  />
                )}
                {g === "mine" && (
                  <MineStatusBar onOpenMonthly={() => onMonthlyOpenChange?.(true)} months={Object.keys(mine.record.months).length} lastMonth={lastMonth} costsFilled={Object.values(mine.record.costs).filter((v) => v.trim() !== "").length} storeName={`${store.name}${store.branch ? ` ${store.branch}` : ""}`} />
                )}
                <NoteHost>
                  {blocksOf(g).map((id) => (
                    <Fragment key={id}>{blocks[id]}</Fragment>
                  ))}
                </NoteHost>
                {g !== "store" && (
                  <button type="button" onClick={() => (mode === "owner" ? setReportOpen(true) : areaReport())} style={{ ...reportLinkStyle }}>
                    {mode === "owner" ? "내 매장 보고서 보기 ›" : "소속 상권 보고서 보기 ›"}
                  </button>
                )}
              </div>
            ))}
          </>
        )}
      </Drawer>
    </>
  );
}

const linkStyle: React.CSSProperties = { padding: "8px 10px", border: "1px solid #3B82F6", borderRadius: 8, background: "white", color: "#1D4ED8", cursor: "pointer", textAlign: "left", fontWeight: 600 };

const reportButtonStyle: React.CSSProperties = { width: "100%", minHeight: 56, padding: "12px 14px", border: "none", borderRadius: 12, background: "#C2410C", color: "white", fontWeight: 800, fontSize: 17, cursor: "pointer", textAlign: "left", boxShadow: "0 2px 6px rgba(194,65,12,0.35)" };
const reportSubStyle: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 500, opacity: 0.92, marginTop: 2 };
const reportSecondaryStyle: React.CSSProperties = { width: "100%", minHeight: 48, padding: "10px 14px", border: "2px solid #C2410C", borderRadius: 12, background: "white", color: "#9A3412", fontWeight: 800, fontSize: 15.5, cursor: "pointer", textAlign: "left" };
const reportLinkStyle: React.CSSProperties = { marginTop: 16, minHeight: 40, padding: "8px 14px", border: "1px solid #C2410C", borderRadius: 10, background: "white", color: "#9A3412", fontWeight: 700, fontSize: 14.5, cursor: "pointer" };
