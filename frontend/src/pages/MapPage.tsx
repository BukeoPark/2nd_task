import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { InfoPanel, type InfoRow, type TrendDot } from "../components/InfoPanel";
import { KakaoMap } from "../features/map/KakaoMap";
import { GridBubbleLayer } from "../features/map/GridBubbleLayer";
import { RegionOutlineLayer } from "../features/map/RegionOutlineLayer";
import { RegionChoroplethLayer } from "../features/map/RegionChoroplethLayer";
import { RebZoneLayer } from "../features/map/RebZoneLayer";
import { Legend } from "../features/map/Legend";
import { TopBar } from "../features/map/TopBar";
import type { ViewMode } from "../features/map/types";
import { useGridData, useRegions, useDongMetrics, useDongTrend, useRebZones } from "../features/map/useGridData";
import { apiClient, type DongMetric, type DongTrendRecord, type GridRecord, type RebZone } from "../lib/apiClient";
import type { CategorySelection } from "../features/categories/CategoryPicker";
import { StoreList } from "../features/stores/StoreList";
import { StoreDetailPanel } from "../features/stores/StoreDetailPanel";
import { formatCount, formatDistance, formatPerArea, formatPercent, formatWon } from "../lib/format";
import { changeIndexToTrendColor, OVERLAY_Z_INDEX } from "../lib/vizConfig";

const GRID_SIZES = [100, 250] as const;
const TREND_QUARTERS_SHOWN = 8; // 최근 2년치만 (22분기 전부는 너무 빽빽함)

type Selection = {
  kind: "grid" | "dong" | "zone";
  title: string;
  brief: string;
  rows: InfoRow[];
  trend?: TrendDot[];
  center?: { lon: number; lat: number };
};

function gridToSelection(record: GridRecord, category: CategorySelection | null): Selection {
  const zone = record.starbucks_zone ? "스세권" : record.daiso_zone ? "다세권" : null;
  const countLabel = category ? `${category.name} 점포` : "점포";
  return {
    kind: "grid",
    title: "격자 상세",
    brief: `${countLabel} ${record.store_count}개${category ? "" : `, 주요 업종은 '${record.top_category ?? "정보 없음"}'`}입니다.${zone ? ` ${zone}에 속합니다.` : ""}`,
    center: { lon: record.lon, lat: record.lat },
    rows: [
      { label: `${countLabel}수`, value: formatCount(record.store_count) },
      { label: "주요 업종", value: record.top_category ?? "-" },
      { label: "스타벅스까지", value: formatDistance(record.starbucks_nearest_m) },
      { label: "다이소까지", value: formatDistance(record.daiso_nearest_m) },
    ],
  };
}

function dongToSelection(record: DongMetric, trendRecord: DongTrendRecord | undefined): Selection {
  const trend = trendRecord?.quarters.slice(-TREND_QUARTERS_SHOWN).map((q) => ({
    quarter: q.quarter,
    label: q.change_index_nm,
    color: changeIndexToTrendColor(q.change_index),
  }));
  return {
    kind: "dong",
    title: `${record.sggnm} ${record.adongNm}`,
    brief: `최근 분기 기준 '${record.change_index_nm ?? "정보 없음"}' 상권이며, 분기 추정매출은 ${formatWon(record.sales_total)}입니다.`,
    rows: [
      { label: "분기 추정매출", value: formatWon(record.sales_total) },
      { label: "점포수", value: formatCount(record.stores_total) },
      { label: "유동인구", value: formatCount(record.floating_pop, "명") },
      { label: "상권 변화", value: record.change_index_nm ?? "-" },
    ],
    trend,
  };
}

function zoneToSelection(zone: RebZone): Selection {
  return {
    kind: "zone",
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
  const [sizeM, setSizeM] = useState<number>(250);
  const [viewMode, setViewMode] = useState<ViewMode>("stores");
  const [category, setCategory] = useState<CategorySelection | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [rebZonesVisible, setRebZonesVisible] = useState(false);
  const [mapKakao, setMapKakao] = useState<{ map: any; kakao: typeof window.kakao } | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);

  const gridQuery = useGridData(sizeM);
  const regionsQuery = useRegions();
  const dongMetricsQuery = useDongMetrics();
  const dongTrendQuery = useDongTrend();
  const rebZonesQuery = useRebZones();

  const gridCountsQuery = useQuery({
    queryKey: ["grid-counts", sizeM, category?.level, category?.code],
    queryFn: () => apiClient.getGridCounts(sizeM, category!.level, category!.code),
    enabled: category !== null && viewMode === "stores",
    staleTime: 10 * 60 * 1000,
  });

  const trendByAdongCd = useMemo(
    () => new Map((dongTrendQuery.data?.records ?? []).map((r) => [r.adongCd, r])),
    [dongTrendQuery.data],
  );

  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <KakaoMap onReady={(map, kakao) => setMapKakao({ map, kakao })}>
        {mapKakao && regionsQuery.data && viewMode === "stores" && (
          <RegionOutlineLayer map={mapKakao.map} kakao={mapKakao.kakao} features={regionsQuery.data.features} />
        )}
        {mapKakao && regionsQuery.data && dongMetricsQuery.data && viewMode === "trend" && (
          <RegionChoroplethLayer
            map={mapKakao.map}
            kakao={mapKakao.kakao}
            features={regionsQuery.data.features}
            metrics={dongMetricsQuery.data.records}
            onSelect={(record) => setSelection(dongToSelection(record, trendByAdongCd.get(record.adongCd)))}
          />
        )}
        {mapKakao && gridQuery.data && viewMode === "stores" && (
          <GridBubbleLayer
            map={mapKakao.map}
            kakao={mapKakao.kakao}
            records={gridQuery.data.records}
            countOverride={category ? (gridCountsQuery.data?.counts ?? {}) : null}
            onSelect={(record) => {
              setStoreId(null);
              setSelection(gridToSelection(record, category));
            }}
          />
        )}
        {mapKakao && rebZonesVisible && rebZonesQuery.data && (
          <RebZoneLayer
            map={mapKakao.map}
            kakao={mapKakao.kakao}
            zones={rebZonesQuery.data.records}
            onSelect={(zone) => setSelection(zoneToSelection(zone))}
          />
        )}

        <TopBar
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          category={category}
          onCategoryChange={setCategory}
          sizeM={sizeM}
          onSizeChange={setSizeM}
          sizes={GRID_SIZES}
          rebZonesVisible={rebZonesVisible}
          onRebZonesVisibleChange={setRebZonesVisible}
        />
        <Legend viewMode={viewMode} rebZonesVisible={rebZonesVisible} />
        {storeId ? (
          <StoreDetailPanel
            storeId={storeId}
            onBack={() => setStoreId(null)}
            onClose={() => {
              setStoreId(null);
              setSelection(null);
            }}
          />
        ) : (
          selection && (
            <InfoPanel
              title={selection.title}
              brief={selection.brief}
              rows={selection.rows}
              trend={selection.trend}
              onClose={() => setSelection(null)}
            >
              {selection.center && (
                <StoreList center={selection.center} radiusM={Math.round(sizeM * 0.71)} category={category} onSelect={setStoreId} />
              )}
            </InfoPanel>
          )
        )}

        {gridQuery.isLoading && viewMode === "stores" && <StatusBanner text="격자 데이터를 불러오는 중..." />}
        {gridCountsQuery.isError && <StatusBanner text={`업종별 점포수 조회 실패: ${gridCountsQuery.error.message}`} />}
        {gridQuery.isError && viewMode === "stores" && (
          <StatusBanner text={`격자 데이터를 불러오지 못했습니다: ${gridQuery.error.message}`} />
        )}
        {dongMetricsQuery.isLoading && viewMode === "trend" && <StatusBanner text="상권 변화 데이터를 불러오는 중..." />}
        {dongMetricsQuery.isError && viewMode === "trend" && (
          <StatusBanner text={`상권 변화 데이터를 불러오지 못했습니다: ${dongMetricsQuery.error.message}`} />
        )}
      </KakaoMap>
    </div>
  );
}

function StatusBanner({ text }: { text: string }) {
  return (
    <div
      style={{
        position: "absolute",
        zIndex: OVERLAY_Z_INDEX,
        top: 72,
        left: "50%",
        transform: "translateX(-50%)",
        background: "white",
        borderRadius: 8,
        padding: "8px 16px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        fontSize: 13,
      }}
    >
      {text}
    </div>
  );
}
