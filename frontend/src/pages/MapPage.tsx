import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { InfoPanel, type InfoRow } from "../components/InfoPanel";
import { KakaoMap } from "../features/map/KakaoMap";
import { RegionOutlineLayer } from "../features/map/RegionOutlineLayer";
import { RebZoneLayer } from "../features/map/RebZoneLayer";
import { useRegions, useRebZones } from "../features/map/useMapData";
import { AreaBubbleLayer } from "../features/food/AreaBubbleLayer";
import { StorePointLayer } from "../features/food/StorePointLayer";
import { SearchMarker } from "../features/food/SearchMarker";
import { SearchResultChip, SearchStoresLayer } from "../features/food/SearchStoresLayer";
import { FlowGuide } from "../features/food/FlowGuide";
import { TourLayer } from "../features/guide/TourLayer";
import { useMode } from "../features/guide/useMode";
import { useTour } from "../features/guide/useTour";
import { useProgress } from "../features/guide/useProgress";
import { useNarrow } from "../lib/useNarrow";
import { AnchorLayer } from "../features/food/AnchorLayer";
import { FoodTopBar } from "../features/food/FoodTopBar";
import { MapLayerToolbar } from "../features/food/MapLayerToolbar";
import { FoodLegend } from "../features/food/FoodLegend";
import { MapDock } from "../features/food/MapDock";
import { RankingTable } from "../features/food/RankingTable";
import { useFoodAnchors, useFoodBubbles, useFoodCategories, useFoodHeat, useFoodStores, useSearchStores, type Bounds } from "../features/food/useFood";
import { HeatmapLayer } from "../features/food/HeatmapLayer";
import type { HeatMetric } from "../lib/heatmap";
import { UnitStoreList } from "../features/food/UnitStoreList";
import { CompareDashboard } from "../features/food/CompareDashboard";
import { checkShare, shareIssueText } from "../lib/shareCheck";
import { MapPeekContext } from "../components/MapPeekContext";
import { StartPanel } from "../features/guide/StartPanel";
import { ExplorePanel } from "../features/food/ExplorePanel";
import { CandidateBox } from "../features/area/CandidateBox";
import { MonthlyPicker } from "../features/stores/MonthlyPicker";
import { presetById, type PresetId } from "../lib/explorePresets";
import { loadMyStores } from "../lib/monthlyCheck";
import { FavoritesPanel } from "../features/area/FavoritesPanel";
import { MAX_FAVORITES, addFavorite, favKey, isFavorite, loadFavorites, parseShare, removeFavorite, saveFavorites, shareSearch, type FavoriteArea } from "../lib/favorites";
import { loadRecent, pushRecent, saveRecent, suggestForCompare, type RecentUnit } from "../lib/recentUnits";
import { AreaOverviewPanel } from "../features/area/AreaOverviewPanel";
import { StoreDetailPanel } from "../features/stores/StoreDetailPanel";
import { usePeerStores, useStoreDetail } from "../features/stores/useStores";
import { SelectedStoreMarker } from "../features/food/SelectedStoreMarker";
import { UnitBoundaryLayer } from "../features/food/UnitBoundaryLayer";
import type { FoodBubble, FoodBubblesResponse, FoodLevel, FoodMetric, OverviewTrdar, RebZone, SearchResult } from "../lib/apiClient";
import { cautionText, coverageText, reasonText } from "../lib/foodText";
import { canAct, classifyBubbles, viewState } from "../lib/queryState";
import { searchTarget } from "../lib/searchTarget";
import { formatMetric, formatPerArea, formatPercent } from "../lib/format";
import { DEFAULT_LEVEL, toKakaoLatLng } from "../lib/geo";
import { revealDelta } from "../lib/reveal";
import { NARROW_MAX_PX, OVERLAY_Z_INDEX, RAIL_WIDTH_PX, SIDE_PANEL_WIDTH_PX, TOP_BAR_HEIGHT_PX, zoomToUnit } from "../lib/vizConfig";

const UNIT_LABEL = { gu: "자치구", dong: "행정동", trdar: "상권", stores: "개별 매장" } as const;
const MAX_COMPARE = 4;
const ZOOM_IN_TO = { gu: 7, dong: 5, trdar: 3 } as const;
/** 그 단위의 버블이 보이는 확대 단계(검색이 상권·행정동을 열 때와 같은 값) — 공유 주소·관심 지역 다시 열기에서 쓴다 */
const OPEN_AT = { dong: 6, trdar: 4 } as const;

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
  /** 행정동에서 세부 상권으로 들어온 경우의 되돌아갈 요약 */
  parent?: Selection;
  type?: string | null;
};

function bubbleToSelection(b: FoodBubble, data: FoodBubblesResponse): Selection {
  const level = data.level;
  const stores = data.metric === "stores";
  const value = formatMetric(data.kind, b.value);
  const cover = coverageText(b.coverage);
  const caution = cautionText(b.coverage);
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
        ...(caution ? [{ label: "표본 주의", value: caution }] : []),
      ]),
      { label: `점포 수 · ${data.scope.stores_label}`, value: b.size === null ? "자료 없음" : `${b.size.toLocaleString()}곳` },
      ...(stores ? [] : [{ label: "기준", value: data.as_of }]),
      { label: "단위", value: UNIT_LABEL[level] },
    ],
    center: { lon: b.lon, lat: b.lat },
    unit: level === "gu" ? undefined : { level, code: b.code },
    compare: { level, code: b.code },
    zoomTo: ZOOM_IN_TO[level],
    type: b.type,
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
  const [mode, setMode] = useMode();
  const { seen, mark } = useProgress();
  const tour = useTour(mode);
  const narrow = useNarrow();
  // 공유 주소(?unit=…&svc=…)로 들어왔으면 그 지역·업종으로 연다 — 주소에는 모드·지역·업종 코드만 있다
  const [shareTarget] = useState(() => parseShare(window.location.search));
  const shareDone = useRef(false);
  const [svcRaw, setSvc] = useState<string | null>(() => shareTarget?.svc ?? null);
  const [sclsRaw, setScls] = useState<string | null>(() => (shareTarget?.svc ? shareTarget.scls : null));
  const [metric, setMetric] = useState<FoodMetric>("stores");
  const [rebZonesVisible, setRebZonesVisible] = useState(false);
  const [anchorsVisible, setAnchorsVisible] = useState(false);
  const [heatMetric, setHeatMetric] = useState<HeatMetric | null>(null);
  const [mapKakao, setMapKakao] = useState<{ map: any; kakao: typeof window.kakao } | null>(null);
  const [zoom, setZoom] = useState(DEFAULT_LEVEL);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  // 이름 검색('본죽')에서 '모두 보기'를 고른 검색어 — 그 이름의 매장 전부를 지도에 올려 둔다.
  const [brand, setBrand] = useState<string | null>(null);
  const brandStores = useSearchStores(brand);
  // 입지 비교 목록 — 같은 지도 단위끼리만, 최대 MAX_COMPARE 곳
  const [basket, setBasket] = useState<{ level: FoodLevel; codes: string[] } | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  // 모드별 첫 화면·조건 탐색·검토함·월간 점검
  const [startOpen, setStartOpen] = useState(true);
  const [explore, setExplore] = useState<{ preset: PresetId; level: "dong" | "trdar" } | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [monthlyFor, setMonthlyFor] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [rivalId, setRivalId] = useState<string | null>(null);   // 경쟁 가게 목록에서 열어 본 매장
  // 좁은 화면: 서랍을 접고 지도를 보는 중인가(다른 매장·지역을 고르면 다시 서랍을 연다)
  const [peekAt, setPeekAt] = useState<string | null>(null);
  // 매장 상세에서 보고 있는 묶음 — '주변'(경쟁 분석)일 때만 경쟁 매장·상권 경계를 진하게 그린다(매장이 바뀌면 이전 값은 무시)
  const [groupAt, setGroupAt] = useState<{ id: string; group: string } | null>(null);
  // 관심 지역 — 이 브라우저에만 최대 10곳(계정·서버 없음)
  const [favorites, setFavorites] = useState<FavoriteArea[]>(() => loadFavorites());
  const [favOpen, setFavOpen] = useState(false);
  const [favNote, setFavNote] = useState<string | null>(null);
  // 열릴 지역의 위치로 지도를 한 번 옮기기 위한 표시(공유 주소·관심 지역 다시 열기)
  const focusCode = useRef<string | null>(null);
  // 최근 본 상권·행정동 — 비교 후보 제안에만 쓴다(이 브라우저에만 저장)
  const [recent, setRecent] = useState<RecentUnit[]>(() => loadRecent());
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
  // 주소·관심 지역의 업종 코드가 지원하지 않는 값이면 '외식 전체'로 열고 안내한다(업종 목록이 도착한 뒤에만 판정)
  const svcIssue = checkShare({ svc: svcRaw, scls: sclsRaw, groups: categories.data?.groups ?? null, pending: null, unitCodes: null });
  const svc = svcIssue.svcInvalid ? null : svcRaw;
  const scls = svcIssue.svcInvalid || svcIssue.sclsInvalid ? null : sclsRaw;
  const bubbles = useFoodBubbles(unit === "stores" ? null : unit, metric, svc, scls);
  const points = useFoodStores(unit === "stores" ? bounds : null, svc, scls);
  const regions = useRegions();
  const rebZones = useRebZones();
  // 스세권·다세권 지표를 고르면 매장 위치도 함께 보여준다.
  const anchorsForced = metric === "starbucks_zone_share" || metric === "daiso_zone_share";
  const showAnchors = anchorsVisible || anchorsForced;
  const anchors = useFoodAnchors(showAnchors);
  const heat = useFoodHeat(heatMetric);
  // 지표를 바꾸는 동안에는 이전 지표의 점이 아니라 새 지표가 올 때까지 그리지 않는다(값이 섞여 보이지 않도록)
  const heatData = heat.data && heat.data.metric === heatMetric ? heat.data : undefined;

  // 상세를 보고 있는 매장: 어디 있는지(좌표)와, 어느 매장들·어느 영역과 비교한 숫자인지(비교 단위 매장·경계)
  const selectedDetail = useStoreDetail(storeId ?? "", storeId !== null);
  const selectedStore = storeId !== null ? selectedDetail.data?.store : undefined;
  const selLon = selectedStore?.lon ?? null;
  const selLat = selectedStore?.lat ?? null;
  const peers = usePeerStores(storeId);
  const peerData = storeId !== null && peers.data?.status === "ok" ? peers.data : null;
  // 검색으로 연 매장은 검색 핀과 선택 매장 마커가 같은 자리라 이름표가 겹친다 — 선택 매장 마커(가장 뚜렷)만 남긴다
  const samePlaceAsSelectedStore = place !== null && selLon !== null && selLat !== null && Math.abs(place.lon - selLon) < 1e-4 && Math.abs(place.lat - selLat) < 1e-4;
  const competitionView = storeId !== null && groupAt?.id === storeId && groupAt.group === "radius";
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
        left: SIDE_PANEL_WIDTH_PX + (window.matchMedia(`(max-width: ${NARROW_MAX_PX}px)`).matches ? 0 : RAIL_WIDTH_PX) + 48, top: TOP_BAR_HEIGHT_PX + 48, right: 48, bottom: 48,
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
  const unitMissing = checkShare({
    svc: null, scls: null, groups: null, pending: pendingOpen,
    unitCodes: pendingOpen && bubbles.data && bubblesActionable && bubbles.data.level === pendingOpen.unit ? bubbles.data.bubbles.map((b) => b.code) : null,
  }).unitMissing;
  const issueText = shareIssueText({ ...svcIssue, unitMissing });
  const [dismissedIssue, setDismissedIssue] = useState<string | null>(null);

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
  const openPlace = useCallback((r: SearchResult) => {
    if (!mapKakao) return;
    const target = searchTarget(r);
    setPlace({ name: r.name, lon: r.lon, lat: r.lat });
    setSelection(null);
    setStoreId(target.storeId);
    setPendingOpen(target.open ? { unit: target.open.unit, code: target.open.code } : null);
    mapKakao.map.setLevel(target.level);
    mapKakao.map.setCenter(toKakaoLatLng(mapKakao.kakao, r));
  }, [mapKakao]);
  const onPickPlace = useCallback((r: SearchResult, typed: string) => {
    mark("place");
    if (r.kind === "brand") {
      // 같은 이름의 매장 전부 — 하나를 열지 않고 지도에 모두 올린다(위치 핀·열린 패널은 닫는다).
      setBrand(typed);
      setPlace(null);
      setSelection(null);
      setStoreId(null);
      setPendingOpen(null);
      return;
    }
    setBrand(null);
    openPlace(r);
  }, [mark, openPlace]);
  const onClearPlace = useCallback(() => { setPlace(null); setPendingOpen(null); }, []);

  useEffect(() => {
    const t = shareTarget;
    if (!t || !mapKakao || shareDone.current) return;
    shareDone.current = true;
    focusCode.current = t.code;
    setPendingOpen({ unit: t.level, code: t.code });
    mapKakao.map.setLevel(OPEN_AT[t.level]);
  }, [mapKakao, shareTarget]);

  // 첫 화면은 기본 행정동을 열어 두는 대신 모드별 시작 화면(StartPanel)이 질문으로 시작한다.
  const autoCode = useRef<string | null>(null);

  // 검색한 상권·행정동의 버블이 현재 조건으로 도착하면 그 요약을 연다(이전 조건의 결과가 아닐 때만).
  const searchSelection = useMemo(() => {
    if (!pendingOpen || !bubbles.data || !bubblesActionable || bubbles.data.level !== pendingOpen.unit) return null;
    const b = bubbles.data.bubbles.find((x) => x.code === pendingOpen.code);
    return b ? bubbleToSelection(b, bubbles.data) : null;
  }, [pendingOpen, bubbles.data, bubblesActionable]);
  useEffect(() => {
    if (!searchSelection?.center || !mapKakao || focusCode.current === null || searchSelection.unit?.code !== focusCode.current) return;
    focusCode.current = null;
    mapKakao.map.setCenter(toKakaoLatLng(mapKakao.kakao, searchSelection.center));
  }, [searchSelection, mapKakao]);
  const shownSelection = selection ?? searchSelection;
  const startVisible = startOpen && !explore && storeId === null && shownSelection === null && shareTarget === null;
  const myStores = useMemo(() => (startVisible && mode === "owner" ? loadMyStores() : []), [startVisible, mode]);
  // 좁은 화면에서 서랍(매장 상세·상권 분석)이 열려 있으면 그 위를 덮는 지도 도구·이용 순서·범례는 가린다
  const peekKey = `${storeId ?? ""}|${shownSelection?.unit ? `${shownSelection.unit.level}:${shownSelection.unit.code}` : ""}`;
  const peekMap = peekAt === peekKey;
  const hideOverlays = narrow && !peekMap && (storeId !== null || shownSelection !== null);

  // 이용 순서 표시용: 화면에서 일어난 일을 기록한다(한 번 일어나면 이 방문 동안 유지).
  const shownUnitLevel = shownSelection?.unit?.level ?? null;
  const shownUnitCode = shownSelection?.unit?.code ?? null;
  useEffect(() => { if (storeId !== null) mark("store"); }, [storeId, mark]);
  const shownTitle = shownSelection?.title ?? null;
  const shownType = shownSelection?.type ?? null;
  useEffect(() => {
    if (shownUnitCode === null || shownTitle === null || (shownUnitLevel !== "dong" && shownUnitLevel !== "trdar") || shownUnitCode === autoCode.current) return;
    const name = shownType && shownTitle.endsWith(`(${shownType})`) ? shownTitle.slice(0, -(shownType.length + 2)).trim() : shownTitle;
    setRecent((r) => { const next = pushRecent(r, { level: shownUnitLevel, code: shownUnitCode, name, type: shownType }); saveRecent(next); return next; });
  }, [shownUnitLevel, shownUnitCode, shownTitle, shownType]);
  useEffect(() => {
    if (shownUnitCode === null) { autoCode.current = null; return; }
    if ((shownUnitLevel === "dong" || shownUnitLevel === "trdar") && shownUnitCode !== autoCode.current) mark("area");
  }, [shownUnitLevel, shownUnitCode, mark]);
  useEffect(() => { if (metric !== "stores") mark("metric"); }, [metric, mark]);
  useEffect(() => { if (svc !== null) mark("svc"); }, [svc, mark]);
  useEffect(() => { if ((basket?.codes.length ?? 0) >= 2) mark("basket2"); }, [basket, mark]);
  useEffect(() => { if (compareOpen) mark("compare"); }, [compareOpen, mark]);
  const openFavorite = (f: FavoriteArea) => {
    if (!mapKakao) return;
    setBrand(null); setPlace(null); setStoreId(null); setSelection(null);
    setSvc(f.svc); setScls(f.scls);
    focusCode.current = f.code;
    setPendingOpen({ unit: f.level, code: f.code });
    mapKakao.map.setLevel(OPEN_AT[f.level]);
    if (f.lon !== null && f.lat !== null) mapKakao.map.setCenter(toKakaoLatLng(mapKakao.kakao, { lon: f.lon, lat: f.lat }));
    setFavOpen(false);
  };
  const updateFavorites = (next: FavoriteArea[]) => { setFavorites(next); if (!saveFavorites(next)) setFavNote("이 브라우저가 저장을 막아 새로고침하면 관심 지역이 사라집니다."); };
  const toggleFavorite = (f: FavoriteArea) => {
    if (isFavorite(favorites, f)) { updateFavorites(removeFavorite(favorites, favKey(f))); setFavNote(null); return; }
    const r = addFavorite(favorites, f);
    if (r.status === "full") setFavNote(`관심 지역은 최대 ${MAX_FAVORITES}곳까지예요. 목록에서 하나를 지운 뒤 담아 주세요.`);
    else if (r.status === "added") { updateFavorites(r.list); setFavNote(null); }
  };
  const favCompareBlock = (f: FavoriteArea): string | null =>
    basket && basket.level === f.level && basket.codes.includes(f.code) ? "이미 비교 목록에 있어요" : basket && basket.level !== f.level ? "비교 목록이 다른 단위예요(크기가 다른 단위는 섞지 않습니다)." : basket && !basket.codes.includes(f.code) && basket.codes.length >= MAX_COMPARE ? `비교는 최대 ${MAX_COMPARE}곳` : null;
  // ── 모드별 시작·조건 탐색·검토함·월간 점검 ──
  const focusSearch = () => { setStartOpen(false); document.querySelector<HTMLInputElement>('[data-tour="search"] input')?.focus(); };
  const openExplore = (preset: PresetId, level: "dong" | "trdar" = explore?.level ?? "dong") => {
    setExplore({ preset, level });
    setStartOpen(false);
    setSelection(null); setPendingOpen(null); setStoreId(null); setPlace(null); setBrand(null);
    setMetric(presetById(preset)?.metric ?? "stores");        // 지도도 같은 지표로 칠한다
    mapKakao?.map.setLevel(OPEN_AT[level]);                    // 지도 단위를 후보 단위와 맞춘다
  };
  const addCompare = (level: FoodLevel, code: string) =>
    setBasket((b) => (b && b.level === level ? (b.codes.includes(code) || b.codes.length >= MAX_COMPARE ? b : { level, codes: [...b.codes, code] }) : { level, codes: [code] }));
  const pickCandidate = (b: FoodBubble, data: FoodBubblesResponse) => {
    setPendingOpen(null); setStoreId(null);
    setSelection(bubbleToSelection(b, data));
    mapKakao?.map.setCenter(toKakaoLatLng(mapKakao.kakao, b));
  };
  const favFromBubble = (b: FoodBubble, level: "dong" | "trdar"): FavoriteArea => ({ level, code: b.code, name: b.name, type: b.type, lon: b.lon, lat: b.lat, svc, scls });
  const exploreBlock = (code: string): string | null => {
    if (!explore) return null;
    if (basket && basket.level !== explore.level) return "비교 목록이 다른 단위예요(크기가 다른 단위는 섞지 않습니다).";
    if (basket && !basket.codes.includes(code) && basket.codes.length >= MAX_COMPARE) return `비교는 최대 ${MAX_COMPARE}곳`;
    return null;
  };
  const openMonthly = (id: string) => { setPickerOpen(false); setStartOpen(false); setBrand(null); setPlace(null); setSelection(null); setPendingOpen(null); setStoreId(id); setMonthlyFor(id); };
  const industryNameOf = (sv: string | null, sc: string | null) => {
    const g = categories.data?.groups.find((x) => x.svc_cd === sv);
    return sc ? (g?.details.find((d) => d.code === sc)?.name ?? "세부 업종") : (g?.svc_nm ?? "외식 전체");
  };
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
            selectedId={storeId} hoveredId={hoveredId} peerIds={peerIds} emphasizePeers={competitionView}
          />
        )}
        {mapKakao && peerData?.boundary && <UnitBoundaryLayer map={mapKakao.map} kakao={mapKakao.kakao} geometry={peerData.boundary} strong={competitionView} />}
        {mapKakao && brand !== null && brandStores.data && (
          <SearchStoresLayer map={mapKakao.map} kakao={mapKakao.kakao} stores={brandStores.data.stores} selectedId={storeId} onSelect={onStore} fit />
        )}
        {mapKakao && selectedStore && <SelectedStoreMarker map={mapKakao.map} kakao={mapKakao.kakao} store={selectedStore} svc={selectedStore.category.svc ?? null} />}
        {mapKakao && showAnchors && anchors.data && (
          <AnchorLayer map={mapKakao.map} kakao={mapKakao.kakao} data={anchors.data} showWalkCircles={unit === "trdar" || unit === "stores"} />
        )}
        {mapKakao && <SearchMarker map={mapKakao.map} kakao={mapKakao.kakao} place={samePlaceAsSelectedStore ? null : place} />}
        {mapKakao && heatData && <HeatmapLayer map={mapKakao.map} kakao={mapKakao.kakao} data={heatData} />}
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
          onPickPlace={onPickPlace}
          pickedPlaceName={place?.name ?? null}
          onClearPlace={onClearPlace}
          mode={mode}
          onModeChange={(m) => { setMode(m); setStartOpen(true); setExplore(null); setReviewOpen(false); setPickerOpen(false); setMonthlyFor(null); }}
          onHelp={tour.openHelp}
          modeMenu={mode === "founder"
            ? { label: "후보지 검토함", count: favorites.length, onClick: () => setReviewOpen(true) }
            : { label: "월간 점검", count: null, onClick: () => (storeId !== null ? setMonthlyFor(storeId) : setPickerOpen(true)) }}
          favCount={favorites.length}
          favOpen={favOpen}
          onToggleFav={() => setFavOpen((v) => !v)}
        />
        {reviewOpen && (
          <CandidateBox
            favorites={favorites}
            industryName={industryNameOf}
            compareBlock={favCompareBlock}
            onOpenArea={(f) => { setReviewOpen(false); setExplore(null); setStartOpen(false); openFavorite(f); }}
            onCompare={(f) => addCompare(f.level, f.code)}
            onRemove={(f) => updateFavorites(removeFavorite(favorites, favKey(f)))}
            onClose={() => setReviewOpen(false)}
          />
        )}
        {pickerOpen && <MonthlyPicker stores={loadMyStores()} onPick={openMonthly} onSearch={() => { setPickerOpen(false); focusSearch(); }} onClose={() => setPickerOpen(false)} />}
        {favOpen && (
          <FavoritesPanel
            favorites={favorites}
            industryName={industryNameOf}
            compareBlock={favCompareBlock}
            shareUrl={(f) => `${window.location.origin}${window.location.pathname}${shareSearch(mode, f)}`}
            narrow={narrow}
            onOpen={openFavorite}
            onCompare={(f) => {
              setBasket((b) => (b && b.level === f.level ? (b.codes.includes(f.code) ? b : { level: f.level, codes: [...b.codes, f.code] }) : { level: f.level, codes: [f.code] }));
              setCompareOpen(true);
              setFavOpen(false);
            }}
            onRemove={(f) => updateFavorites(removeFavorite(favorites, favKey(f)))}
            onClose={() => setFavOpen(false)}
          />
        )}
        {brand !== null && !hideOverlays && (
          <SearchResultChip query={brand} total={brandStores.data?.total ?? null} truncated={brandStores.data?.truncated ?? false} loading={brandStores.isPending} failed={brandStores.isError} onClose={() => setBrand(null)} />
        )}
        <TourLayer mode={mode} tour={tour} />
        {issueText && issueText !== dismissedIssue && (
          <div role="alert" style={{ position: "absolute", zIndex: OVERLAY_Z_INDEX + 2, top: 62, left: 12, right: 12, maxWidth: 520, background: "#FFFBEB", color: "#92400E", border: "1px solid #FCD34D", borderRadius: 10, padding: "10px 12px", fontSize: 12.5, boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>
            {issueText}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              <button type="button" onClick={() => { document.querySelector<HTMLInputElement>('[data-tour="search"] input')?.focus(); setDismissedIssue(issueText); }} style={issueBtn(true)}>직접 검색하기</button>
              <button type="button" onClick={() => { setSvc(null); setScls(null); setPendingOpen(null); window.history.replaceState(null, "", `${window.location.pathname}?mode=${mode}`); }} style={issueBtn(false)}>처음 상태로</button>
              <button type="button" onClick={() => setDismissedIssue(issueText)} style={issueBtn(false)}>닫기</button>
            </div>
          </div>
        )}
        {!hideOverlays && <MapLayerToolbar
          anchorsOn={showAnchors}
          anchorsForced={anchorsForced}
          onAnchorsChange={setAnchorsVisible}
          rebOn={rebZonesVisible}
          onRebChange={setRebZonesVisible}
          heat={{ metric: heatMetric, onChange: setHeatMetric, data: heatData, loading: heatMetric !== null && heat.isPending, failed: heatMetric !== null && heat.isError }}
        />}
        {!hideOverlays && <FlowGuide mode={mode} seen={seen} />}
        {!hideOverlays && <MapDock
          legend={
            <FoodLegend
              data={bubbles.data}
              showStores={unit === "stores"}
              rebZonesVisible={rebZonesVisible}
              anchors={showAnchors ? anchors.data : undefined}
              stale={bubblesStale}
              rebQuarter={rebQuarters?.rent_small_shop ?? null}
              storeRoles={storeId !== null ? { peers: peerIds !== null, boundary: Boolean(peerData?.boundary), emphasized: competitionView } : null}
            />
          }
          ranking={
            unit === "stores" ? (
              <div style={{ color: "#4B5563" }}>가장 확대한 화면은 개별 매장 점이라 순위표가 없어요. 지도를 축소하면 {UNIT_LABEL.trdar}·{UNIT_LABEL.dong} 순위표를 볼 수 있어요.</div>
            ) : (
              <RankingTable data={bubbles.data} unitLabel={UNIT_LABEL[unit]} stale={bubblesStale} actionable={bubblesActionable} onPick={onRankPick} />
            )
          }
        />}

        <MapPeekContext.Provider value={narrow ? () => setPeekAt(peekKey) : null}>
        <div style={{ display: peekMap ? "none" : "contents" }}>
        {storeId ? (
          <StoreDetailPanel
            storeId={storeId}
            mode={mode}
            onProgress={mark}
            mapView={mapKakao}
            onGroupChange={(g) => setGroupAt({ id: storeId, group: g })}
            onSelectStore={(id) => { setHoveredId(null); setRivalId(id); setStoreId(id); }}
            onHoverStore={setHoveredId}
            asRival={rivalId === storeId}
            monthlyOpen={monthlyFor === storeId}
            onMonthlyOpenChange={(open) => setMonthlyFor(open ? storeId : null)}
            onBack={() => setStoreId(null)}
            onClose={() => { setStoreId(null); setSelection(null); setPendingOpen(null); }}
            onOpenArea={({ level, store }) => {
              // 행정동 종합분석을 먼저 만들고, 상권이면 그 위에 상권 분석을 올려 '뒤로'가 행정동으로 돌아가게 한다.
              const center = { lon: store.lon, lat: store.lat };
              const dongSel: Selection = {
                title: store.dong, brief: "", rows: [], center, unit: { level: "dong", code: store.adong_cd },
                compare: { level: "dong", code: store.adong_cd }, zoomTo: ZOOM_IN_TO.dong,
              };
              const t = store.trdar;
              const sel: Selection = level === "trdar" && t
                ? { title: t.name, brief: "", rows: [], type: t.type, center: { lon: t.lon, lat: t.lat }, unit: { level: "trdar", code: t.code },
                    compare: { level: "trdar", code: t.code }, zoomTo: ZOOM_IN_TO.trdar, parent: dongSel }
                : dongSel;
              setPendingOpen(null);
              setStoreId(null);
              setSelection(sel);
              if (mapKakao && sel.center && sel.zoomTo !== undefined) {
                mapKakao.map.setLevel(sel.zoomTo);
                mapKakao.map.setCenter(toKakaoLatLng(mapKakao.kakao, sel.center));
              }
            }}
          />
        ) : (
          shownSelection ? (() => {
            const sel = shownSelection;
            const unitNotice = sel.compare && sel.compare.level !== unit ? (
              <div role="status" style={{ background: "#EFF6FF", color: "#1E3A8A", borderRadius: 8, padding: "8px 10px", fontSize: 12, marginBottom: 12 }}>
                지도는 지금 {UNIT_LABEL[unit]} 단위로 보여요. 아래 요약은 {UNIT_LABEL[sel.compare.level]} 기준 숫자예요.
              </div>
            ) : null;
            const buttons = (
              <>
                {sel.center && sel.zoomTo !== undefined && mapKakao && (
                  <button
                    type="button"
                    onClick={() => {
                      mapKakao.map.setLevel(sel.zoomTo);
                      mapKakao.map.setCenter(toKakaoLatLng(mapKakao.kakao, sel.center!));
                    }}
                    style={{ width: "100%", padding: "8px 0", marginBottom: 12, borderRadius: 8, border: "1px solid #3B82F6", background: "white", color: "#3B82F6", cursor: "pointer" }}
                  >
                    지도에서 이 지역 보기
                  </button>
                )}
                {sel.unit && sel.unit.level !== "gu" && (() => {
                  const f: FavoriteArea = { level: sel.unit.level as "dong" | "trdar", code: sel.unit.code, name: plainTitle(sel.title, sel.type), type: sel.type ?? null, lon: sel.center?.lon ?? null, lat: sel.center?.lat ?? null, svc, scls };
                  const on = isFavorite(favorites, f);
                  return (
                    <div style={{ marginBottom: 12 }}>
                      <button type="button" aria-pressed={on} onClick={() => toggleFavorite(f)} style={{ width: "100%", padding: "8px 0", borderRadius: 8, border: "1px solid #D97706", background: on ? "#FEF3C7" : "white", color: "#92400E", cursor: "pointer" }}>
                        {on ? "★ 관심 지역에서 빼기" : `☆ 관심 지역에 담기 (${favorites.length}/${MAX_FAVORITES})`}
                      </button>
                      {favNote && <div role="status" style={{ fontSize: 11, color: "#B45309", marginTop: 2 }}>{favNote}</div>}
                    </div>
                  );
                })()}
                {sel.compare && (
                  <CompareButton
                    basket={basket}
                    target={sel.compare}
                    onAdd={() => {
                      const c = sel.compare!;
                      setBasket((b) => (b && b.level === c.level ? { level: c.level, codes: [...b.codes, c.code] } : { level: c.level, codes: [c.code] }));
                      setCompareOpen(true);
                    }}
                  />
                )}
              </>
            );
            const actions = <>{unitNotice}{buttons}</>;
            const close = () => { setSelection(null); setPendingOpen(null); };
            // 행정동·상권은 종합분석을 먼저, 매장 목록은 그 패널의 마지막 섹션. 자치구·R-ONE 은 기존 요약 패널.
            if (sel.unit && sel.unit.level !== "gu") {
              return (
                <AreaOverviewPanel
                  key={`${sel.unit.level}:${sel.unit.code}`}
                  onProgress={mark}
                  mode={mode}
                  level={sel.unit.level}
                  code={sel.unit.code}
                  title={sel.title}
                  type={sel.type}
                  svc={svc}
                  scls={scls}
                  filterName={filterName}
                  parentName={sel.parent?.title}
                  notice={unitNotice}
                  actions={buttons}
                  onBack={sel.parent ? () => setSelection(sel.parent!) : explore ? () => setSelection(null) : undefined}
                  backLabel={!sel.parent && explore ? "← 후보 목록으로" : undefined}
                  onClose={close}
                  onSelectTrdar={(t: OverviewTrdar) => {
                    setSelection({
                      title: t.name, brief: "", rows: [], type: t.type, center: { lon: t.lon, lat: t.lat }, unit: { level: "trdar", code: t.code },
                      compare: { level: "trdar", code: t.code }, zoomTo: ZOOM_IN_TO.trdar, parent: sel,
                    });
                    if (mapKakao) {
                      mapKakao.map.setLevel(ZOOM_IN_TO.trdar);
                      mapKakao.map.setCenter(toKakaoLatLng(mapKakao.kakao, t));
                    }
                  }}
                  onSelectStore={(id) => { setHoveredId(null); setStoreId(id); }}
                  onHoverStore={setHoveredId}
                  basketHas={(basket?.codes.length ?? 0) > 0}
                  // 다른 단위(행정동↔상권)가 담겨 있으면 목록을 조용히 비우지 않도록 이동 항목을 보이지 않는다(위 '비우고 비교' 버튼이 따로 묻는다)
                  onCompare={sel.compare && (!basket || basket.level === sel.compare.level) ? () => {
                    const c = sel.compare!;
                    setBasket((b) => (b && b.codes.includes(c.code)) || (b?.codes.length ?? 0) >= MAX_COMPARE ? b : { level: c.level, codes: [...(b?.codes ?? []), c.code] });
                    setCompareOpen(true);
                  } : undefined}
                  onFocusSearch={() => document.querySelector<HTMLInputElement>('[data-tour="search"] input')?.focus()}
                />
              );
            }
            return (
              <InfoPanel title={sel.title} brief={sel.brief} rows={sel.rows} onClose={close}>
                {sel.notice && (
                  <div style={{ background: "#FFFBEB", color: "#92400E", borderRadius: 8, padding: "8px 10px", fontSize: 12, marginBottom: 12 }}>{sel.notice}</div>
                )}
                {actions}
                {sel.unit && (
                  <UnitStoreList level={sel.unit.level} code={sel.unit.code} svc={svc} scls={scls} filterName={filterName} onSelect={(id) => { setHoveredId(null); setStoreId(id); }} onHover={setHoveredId} />
                )}
              </InfoPanel>
            );
          })() : explore ? (
            <ExplorePanel
              presetId={explore.preset}
              level={explore.level}
              svc={svc}
              scls={scls}
              filterName={filterName}
              onPick={pickCandidate}
              onCompare={(code) => addCompare(explore.level, code)}
              onFavorite={(b) => toggleFavorite(favFromBubble(b, explore.level))}
              isFavorite={(code) => isFavorite(favorites, { level: explore.level, code })}
              inBasket={(code) => basket?.level === explore.level && basket.codes.includes(code)}
              basketBlock={exploreBlock}
              onPreset={(id) => openExplore(id)}
              onLevel={(l) => openExplore(explore.preset, l)}
              onClose={() => setExplore(null)}
            />
          ) : startVisible ? (
            <StartPanel
              mode={mode}
              categories={categories.data}
              reviewCount={favorites.length}
              myStores={myStores}
              onUndecided={() => openExplore("growing")}
              onPickSvc={(sv) => { setSvc(sv); setScls(null); openExplore("growing"); }}
              onFocusSearch={focusSearch}
              onOpenReview={() => { setStartOpen(false); setReviewOpen(true); }}
              onOpenMonthly={openMonthly}
              onAreaFirst={() => openExplore("growing")}
              onClose={() => setStartOpen(false)}
            />
          ) : null
        )}
        </div>
        </MapPeekContext.Provider>

        {narrow && peekMap && (storeId !== null || shownSelection !== null) && (
          <button
            type="button"
            onClick={() => setPeekAt(null)}
            style={{ position: "absolute", zIndex: OVERLAY_Z_INDEX + 3, top: 108, left: 12, padding: "8px 14px", borderRadius: 999, border: "none", background: "#1D4ED8", color: "white", fontWeight: 700, boxShadow: "0 2px 8px rgba(0,0,0,0.25)", cursor: "pointer" }}
          >
            ← 상세 보기
          </button>
        )}
        {basket && !compareOpen && (
          <button
            type="button"
            data-tour="compare-open"
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
          <CompareDashboard
            level={basket.level}
            codes={basket.codes}
            svc={svc}
            scls={scls}
            filterName={filterName}
            onAdd={(code) => setBasket((b) => (b && b.codes.length < MAX_COMPARE && !b.codes.includes(code) ? { ...b, codes: [...b.codes, code] } : b))}
            onRemove={(code) => setBasket((b) => (b && b.codes.length > 1 ? { ...b, codes: b.codes.filter((c) => c !== code) } : null))}
            onClose={() => setCompareOpen(false)}
            suggestions={suggestForCompare(recent, basket.level, basket.codes)}
            onShowOnMap={mapKakao && basket.level !== "gu" ? ({ level, lon, lat }) => {
              setCompareOpen(false);
              mapKakao.map.setLevel(ZOOM_IN_TO[level as "dong" | "trdar"]);
              mapKakao.map.setCenter(toKakaoLatLng(mapKakao.kakao, { lon, lat }));
            } : undefined}
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

const issueBtn = (primary: boolean): React.CSSProperties => ({ padding: "4px 10px", borderRadius: 6, border: `1px solid ${primary ? "#B45309" : "#D1D5DB"}`, background: primary ? "#B45309" : "white", color: primary ? "white" : "#374151", cursor: "pointer", fontSize: 12 });

function plainTitle(title: string, type?: string | null): string {
  return type && title.endsWith(`(${type})`) ? title.slice(0, -(type.length + 2)).trim() : title;
}

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
    <div data-tour="compare-add" style={{ marginBottom: 12 }}>
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
