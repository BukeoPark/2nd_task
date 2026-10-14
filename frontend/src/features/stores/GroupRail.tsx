import type { KeyboardEvent, ReactNode } from "react";
import { GROUP_IDS, type GroupId } from "../../lib/panelGroups";
import { railPanelId, railTabId } from "../../lib/railIds";
import { SCOPE_GROUP, SCOPE_STYLE } from "../../lib/scope";
import { OVERLAY_Z_INDEX, RAIL_WIDTH_PX, TOP_BAR_HEIGHT_PX } from "../../lib/vizConfig";

const ICON: Record<GroupId, ReactNode> = {
  store: <path d="M3 9l1.5-5h11L17 9M4 9v8h12V9M8 17v-4h4v4" />,
  radius: (
    <>
      <circle cx="10" cy="10" r="7" />
      <circle cx="10" cy="10" r="2.5" />
    </>
  ),
  area: <path d="M3 6l5-3 4 3 5-2v11l-5 2-4-3-5 3z" />,
  mine: <path d="M5 3h7l3 3v11H5zM12 3v3h3M8 10h4M8 13h4" />,
};

/** 매장 상세의 묶음 메뉴 — 넓은 화면은 패널 왼쪽 세로 레일, 좁은 화면은 패널 위 가로 탭. 방향키·Home·End 로 옮긴다. */
export function GroupRail({ active, onChange, orientation }: { active: GroupId; onChange: (g: GroupId) => void; orientation: "vertical" | "horizontal" }) {
  const vertical = orientation === "vertical";
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = GROUP_IDS.indexOf(active);
    const next = e.key === (vertical ? "ArrowDown" : "ArrowRight") ? i + 1 : e.key === (vertical ? "ArrowUp" : "ArrowLeft") ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? GROUP_IDS.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const g = GROUP_IDS[(next + GROUP_IDS.length) % GROUP_IDS.length];
    onChange(g);
    document.getElementById(railTabId(g))?.focus();
  };
  return (
    <div
      role="tablist"
      aria-label="매장 정보 묶음"
      aria-orientation={orientation}
      onKeyDown={onKeyDown}
      style={
        vertical
          ? { position: "absolute", zIndex: OVERLAY_Z_INDEX, top: TOP_BAR_HEIGHT_PX, bottom: 0, left: 0, width: RAIL_WIDTH_PX, background: "#F9FAFB", borderRight: "1px solid #E5E7EB", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "10px 0" }
          : { position: "sticky", top: -20, zIndex: 2, display: "flex", gap: 4, background: "white", padding: "4px 0 8px", margin: "0 0 4px", borderBottom: "1px solid #E5E7EB" }
      }
    >
      {GROUP_IDS.map((g) => {
        const on = g === active;
        const s = SCOPE_STYLE[g];
        return (
          <button
            key={g}
            id={railTabId(g)}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={railPanelId(g)}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(g)}
            style={{
              width: vertical ? 46 : undefined, flex: vertical ? undefined : 1, padding: "6px 0", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 11, fontWeight: on ? 700 : 500, lineHeight: 1.3,
              background: on ? s.bg : "transparent", color: on ? s.fg : "#4B5563", boxShadow: on ? `inset 3px 0 0 ${s.fg}` : "none",
              display: "flex", flexDirection: vertical ? "column" : "row", alignItems: "center", justifyContent: "center", gap: vertical ? 2 : 4,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {ICON[g]}
            </svg>
            <span>{SCOPE_GROUP[g]}</span>
          </button>
        );
      })}
    </div>
  );
}
