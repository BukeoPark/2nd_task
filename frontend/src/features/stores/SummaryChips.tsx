import type { StoreBasic } from "../../lib/apiClient";
import type { GroupId } from "../../lib/panelGroups";
import { SCOPE_STYLE } from "../../lib/scope";
import { buildChips } from "../../lib/summaryChips";
import { useLocationInfluence, useStoreAnchors } from "./useStores";

const RADIUS_M = 500;

/** 매장 주변·소속 상권의 핵심 사실을 한 줄 칩으로 — 첫 화면에서 '어떤 환경인가'를 먼저 보여 준다.
 * 아래 블록과 같은 조회(같은 쿼리 키)를 쓰므로 요청이 늘지 않고, 값이 없는 칩은 만들지 않는다. */
export function SummaryChips({ storeId, store, onJump }: { storeId: string; store: StoreBasic; onJump?: (group: GroupId) => void }) {
  const infl = useLocationInfluence(storeId, RADIUS_M);
  const anchors = useStoreAnchors(storeId);
  const same = infl.data?.radius_metrics.competitors.same_category;
  const chips = buildChips({
    sameCategory: same ? { level: same.level, count: same.count, radiusM: infl.data!.radius_m } : null,
    anchors: anchors.data ? anchors.data.brands.map((b) => ({ brand: b.brand, label: b.label, nearestM: b.nearest_m })) : null,
    area: store.trdar ? { name: store.trdar.name, kind: store.trdar.type } : { name: store.dong, kind: "행정동" },
  });
  if (chips.length === 0) return null;
  return (
    <ul aria-label="주변·소속 상권 요약" style={{ listStyle: "none", margin: "10px 0 0", padding: 0, display: "flex", flexWrap: "wrap", gap: 6 }}>
      {chips.map((c) => (
        <li key={c.key}>
          <button
            type="button"
            title={onJump ? `${c.scope === "radius" ? "주변" : "상권"} 정보 보기` : undefined}
            onClick={() => onJump?.(c.scope)}
            style={{ fontSize: 12, padding: "3px 9px", borderRadius: 999, background: "#F9FAFB", color: "#111827", border: `1px solid ${SCOPE_STYLE[c.scope].bg}`, borderLeft: `4px solid ${SCOPE_STYLE[c.scope].fg}`, cursor: onJump ? "pointer" : "default" }}
          >
            {c.text}
          </button>
        </li>
      ))}
    </ul>
  );
}
