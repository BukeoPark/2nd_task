import type { FoodBubble, FoodBubblesResponse } from "../../lib/apiClient";
import { reasonText } from "../../lib/foodText";
import { formatMetric } from "../../lib/format";
import { rankBubbles } from "../../lib/ranking";

/** 순위표 — 지도의 버블을 지표 값 순서로 세운 표. 버블을 마우스로 누르지 않아도(키보드·스크린리더) 같은 요약을 열 수 있다.
 * 값이 없으면 0 이 아니라 사유를 말하고, 이전 조건의 결과이거나 조회 실패면 눌러도 진행하지 않는다(지도와 같은 규칙). */
export function RankingTable({ data, unitLabel, stale, actionable, onPick }: {
  data: FoodBubblesResponse | undefined;
  unitLabel: string;
  /** 새 조건의 결과를 기다리는 중 — 표는 이전 조건의 것 */
  stale: boolean;
  /** 눌러서 요약을 열 수 있는 상태(최신 결과) */
  actionable: boolean;
  onPick: (b: FoodBubble) => void;
}) {
  if (!data) return <div role="status" style={{ fontSize: 12, color: "#4B5563" }}>순위표를 불러오는 중...</div>;
  const rows = rankBubbles(data.bubbles);
  const showValue = data.metric !== "stores";
  const scope = showValue ? data.scope.metric_scope : `${data.scope.stores_label} 기준`;
  const noValue = rows.filter((r) => r.rank === null).length;
  return (
    <div style={{ opacity: stale ? 0.55 : 1 }}>
      {stale && <div role="status" style={{ color: "#B45309", fontWeight: 600, fontSize: 12, marginBottom: 4 }}>새 조건을 불러오는 중 — 아래는 이전 조건의 순위표</div>}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <caption style={{ textAlign: "left", fontWeight: 600, paddingBottom: 4 }}>
          {data.label} 높은 순 · {unitLabel} {rows.length}곳
          <div style={{ fontWeight: 400, color: "#4B5563", fontSize: 11 }}>업종 범위: {scope}</div>
        </caption>
        <thead>
          <tr style={{ color: "#4B5563", textAlign: "left" }}>
            <th scope="col" style={{ width: 28, fontWeight: 500 }}>순위</th>
            <th scope="col" style={{ fontWeight: 500 }}>{unitLabel}</th>
            {showValue && <th scope="col" style={{ fontWeight: 500, textAlign: "right" }}>{data.label}</th>}
            <th scope="col" style={{ fontWeight: 500, textAlign: "right" }}>점포 수</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ rank, item }) => (
            <tr key={item.code} style={{ borderTop: "1px solid #F3F4F6" }}>
              <td style={{ padding: "3px 0", color: "#4B5563" }}>{rank ?? "-"}</td>
              <td style={{ padding: "3px 4px 3px 0" }}>
                <button
                  type="button"
                  disabled={!actionable}
                  onClick={() => onPick(item)}
                  aria-label={`${item.name} 요약 열기`}
                  style={{ border: "none", background: "none", padding: 0, textAlign: "left", font: "inherit", color: actionable ? "#1D4ED8" : "#6B7280", cursor: actionable ? "pointer" : "default", textDecoration: actionable ? "underline" : "none" }}
                >
                  {item.name}
                </button>
                {item.type && <span style={{ color: "#6B7280" }}> ({item.type})</span>}
              </td>
              {showValue && (
                <td style={{ textAlign: "right", padding: "3px 0" }}>
                  {item.value === null ? <span style={{ color: "#6B7280" }}>{reasonText(item.reason, data.reasons)}</span> : formatMetric(data.kind, item.value)}
                </td>
              )}
              <td style={{ textAlign: "right", padding: "3px 0 3px 6px" }}>{item.size === null ? "-" : `${item.size.toLocaleString("ko-KR")}곳`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {noValue > 0 && showValue && <div style={{ fontSize: 11, color: "#4B5563", marginTop: 4 }}>순위가 없는 {noValue}곳은 값이 0 이 아니라 자료가 없는 곳이에요(사유는 오른쪽 칸).</div>}
    </div>
  );
}
