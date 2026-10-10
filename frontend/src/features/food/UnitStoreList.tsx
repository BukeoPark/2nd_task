import { useState } from "react";
import { Notice } from "../../components/Notice";
import type { FoodLevel, UnitStoreSort } from "../../lib/apiClient";
import { formatDistance } from "../../lib/format";
import { useFoodUnitStores, UNIT_STORE_PAGE } from "./useFood";

const UNIT_NOUN: Record<FoodLevel, string> = { gu: "자치구", dong: "행정동", trdar: "상권" };
const SORT_LABEL: Record<UnitStoreSort, string> = { distance: "버블 중심에서 가까운 순", name: "상호 가나다순" };

interface UnitStoreListProps {
  level: FoodLevel;
  code: string;
  svc: string | null;
  scls: string | null;
  filterName: string;
  onSelect: (storeId: string) => void;
  /** 목록 항목에 마우스·키보드 초점이 올라가면 그 매장 id, 벗어나면 null — 지도의 같은 점을 강조하는 데 쓴다 */
  onHover?: (storeId: string | null) => void;
}

/** 버블에 속한 매장(경계 안) — 버블 점포 수와 같은 기준이라 총수가 일치한다. 50곳씩 '더 보기'로 끝까지 볼 수 있고,
 * 업종·정렬을 바꾸면 처음부터 다시 받아 이전 조건의 목록이 섞이지 않는다. */
export function UnitStoreList({ level, code, svc, scls, filterName, onSelect, onHover }: UnitStoreListProps) {
  const [sort, setSort] = useState<UnitStoreSort>("distance");
  const q = useFoodUnitStores(level, code, svc, scls, sort);

  // 같은 조건이면 순서가 고정이라 중복이 없어야 하지만, 혹시 겹치면 한 번만 보이게 한다(총수와 표시 수가 어긋나지 않게).
  const records = q.data ? [...new Map(q.data.pages.flatMap((p) => p.records).map((s) => [s.store_id, s])).values()] : [];
  const total = q.data?.pages[0]?.total ?? 0;
  const remaining = Math.max(total - records.length, 0);

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 6 }}>
        이 {UNIT_NOUN[level]} 안 매장 ({filterName})
        {q.data && <strong style={{ color: "#374151" }}> — 총 {total.toLocaleString()}곳 중 {records.length.toLocaleString()}곳 표시</strong>}
      </div>
      <label style={{ fontSize: 11, color: "#6B7280", display: "flex", alignItems: "center", gap: 4, marginBottom: 6 }}>
        정렬
        <select value={sort} onChange={(e) => setSort(e.target.value as UnitStoreSort)} style={{ fontSize: 11, padding: "2px 4px" }}>
          {(Object.keys(SORT_LABEL) as UnitStoreSort[]).map((s) => (
            <option key={s} value={s}>
              {SORT_LABEL[s]}
            </option>
          ))}
        </select>
      </label>

      {q.isPending && <Notice tone="muted">매장 목록을 불러오는 중...</Notice>}
      {q.isError && !q.data && (
        <Notice tone="error">
          매장 목록을 불러오지 못했습니다: {q.error.message}{" "}
          <button type="button" onClick={() => void q.refetch()} style={retryStyle}>
            다시 시도
          </button>
        </Notice>
      )}
      {q.data && total === 0 && <Notice tone="muted">조건에 맞는 매장이 0곳입니다(조회는 정상).</Notice>}

      <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 300, overflowY: "auto" }}>
        {records.map((s) => (
          <button
            key={s.store_id}
            type="button"
            onClick={() => onSelect(s.store_id)}
            onMouseEnter={() => onHover?.(s.store_id)}
            onMouseLeave={() => onHover?.(null)}
            onFocus={() => onHover?.(s.store_id)}
            onBlur={() => onHover?.(null)}
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
        {q.hasNextPage && (
          <button
            type="button"
            disabled={q.isFetchingNextPage}
            onClick={() => void q.fetchNextPage()}
            style={{ border: "1px dashed #93C5FD", borderRadius: 6, padding: "8px", background: "#EFF6FF", color: "#1D4ED8", cursor: q.isFetchingNextPage ? "default" : "pointer", fontWeight: 600 }}
          >
            {q.isFetchingNextPage ? "불러오는 중..." : `더 보기 (남은 ${remaining.toLocaleString()}곳 중 ${Math.min(UNIT_STORE_PAGE, remaining)}곳 더)`}
          </button>
        )}
      </div>
      {q.isFetchNextPageError && (
        <Notice tone="error">
          다음 매장을 불러오지 못했습니다{" "}
          <button type="button" onClick={() => void q.fetchNextPage()} style={retryStyle}>
            다시 시도
          </button>
        </Notice>
      )}
      {q.data && !q.hasNextPage && total > 0 && <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4 }}>마지막 매장입니다.</div>}
    </div>
  );
}

const retryStyle: React.CSSProperties = { marginLeft: 4, border: "1px solid #DC2626", background: "white", color: "#DC2626", borderRadius: 4, padding: "1px 8px", cursor: "pointer" };
