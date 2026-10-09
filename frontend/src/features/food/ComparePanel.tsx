import { Notice } from "../../components/Notice";
import type { FoodCompareResponse, FoodLevel } from "../../lib/apiClient";
import { formatMetric } from "../../lib/format";
import { OVERLAY_Z_INDEX } from "../../lib/vizConfig";
import { useFoodCompare } from "./useFood";

const UNIT_NOUN: Record<FoodLevel, string> = { gu: "자치구", dong: "행정동", trdar: "상권" };

interface ComparePanelProps {
  level: FoodLevel;
  codes: string[];
  svc: string | null;
  scls: string | null;
  filterName: string;
  onRemove: (code: string) => void;
  onClose: () => void;
}

/** 입지 비교 — 같은 단위 몇 곳을 지표별로 나란히. 점수·순위로 합치지 않고, 행마다 가장 높은 값만 굵게 표시한다. */
export function ComparePanel({ level, codes, svc, scls, filterName, onRemove, onClose }: ComparePanelProps) {
  const { data, isLoading, isError, error } = useFoodCompare(level, codes, svc, scls);
  return (
    <div
      role="dialog"
      aria-label="입지 비교"
      style={{
        position: "absolute", zIndex: OVERLAY_Z_INDEX + 2, top: 68, left: "50%", transform: "translateX(-50%)",
        width: "min(980px, calc(100vw - 32px))", maxHeight: "calc(100vh - 100px)", overflowY: "auto", background: "white",
        borderRadius: 12, boxShadow: "0 8px 30px rgba(0,0,0,0.25)", padding: "16px 20px",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
        <strong style={{ fontSize: 16 }}>입지 비교</strong>
        <span style={{ fontSize: 12, color: "#6B7280" }}>
          {UNIT_NOUN[level]} {codes.length}곳 · {filterName}
        </span>
        <button type="button" onClick={onClose} aria-label="닫기" style={{ marginLeft: "auto", border: "none", background: "none", fontSize: 18, cursor: "pointer" }}>
          ×
        </button>
      </div>
      {codes.length < 2 && <Notice tone="muted">지도에서 버블을 눌러 '비교에 담기'로 한 곳 이상 더 담으면 나란히 비교할 수 있어요(최대 4곳).</Notice>}
      {isLoading && <Notice tone="muted">비교 자료를 불러오는 중...</Notice>}
      {isError && <Notice tone="error">비교 조회 실패: {error.message}</Notice>}
      {data && <CompareTable data={data} onRemove={onRemove} />}
    </div>
  );
}

function CompareTable({ data, onRemove }: { data: FoodCompareResponse; onRemove: (code: string) => void }) {
  return (
    <>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 8 }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: "left", width: 230 }}>지표</th>
            {data.units.map((u) => (
              <th key={u.code} style={th}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                  <span>
                    {u.name}
                    {u.type && <span style={{ fontWeight: 400, color: "#6B7280", fontSize: 11 }}> {u.type}</span>}
                  </span>
                  <button type="button" onClick={() => onRemove(u.code)} aria-label={`${u.name} 빼기`} title="비교에서 빼기"
                    style={{ border: "none", background: "none", color: "#9CA3AF", cursor: "pointer", fontSize: 14 }}>
                    ×
                  </button>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r, i) => {
            const vals = r.cells.map((c) => c.value).filter((v): v is number => v !== null);
            const max = vals.length >= 2 ? Math.max(...vals) : null;
            const header = i === 0 || data.rows[i - 1].group !== r.group;
            return [
              header && (
                <tr key={`g-${r.group}`}>
                  <td colSpan={data.units.length + 1} style={{ padding: "10px 0 4px", fontSize: 11, fontWeight: 700, color: "#6B7280" }}>
                    {r.group}
                  </td>
                </tr>
              ),
              <tr key={r.key} style={{ borderTop: "1px solid #F3F4F6" }}>
                <td style={{ padding: "6px 0" }}>
                  <div>{r.label}</div>
                  <div style={{ fontSize: 10, color: "#9CA3AF" }}>
                    {r.source}
                    {r.as_of ? ` · ${r.as_of}` : ""}
                  </div>
                </td>
                {r.cells.map((c, j) => (
                  <td key={data.units[j].code} style={{ padding: "6px 0", textAlign: "right", verticalAlign: "top" }}>
                    <div style={{ fontWeight: max !== null && c.value === max ? 700 : 400, color: c.value === null ? "#9CA3AF" : "#111827" }}>
                      {formatMetric(r.kind, c.value)}
                    </div>
                    {c.note && <div style={{ fontSize: 10, color: "#9CA3AF" }}>{c.note}</div>}
                  </td>
                ))}
              </tr>,
            ];
          })}
        </tbody>
      </table>
      <div style={{ fontSize: 11, color: "#6B7280", marginTop: 10 }}>
        굵은 값 = 그 행에서 가장 높은 값(좋고 나쁨이 아니라 크기만 표시)
        {data.notes.map((n) => (
          <div key={n}>· {n}</div>
        ))}
      </div>
    </>
  );
}

const th: React.CSSProperties = { padding: "6px 0", textAlign: "right", borderBottom: "2px solid #E5E7EB", fontSize: 13, fontWeight: 700 };
