import { useCallback, useEffect, useState } from "react";
import { InfoPanel, type InfoRow } from "../components/InfoPanel";
import { KakaoMap } from "../features/map/KakaoMap";
import { RegionOutlineLayer } from "../features/map/RegionOutlineLayer";
import { RebZoneLayer } from "../features/map/RebZoneLayer";
import { useRegions, useRebZones } from "../features/map/useMapData";
import { AreaBubbleLayer } from "../features/food/AreaBubbleLayer";
import { StorePointLayer } from "../features/food/StorePointLayer";
import { AnchorLayer } from "../features/food/AnchorLayer";
import { FoodTopBar } from "../features/food/FoodTopBar";
import { FoodLegend } from "../features/food/FoodLegend";
import { useFoodAnchors, useFoodBubbles, useFoodCategories, useFoodStores, type Bounds } from "../features/food/useFood";
import { UnitStoreList } from "../features/food/UnitStoreList";
import { ComparePanel } from "../features/food/ComparePanel";
import { StoreDetailPanel } from "../features/stores/StoreDetailPanel";
import type { FoodBubble, FoodBubblesResponse, FoodLevel, FoodMetric, RebZone } from "../lib/apiClient";
import { formatMetric, formatPerArea, formatPercent } from "../lib/format";
import { DEFAULT_LEVEL, toKakaoLatLng } from "../lib/geo";
import { OVERLAY_Z_INDEX, zoomToUnit } from "../lib/vizConfig";

const UNIT_LABEL = { gu: "자치구", dong: "행정동", trdar: "상권", stores: "개별 매장" } as const;
const ZOOM_IN_TO = { gu: 7, dong: 5, trdar: 3 } as const;

type Selection = {
  title: string;
  brief: string;
  rows: InfoRow[];
  center?: { lon: number; lat: number };
  /** 매장 목록을 보여줄 단위(자치구는 매장이 너무 많아 목록 대신 확대 안내) */
  unit?: { level: FoodLevel; code: string };
  /** 입지 비교에 담을 수 있는 버블 */
  compare?: { level: FoodLevel; code: string };
  zoomTo?: number;
};

function bubbleToSelection(b: FoodBubble, data: FoodBubblesResponse): Selection {
  const level = data.level;
  return {
    title: `${b.name}${b.type ? ` (${b.type})` : ""}`,
    brief: data.metric === "stores"
      ? `${UNIT_LABEL[level]} 기준 점포 ${formatMetric("count", b.size)}입니다.`
      : `${UNIT_LABEL[level]} 기준 ${data.label} ${formatMetric(data.kind, b.value)}, 점포 ${formatMetric("count", b.size)}입니다.`,
    rows: [
      ...(data.metric === "stores" ? [] : [{ label: data.label, value: formatMetric(data.kind, b.value) }]),
      { label: "점포 수", value: b.size === null ? "자료 없음" : `${b.size.toLocaleString()}곳` },
      ...(data.metric === "stores" ? [] : [{ label: "기준", value: data.as_of }]),
      { label: "단위", value: UNIT_LABEL[level] },
    ],
    center: { lon: b.lon, lat: b.lat },
    unit: level === "gu" ? undefined : { level, code: b.code },
    compare: { level, code: b.code },
    zoomTo: ZOOM_IN_TO[level],
  };
}

function zoneToSelection(zone: RebZone): Selection {
  return {
    title: `${zone.reb_zone_nm} (R-ONE)`,
    brief: `소규모상가 공실률 ${formatPercent(zone.vacancy_small_shop_pct)}, 임대료 ${formatPerArea(zone.rent_small_shop)}입니다.`,
    rows: [
      { label: "소규모상가 공실률", value: formatPercent(zone.vacancy_small_shop_pct) },
      { label: "소규모상가 임대료", value: formatPerArea(zone.rent_small_shop) },
      { label: "중대형상가 공실률", value: formatPercent(zone.vacancy_midlarge_shop_pct) },
      { label: "오피스 임대료", value: formatPerArea(zone.rent_office) },
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

  const onBubble = useCallback((b: FoodBubble) => {
    if (!bubbles.data) return;
    setStoreId(null);
    setSelection(bubbleToSelection(b, bubbles.data));
  }, [bubbles.data]);
  const onStore = useCallback((id: string) => setStoreId(id), []);
  const onZone = useCallback((z: RebZone) => setSelection(zoneToSelection(z)), []);
  // 업종·지표를 바꾸면 이전 조건으로 만든 요약 패널은 닫는다(값이 섞여 보이지 않도록).
  const withReset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setSelection(null); };

  const svcGroup = categories.data?.groups.find((g) => g.svc_cd === svc);
  const filterName = scls ? (svcGroup?.details.find((d) => d.code === scls)?.name ?? "세부 업종") : (svcGroup?.svc_nm ?? "외식 전체");

  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <KakaoMap onReady={(map, kakao) => setMapKakao({ map, kakao })}>
        {mapKakao && regions.data && unit !== "gu" && (
          <RegionOutlineLayer map={mapKakao.map} kakao={mapKakao.kakao} features={regions.data.features} />
        )}
        {mapKakao && bubbles.data && unit !== "stores" && (
          <AreaBubbleLayer map={mapKakao.map} kakao={mapKakao.kakao} data={bubbles.data} onSelect={onBubble} />
        )}
        {mapKakao && points.data && unit === "stores" && (
          <StorePointLayer map={mapKakao.map} kakao={mapKakao.kakao} stores={points.data.stores} onSelect={onStore} />
        )}
        {mapKakao && showAnchors && anchors.data && (
          <AnchorLayer map={mapKakao.map} kakao={mapKakao.kakao} data={anchors.data} showWalkCircles={unit === "trdar" || unit === "stores"} />
        )}
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
          anchorsVisible={showAnchors}
          anchorsForced={anchorsForced}
          onAnchorsVisibleChange={setAnchorsVisible}
        />
        <FoodLegend data={bubbles.data} showStores={unit === "stores"} rebZonesVisible={rebZonesVisible} anchors={showAnchors ? anchors.data : undefined} />

        {storeId ? (
          <StoreDetailPanel storeId={storeId} onBack={() => setStoreId(null)} onClose={() => { setStoreId(null); setSelection(null); }} />
        ) : (
          selection && (
            <InfoPanel title={selection.title} brief={selection.brief} rows={selection.rows} onClose={() => setSelection(null)}>
              {selection.center && selection.zoomTo !== undefined && mapKakao && (
                <button
                  type="button"
                  onClick={() => {
                    mapKakao.map.setLevel(selection.zoomTo);
                    mapKakao.map.setCenter(toKakaoLatLng(mapKakao.kakao, selection.center!));
                  }}
                  style={{ width: "100%", padding: "8px 0", marginBottom: 12, borderRadius: 8, border: "1px solid #3B82F6", background: "white", color: "#3B82F6", cursor: "pointer" }}
                >
                  이 지역 확대해서 보기
                </button>
              )}
              {selection.compare && (
                <CompareButton
                  basket={basket}
                  target={selection.compare}
                  onAdd={() => {
                    const c = selection.compare!;
                    setBasket((b) => (b && b.level === c.level ? { level: c.level, codes: [...b.codes, c.code] } : { level: c.level, codes: [c.code] }));
                    setCompareOpen(true);
                  }}
                />
              )}
              {selection.unit && (
                <UnitStoreList level={selection.unit.level} code={selection.unit.code} svc={svc} scls={scls} filterName={filterName} onSelect={setStoreId} />
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

        {unit === "stores" && points.data?.truncated && (
          <StatusBanner text={`이 범위의 매장 ${points.data.total.toLocaleString()}곳 중 ${points.data.stores.length}곳만 표시 — 더 확대하세요`} />
        )}
        {bubbles.isError && <StatusBanner text={`지도 데이터를 불러오지 못했습니다: ${bubbles.error.message}`} />}
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

function StatusBanner({ text }: { text: string }) {
  return (
    <div
      style={{
        position: "absolute", zIndex: OVERLAY_Z_INDEX, top: 72, left: "50%", transform: "translateX(-50%)", background: "white",
        borderRadius: 8, padding: "8px 16px", boxShadow: "0 2px 8px rgba(0,0,0,0.15)", fontSize: 13,
      }}
    >
      {text}
    </div>
  );
}
