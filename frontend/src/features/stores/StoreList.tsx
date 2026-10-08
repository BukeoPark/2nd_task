import { Notice } from "../../components/Notice";
import type { CategoryLevel } from "../../lib/apiClient";
import { formatDistance } from "../../lib/format";
import { useStoresNear } from "./useStores";

export interface StoreFilter {
  level: CategoryLevel;
  code: string;
  name: string;
}

interface StoreListProps {
  center: { lon: number; lat: number };
  radiusM: number;
  category: StoreFilter | null;
  onSelect: (storeId: string) => void;
}

/** 선택한 지역 주변 매장(거리순). 고객평가 유무와 무관하게 모든 매장을 같은 기준으로 나열한다. */
export function StoreList({ center, radiusM, category, onSelect }: StoreListProps) {
  const { data, isLoading, isError, error } = useStoresNear(center, radiusM, category);
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 6 }}>
        주변 매장 (반경 {radiusM}m{category ? ` · ${category.name}` : ""}, 거리순)
        {data && ` — ${data.total_matched.toLocaleString()}곳`}
      </div>
      {isLoading && <Notice tone="muted">매장 목록을 불러오는 중...</Notice>}
      {isError && <Notice tone="error">매장 목록 조회 실패: {error.message}</Notice>}
      {data && data.records.length === 0 && <Notice tone="muted">조건에 맞는 매장이 없습니다(0곳).</Notice>}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 260, overflowY: "auto" }}>
        {data?.records.map((s) => (
          <button
            key={s.store_id}
            type="button"
            onClick={() => onSelect(s.store_id)}
            style={{ textAlign: "left", border: "1px solid #E5E7EB", borderRadius: 6, padding: "6px 8px", background: "white", cursor: "pointer" }}
          >
            <div style={{ fontWeight: 600, fontSize: 13 }}>
              {s.name} {s.branch && <span style={{ fontWeight: 400, color: "#6B7280" }}>{s.branch}</span>}
            </div>
            <div style={{ fontSize: 11, color: "#6B7280" }}>
              {s.category_detail} · {formatDistance(s.distance_m)}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
