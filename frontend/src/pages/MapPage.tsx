import { useCallback, useEffect, useMemo, useState } from "react";
import { InfoPanel, type InfoRow } from "../components/InfoPanel";
import { KakaoMap } from "../features/map/KakaoMap";
import { RegionOutlineLayer } from "../features/map/RegionOutlineLayer";
import { RebZoneLayer } from "../features/map/RebZoneLayer";
import { useRegions, useRebZones } from "../features/map/useMapData";
import { AreaBubbleLayer } from "../features/food/AreaBubbleLayer";
import { StorePointLayer } from "../features/food/StorePointLayer";
import { SearchMarker } from "../features/food/SearchMarker";
import { FlowGuide } from "../features/food/FlowGuide";
import { AnchorLayer } from "../features/food/AnchorLayer";
import { FoodTopBar } from "../features/food/FoodTopBar";
import { FoodLegend } from "../features/food/FoodLegend";
import { MapDock } from "../features/food/MapDock";
import { RankingTable } from "../features/food/RankingTable";
import { useFoodAnchors, useFoodBubbles, useFoodCategories, useFoodStores, type Bounds } from "../features/food/useFood";
import { UnitStoreList } from "../features/food/UnitStoreList";
import { ComparePanel } from "../features/food/ComparePanel";
import { StoreDetailPanel } from "../features/stores/StoreDetailPanel";
import { usePeerStores, useStoreDetail } from "../features/stores/useStores";
import { SelectedStoreMarker } from "../features/food/SelectedStoreMarker";
import { UnitBoundaryLayer } from "../features/food/UnitBoundaryLayer";
import type { FoodBubble, FoodBubblesResponse, FoodLevel, FoodMetric, RebZone, SearchResult } from "../lib/apiClient";
import { coverageText, reasonText } from "../lib/foodText";
import { canAct, classifyBubbles, viewState } from "../lib/queryState";
import { searchTarget } from "../lib/searchTarget";
import { formatMetric, formatPerArea, formatPercent } from "../lib/format";
import { DEFAULT_LEVEL, toKakaoLatLng } from "../lib/geo";
import { revealDelta } from "../lib/reveal";
import { OVERLAY_Z_INDEX, SIDE_PANEL_WIDTH_PX, TOP_BAR_HEIGHT_PX, zoomToUnit } from "../lib/vizConfig";

const UNIT_LABEL = { gu: "자치구", dong: "행정동", trdar: "상권", stores: "개별 매장" } as const;
const ZOOM_IN_TO = { gu: 7, dong: 5, trdar: 3 } as const;

type Selection = {
  title: string;
  brief: string;
  rows: InfoRow[];
  /** 업종 범위가 점포 수와 매출에서 다를 때의 안내(요약 패널 맨 위에 항상 보임) */
  notice?: string | null;
  center?: { lon: number; lat: number };
  /** 매장 목록을 보여줄 단위(자치구는 매장이 너무 많아 목록 대신 확대 안내) */
  unit?: { level: FoodLevel; code: string };
  /** 입지 비교에 담을 수 있는 버블 */
  compare?: { level: FoodLevel; code: string };
  zoomTo?: number;
};

function bubbleToSelection(b: FoodBubble, data: FoodBubblesResponse): Selection {
  const level = data.level;
  const stores = data.metric === "stores";
  const value = formatMetric(data.kind, b.value);
  const cover = coverageText(b.coverage);
  return {
    title: `${b.name}${b.type ? ` (${b.type})` : ""}`,
    brief: stores
      ? `${UNIT_LABEL[level]} 기준 점포 ${formatMetric("count", b.size)}(${data.scope.stores_label} 기준)입니다.`
      : `${UNIT_LABEL[level]} 기준 ${data.label} ${value}(${data.scope.metric_scope}), 점포 ${formatMetric("count", b.size)}(${data.scope.stores_label} 기준)입니다.`,
    notice: data.scope.notice,
    rows: [
      ...(stores ? [] : [
        { label: data.label, value },
        // 숫자 바로 옆에 이 값이 어느 업종 범위인지 항상 보인다
        { label: "이 지표의 업종 범위", value: data.scope.metric_scope },
        ...(b.value === null ? [{ label: "자료 없음 사유", value: reasonText(b.reason, data.reasons) }] : []),
        ...(cover ? [{ label: "계산 범위", value: cover }] : []),
      ]),
      { label: `점포 수 · ${data.scope.stores_label}`, value: b.size === null ? "자료 없음" : `${b.size.toLocaleString()}곳` },
      ...(stores ? [] : [{ label: "기준", value: data.as_of }]),
      { label: "단위", value: UNIT_LABEL[level] },
    ],
    center: { lon: b.lon, lat: b.lat },
    unit: level === "gu" ? undefined : { level, code: b.code },
    compare: { level, code: b.code },
    zoomTo: ZOOM_IN_TO[level],
  };
}

/** R-ONE 임대동향 상권 — 지표마다 실제 기준 분기를 적고, 그 분기에 값이 없으면 이전 분기 값으로 채우지 않고 '조사값 없음'이라고 말한다. */
function zoneToSelection(zone: RebZone, quarters: Record<string, string | null> | undefined): Selection {
  const row = (label: string, col: string, value: number | null, fmt: (v: number | null) => string): InfoRow => {
    const q = quarters?.[col] ?? null;
    return { label: `${label} · ${q ?? "기준 분기 기록 없음"}`, value: value === null ? `${q ?? "해당 분기"} 조사값 없음` : fmt(value) };
  };
  const small = zone.vacancy_small_shop_pct;
  return {
    title: `${zone.reb_zone_nm} (R-ONE)`,
    brief: small === null
      ? `이 상권은 소규모 상가 조사값이 없습니다(오피스 등 다른 유형만 조사).`
      : `소규모상가 공실률 ${formatPercent(small)}, 임대료 ${formatPerArea(zone.rent_small_shop)}입니다(${quarters?.rent_small_shop ?? "기준 분기 기록 없음"}).`,
    rows: [
      row("소규모상가 공실률", "vacancy_small_shop_pct", zone.vacancy_small_shop_pct, formatPercent),
      row("소규모상가 임대료", "rent_small_shop", zone.rent_small_shop, formatPerArea),
      row("중대형상가 공실률", "vacancy_midlarge_shop_pct", zone.vacancy_midlarge_shop_pct, formatPercent),
      row("오피스 임대료", "rent_office", zone.rent_office, formatPerArea),
    ],
  };
}

export function MapPage() {
  const [svc, setSvc] = useState<string | null>(null);
  const [scls, setScls] = useState<string | null>(null);
  const [metric, setMetric] = useState<FoodMetric>("stores");
  const [rebZonesVisible, setRebZonesVisible] = useState(false);
  const [anchorsVisible, setAnchorsVisible] = useState(false);
  const [mapKakao, setMapKakao] = useState<{ map: any; kakao: typeof window.kakao } | null>(null);
  const [zoom, setZoom] = useState(DEFAULT_LEVEL);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  // 입지 비교 목록 — 같은 지도 단위끼리만, 최대 MAX_COMPARE 곳
  const [basket, setBasket] = useState<{ level: FoodLevel; codes: string[] } | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  // 검색으로 고른 위치와, 도착 뒤 요약을 열 버블(검색 → 위치 선택 → 업종 선택 → 후보 지역 비교 흐름)
  const [place, setPlace] = useState<{ name: string; lon: number; lat: number } | null>(null);
  const [pendingOpen, setPendingOpen] = useState<{ unit: FoodLevel; code: string } | null>(null);
  // 패널 목록에서 마우스를 올린 매장 — 지도의 같은 점을 강조한다
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    if (!mapKakao) return;
    const { map, kakao } = mapKakao;
    const sync = () => {
      setZoom(map.getLevel());
      const b = map.getBounds();
      setBounds({ minLon: b.getSouthWest().getLng(), minLat: b.getSouthWest().getLat(), maxLon: b.getNorthEast().getLng(), maxLat: b.getNorthEast().getLat() });
    };
    sync();
    kakao.maps.event.addListener(map, "idle", sync);
    return () => kakao.maps.event.removeListener(map, "idle", sync);
  }, [mapKakao]);

  const unit = zoomToUnit(zoom);
  const categories = useFoodCategories();
  const bubbles = useFoodBubbles(unit === "stores" ? null : unit, metric, svc, scls);
  const points = useFoodStores(unit === "stores" ? bounds : null, svc, scls);
  const regions = useRegions();
  const rebZones = useRebZones();
  // 스세권·다세권 지표를 고르면 매장 위치도 함께 보여준다.
  const anchorsForced = metric === "starbucks_zone_share" || metric === "daiso_zone_share";
  const showAnchors = anchorsVisible || anchorsForced;
  const anchors = useFoodAnchors(showAnchors);

  // 상세를 보고 있는 매장: 어디 있는지(좌표)와, 어느 매장들·어느 영역과 비교한 숫자인지(비교 단위 매장·경계)
  const selectedDetail = useStoreDetail(storeId ?? "", storeId !== null);
  const selectedStore = storeId !== null ? selectedDetail.data?.store : undefined;
  const selLon = selectedStore?.lon ?? null;
  const selLat = selectedStore?.lat ?? null;
  const peers = usePeerStores(storeId);
  const peerData = storeId !== null && peers.data?.status === "ok" ? peers.data : null;
  const peerIds = useMemo(() => (peerData ? new Set(peerData.store_ids) : null), [peerData]);

  // 선택한 매장이 왼쪽 패널·상단 바에 가려지거나 화면 밖이면 보이는 영역 가운데로 지도를 옮긴다(잘 보이면 그대로).
  // 검색·확대의 지도 이동 애니메이션이 끝난 뒤에 위치를 재도록 잠깐 기다린다.
  useEffect(() => {
    if (!mapKakao || selLon === null || selLat === null) return;
    const { map, kakao } = mapKakao;
    const timer = window.setTimeout(() => {
      const node: HTMLElement = map.getNode();
      const pt = map.getProjection().containerPointFromCoords(toKakaoLatLng(kakao, { lon: selLon, lat: selLat }));
      const delta = revealDelta({ x: pt.x, y: pt.y }, { w: node.clientWidth, h: node.clientHeight }, {
        left: SIDE_PANEL_WIDTH_PX + 48, top: TOP_BAR_HEIGHT_PX + 48, right: 48, bottom: 48,
      });
      if (delta) map.panBy(delta.dx, delta.dy);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [mapKakao, selLon, selLat]);

  // ── 화면 상태: 최초 로딩 / 조건 변경 후 재조회(이전 결과) / 정상 0곳 / 자료 없음 / 조회 실패 ──
  // '이전 조건의 결과'는 조건(단위·지표·업종)이 실제로 다른 데이터가 대신 보이는 경우다 — 지도를 움직여 범위만 바뀐 것은 새 조건이 아니다.
  const bubblesOutdated = bubbles.isPlaceholderData && bubbles.data !== undefined
    && (bubbles.data.level !== unit || bubbles.data.metric !== metric || bubbles.data.svc !== svc || bubbles.data.scls !== scls);
  const pointsOutdated = points.isPlaceholderData && points.data !== undefined && (points.data.svc !== svc || points.data.scls !== scls);
  const bubbleState = unit === "stores" ? null : viewState(
    { isPending: bubbles.isPending, isError: bubbles.isError, isPlaceholderData: bubblesOutdated, hasData: bubbles.data !== undefined },
    bubbles.data ? classifyBubbles(metric, bubbles.data.bubbles) : {},
  );
  const pointState = unit !== "stores" ? null : viewState(
    { isPending: points.isPending, isError: points.isError, isPlaceholderData: pointsOutdated, hasData: points.data !== undefined },
    points.data ? { empty: points.data.total === 0 } : {},
  );
  const bubblesStale = bubbleState === "refetching" || bubbleState === "error";
  const pointsStale = pointState === "refetching" || pointState === "error";
  const bubblesActionable = bubbleState !== null && canAct(bubbleState);

  const onBubble = useCallback((b: FoodBubble) => {
    if (!bubbles.data || !bubblesActionable) return; // 이전 조건의 버블·실패한 조회로는 요약·비교로 진행하지 않는다
    setPendingOpen(null);
    setStoreId(null);
    setSelection(bubbleToSelection(b, bubbles.data));
  }, [bubbles.data, bubblesActionable]);
  // 순위표 행을 고르면 버블을 눌렀을 때와 같은 요약을 열고, 지도도 그 위치로 옮긴다.
  const onRankPick = useCallback((b: FoodBubble) => {
    onBubble(b);
    if (mapKakao) mapKakao.map.setCenter(toKakaoLatLng(mapKakao.kakao, b));
  }, [onBubble, mapKakao]);
  const onStore = useCallback((id: string) => setStoreId(id), []);
  const rebQuarters = rebZones.data?.quarters;
  const onZone = useCallback((z: RebZone) => setSelection(zoneToSelection(z, rebQuarters)), [rebQuarters]);

  // 검색 결과를 골랐을 때: 그 위치로 가서 핀을 꽂고, 매장이면 상세를, 상권·행정동이면 도착 뒤 요약을 연다.
  const onPickPlace = useCallback((r: SearchResult) => {
    if (!mapKakao) return;
    const target = searchTarget(r);
    setPlace({ name: r.name, lon: r.lon, lat: r.lat });
    setSelection(null);
    setStoreId(target.storeId);
    setPendingOpen(target.open ? { unit: target.open.unit, code: target.open.code } : null);
    mapKakao.map.setLevel(target.level);
    mapKakao.map.setCenter(toKakaoLatLng(mapKakao.kakao, r));
  }, [mapKakao]);
  const onClearPlace = useCallback(() => { setPlace(null); setPendingOpen(null); }, []);

  // 검색한 상권·행정동의 버블이 현재 조건으로 도착하면 그 요약을 연다(이전 조건의 결과가 아닐 때만).
  const searchSelection = useMemo(() => {
    if (!pendingOpen || !bubbles.data || !bubblesActionable || bubbles.data.level !== pendingOpen.unit) return null;
    const b = bubbles.data.bubbles.find((x) => x.code === pendingOpen.code);
    return b ? bubbleToSelection(b, bubbles.data) : null;
  }, [pendingOpen, bubbles.data, bubblesActionable]);
  const shownSelection = selection ?? searchSelection;
  // 업종·지표를 바꾸면 이전 조건으로 만든 요약 패널은 닫는다(값이 섞여 보이지 않도록).
  const withReset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setSelection(null); setPendingOpen(null); };

  const svcGroup = categories.data?.groups.find((g) => g.svc_cd === svc);
  const filterName = scls ? (svcGroup?.details.find((d) => d.code === scls)?.name ?? "세부 업종") : (svcGroup?.svc_nm ?? "외식 전체");

  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <KakaoMap onReady={(map, kakao) => setMapKakao({ map, kakao })}>
        {mapKakao && regions.data && unit !== "gu" && (
          <RegionOutlineLayer map={mapKakao.map} kakao={mapKakao.kakao} features={regions.data.features} />
        )}
        {mapKakao && bubbles.data && unit !== "stores" && (
          <AreaBubbleLayer map={mapKakao.map} kakao={mapKakao.kakao} data={bubbles.data} onSelect={onBubble} stale={bubblesStale} />
        )}
        {mapKakao && points.data && unit === "stores" && (
          <StorePointLayer
            map={mapKakao.map} kakao={mapKakao.kakao} stores={points.data.stores} onSelect={onStore} stale={pointsStale}
            selectedId={storeId} hoveredId={hoveredId} peerIds={peerIds}
          />
        )}
        {mapKakao && peerData?.boundary && <UnitBoundaryLayer map={mapKakao.map} kakao={mapKakao.kakao} geometry={peerData.boundary} />}
        {mapKakao && selectedStore && <SelectedStoreMarker map={mapKakao.map} kakao={mapKakao.kakao} store={selectedStore} />}
        {mapKakao && showAnchors && anchors.data && (
          <AnchorLayer map={mapKakao.map} kakao={mapKakao.kakao} data={anchors.data} showWalkCircles={unit === "trdar" || unit === "stores"} />
        )}
        {mapKakao && <SearchMarker map={mapKakao.map} kakao={mapKakao.kakao} place={place} />}
        {mapKakao && rebZonesVisible && rebZones.data && (
          <RebZoneLayer map={mapKakao.map} kakao={mapKakao.kakao} zones={rebZones.data.records} onSelect={onZone} />
        )}

        <FoodTopBar
          categories={categories.data}
          svc={svc}
          onSvcChange={withReset(setSvc)}
          scls={scls}
          onSclsChange={withReset(setScls)}
          metric={metric}
          onMetricChange={withReset(setMetric)}
          unitLabel={UNIT_LABEL[unit]}
          rebZonesVisible={rebZonesVisible}
          onRebZonesVisibleChange={setRebZonesVisible}
          onPickPlace={onPickPlace}
          pickedPlaceName={place?.name ?? null}
          onClearPlace={onClearPlace}
          anchorsVisible={showAnchors}
          anchorsForced={anchorsForced}
          onAnchorsVisibleChange={setAnchorsVisible}
        />
        <FlowGuide placeChosen={place !== null} svcChosen={svc !== null} basketCount={basket?.codes.length ?? 0} />
        <MapDock
          legend={
            <FoodLegend
              data={bubbles.data}
              showStores={unit === "stores"}
              rebZonesVisible={rebZonesVisible}
              anchors={showAnchors ? anchors.data : undefined}
              stale={bubblesStale}
              rebQuarter={rebQuarters?.rent_small_shop ?? null}
            />
          }
          ranking={
            unit === "stores" ? (
              <div style={{ color: "#4B5563" }}>가장 확대한 화면은 개별 매장 점이라 순위표가 없어요. 지도를 축소하면 {UNIT_LABEL.trdar}·{UNIT_LABEL.dong} 순위표를 볼 수 있어요.</div>
            ) : (
              <RankingTable data={bubbles.data} unitLabel={UNIT_LABEL[unit]} stale={bubblesStale} actionable={bubblesActionable} onPick={onRankPick} />
            )
          }
        />

        {storeId ? (
          <StoreDetailPanel storeId={storeId} onBack={() => setStoreId(null)} onClose={() => { setStoreId(null); setSelection(null); setPendingOpen(null); }} />
        ) : (
          shownSelection && (
            <InfoPanel title={shownSelection.title} brief={shownSelection.brief} rows={shownSelection.rows} onClose={() => { setSelection(null); setPendingOpen(null); }}>
              {shownSelection.compare && shownSelection.compare.level !== unit && (
                <div role="status" style={{ background: "#EFF6FF", color: "#1E3A8A", borderRadius: 8, padding: "8px 10px", fontSize: 12, marginBottom: 12 }}>
                  지도는 지금 {UNIT_LABEL[unit]} 단위로 보여요. 아래 요약은 {UNIT_LABEL[shownSelection.compare.level]} 기준 숫자예요.
                </div>
              )}
              {shownSelection.notice && (
                <div style={{ background: "#FFFBEB", color: "#92400E", borderRadius: 8, padding: "8px 10px", fontSize: 12, marginBottom: 12 }}>{shownSelection.notice}</div>
              )}
              {shownSelection.center && shownSelection.zoomTo !== undefined && mapKakao && (
                <button
                  type="button"
                  onClick={() => {
                    mapKakao.map.setLevel(shownSelection.zoomTo);
                    mapKakao.map.setCenter(toKakaoLatLng(mapKakao.kakao, shownSelection.center!));
                  }}
                  style={{ width: "100%", padding: "8px 0", marginBottom: 12, borderRadius: 8, border: "1px solid #3B82F6", background: "white", color: "#3B82F6", cursor: "pointer" }}
                >
                  이 지역 확대해서 보기
                </button>
              )}
              {shownSelection.compare && (
                <CompareButton
                  basket={basket}
                  target={shownSelection.compare}
                  onAdd={() => {
                    const c = shownSelection.compare!;
                    setBasket((b) => (b && b.level === c.level ? { level: c.level, codes: [...b.codes, c.code] } : { level: c.level, codes: [c.code] }));
                    setCompareOpen(true);
                  }}
                />
              )}
              {shownSelection.unit && (
                <UnitStoreList level={shownSelection.unit.level} code={shownSelection.unit.code} svc={svc} scls={scls} filterName={filterName} onSelect={(id) => { setHoveredId(null); setStoreId(id); }} onHover={setHoveredId} />
              )}
            </InfoPanel>
          )
        )}

        {basket && !compareOpen && (
          <button
            type="button"
            onClick={() => setCompareOpen(true)}
            style={{
              position: "absolute", zIndex: OVERLAY_Z_INDEX, bottom: 24, left: "50%", transform: "translateX(-50%)", padding: "10px 18px",
              borderRadius: 999, border: "none", background: "#1D4ED8", color: "white", fontWeight: 700, boxShadow: "0 2px 8px rgba(0,0,0,0.25)", cursor: "pointer",
            }}
          >
            입지 비교 {basket.codes.length}곳 보기
          </button>
        )}
        {basket && compareOpen && (
          <ComparePanel
            level={basket.level}
            codes={basket.codes}
            svc={svc}
            scls={scls}
            filterName={filterName}
            onRemove={(code) => setBasket((b) => (b && b.codes.length > 1 ? { ...b, codes: b.codes.filter((c) => c !== code) } : null))}
            onClose={() => setCompareOpen(false)}
          />
        )}

        <StatusArea
          unit={unit}
          bubbleState={bubbleState}
          pointState={pointState}
          bubbles={bubbles.data}
          bubbleError={bubbles.error?.message}
          pointError={points.error?.message}
          points={points.data}
          metricLabel={bubbles.data?.label ?? ""}
          filterName={filterName}
          onRetryBubbles={() => void bubbles.refetch()}
          onRetryPoints={() => void points.refetch()}
          categoriesError={categories.isError ? categories.error.message : null}
          onRetryCategories={() => void categories.refetch()}
        />
      </KakaoMap>
    </div>
  );
}

const MAX_COMPARE = 4;

function CompareButton({ basket, target, onAdd }: {
  basket: { level: FoodLevel; codes: string[] } | null;
  target: { level: FoodLevel; code: string };
  onAdd: () => void;
}) {
  const otherLevel = basket !== null && basket.level !== target.level;
  const added = !otherLevel && basket?.codes.includes(target.code);
  const full = !otherLevel && (basket?.codes.length ?? 0) >= MAX_COMPARE;
  const label = added ? "비교 목록에 있음" : full ? `비교는 최대 ${MAX_COMPARE}곳` : otherLevel ? `비우고 이 ${UNIT_LABEL[target.level]}부터 비교` : `비교에 담기 (${basket?.codes.length ?? 0}/${MAX_COMPARE})`;
  return (
    <div style={{ marginBottom: 12 }}>
      <button
        type="button"
        disabled={added || full}
        onClick={onAdd}
        style={{
          width: "100%", padding: "8px 0", borderRadius: 8, border: "none", fontWeight: 600,
          background: added || full ? "#E5E7EB" : "#1D4ED8", color: added || full ? "#6B7280" : "white", cursor: added || full ? "default" : "pointer",
        }}
      >
        {label}
      </button>
      {otherLevel && (
        <div style={{ fontSize: 11, color: "#6B7280", marginTop: 4 }}>
          지금 비교 목록은 {UNIT_LABEL[basket!.level]} 단위예요. 크기가 다른 단위는 섞어 비교하지 않습니다.
        </div>
      )}
    </div>
  );
}

type BannerTone = "info" | "warn" | "error";

function StatusArea(p: {
  unit: "gu" | "dong" | "trdar" | "stores";
  bubbleState: ReturnType<typeof viewState> | null;
  pointState: ReturnType<typeof viewState> | null;
  bubbles: FoodBubblesResponse | undefined;
  bubbleError?: string;
  pointError?: string;
  points: { total: number; truncated: boolean; stores: unknown[] } | undefined;
  metricLabel: string;
  filterName: string;
  onRetryBubbles: () => void;
  onRetryPoints: () => void;
  categoriesError: string | null;
  onRetryCategories: () => void;
}) {
  const unitLabel = UNIT_LABEL[p.unit];
  const banners: { key: string; tone: BannerTone; text: string; retry?: () => void }[] = [];
  const state = p.unit === "stores" ? p.pointState : p.bubbleState;
  if (state === "loading") banners.push({ key: "loading", tone: "info", text: p.unit === "stores" ? "이 범위의 매장을 불러오는 중..." : "지도 데이터를 불러오는 중..." });
  if (state === "refetching") {
    banners.push({ key: "refetch", tone: "warn", text: "새 조건으로 다시 조회하는 중 — 지금 보이는 숫자는 이전 조건의 결과라 흐리게 표시하고 누를 수 없게 했습니다." });
  }
  if (state === "error") {
    banners.push({
      key: "error", tone: "error",
      text: `${p.unit === "stores" ? "매장" : "지도"} 데이터를 불러오지 못했습니다: ${p.unit === "stores" ? p.pointError : p.bubbleError}`,
      retry: p.unit === "stores" ? p.onRetryPoints : p.onRetryBubbles,
    });
  }
  if (state === "empty") {
    banners.push({ key: "empty", tone: "info", text: p.unit === "stores"
      ? `이 화면 범위에는 '${p.filterName}' 매장이 0곳입니다(조회는 정상). 지도를 옮기거나 업종을 바꿔 보세요.`
      : `'${p.filterName}' 조건에 맞는 매장이 이 ${unitLabel} 어디에도 0곳입니다(조회는 정상).` });
  }
  if (state === "no-data") {
    banners.push({ key: "nodata", tone: "info", text: `'${p.metricLabel}' 값이 이 조건의 모든 ${unitLabel}에서 비어 있습니다 — 0 이 아니라 자료 없음입니다(회색 점선 버블을 눌러 사유 확인).` });
  }
  if (p.unit === "stores" && state === "ready" && p.points?.truncated) {
    banners.push({ key: "trunc", tone: "info", text: `이 범위의 매장 ${p.points.total.toLocaleString()}곳 중 ${p.points.stores.length}곳만 표시 — 더 확대하세요` });
  }
  if (p.categoriesError) banners.push({ key: "cat", tone: "error", text: `업종 목록을 불러오지 못했습니다: ${p.categoriesError}`, retry: p.onRetryCategories });
  const colors: Record<BannerTone, { bg: string; fg: string }> = { info: { bg: "white", fg: "#374151" }, warn: { bg: "#FFFBEB", fg: "#92400E" }, error: { bg: "#FEF2F2", fg: "#B91C1C" } };
  return (
    <div style={{ position: "absolute", zIndex: OVERLAY_Z_INDEX, top: 100, left: "50%", transform: "translateX(-50%)", display: "flex", flexDirection: "column", gap: 6, alignItems: "center", maxWidth: "min(720px, calc(100vw - 32px))" }}>
      {banners.map((b) => (
        <div key={b.key} role={b.tone === "error" ? "alert" : "status"} style={{ background: colors[b.tone].bg, color: colors[b.tone].fg, borderRadius: 8, padding: "8px 16px", boxShadow: "0 2px 8px rgba(0,0,0,0.15)", fontSize: 13 }}>
          {b.text}
          {b.retry && (
            <button type="button" onClick={b.retry} style={{ marginLeft: 10, border: "1px solid #B91C1C", background: "white", color: "#B91C1C", borderRadius: 6, padding: "2px 10px", cursor: "pointer", fontWeight: 600 }}>
              다시 시도
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
