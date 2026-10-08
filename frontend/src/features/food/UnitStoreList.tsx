import { Notice } from "../../components/Notice";
import type { FoodLevel } from "../../lib/apiClient";
import { formatDistance } from "../../lib/format";
import { useFoodUnitStores } from "./useFood";

const UNIT_NOUN: Record<FoodLevel, string> = { gu: "자치구", dong: "행정동", trdar: "상권" };

interface UnitStoreListProps {
  level: FoodLevel;
  code: string;
  svc: string | null;
  scls: string | null;
  filterName: string;
  onSelect: (storeId: string) => void;
}

/** 버블에 속한 매장(경계 안, 버블 중심에서 가까운 순) — 버블 점포 수와 같은 기준이라 총수가 일치한다. */
export function UnitStoreList({ level, code, svc, scls, filterName, onSelect }: UnitStoreListProps) {
  const { data, isLoading, isError, error } = useFoodUnitStores(level, code, svc, scls);
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 6 }}>
        이 {UNIT_NOUN[level]} 안 매장 ({filterName}, 가까운 순){data && ` — ${data.total.toLocaleString()}곳`}
        {data?.truncated && ` 중 ${data.records.length}곳 표시`}
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
              {s.category_detail} · 중심에서 {formatDistance(s.distance_m)}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
