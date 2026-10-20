import type { KeyboardEvent, ReactNode } from "react";
import { railPanelId, railTabId } from "../lib/railIds";
import { OVERLAY_Z_INDEX, RAIL_WIDTH_PX, TOP_BAR_HEIGHT_PX } from "../lib/vizConfig";

export interface RailItem {
  id: string;
  label: string;
  /** 20x20 viewBox 안에 그리는 선 아이콘 */
  icon: ReactNode;
  bg: string;
  fg: string;
}

interface TabRailProps {
  items: RailItem[];
  active: string;
  onChange: (id: string) => void;
  orientation: "vertical" | "horizontal";
  ariaLabel: string;
  /** 같은 화면에 레일이 둘 이상일 때 id 가 겹치지 않게 하는 접두사 */
  idPrefix?: string;
}

/** 패널 메뉴 — 넓은 화면은 패널 왼쪽 세로 레일, 좁은 화면은 패널 위 가로 탭. 방향키·Home·End 로 옮긴다. 매장 상세(GroupRail)·종합분석이 함께 쓴다. */
export function TabRail({ items, active, onChange, orientation, ariaLabel, idPrefix = "" }: TabRailProps) {
  const vertical = orientation === "vertical";
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = items.findIndex((it) => it.id === active);
    const next = e.key === (vertical ? "ArrowDown" : "ArrowRight") ? i + 1 : e.key === (vertical ? "ArrowUp" : "ArrowLeft") ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const id = items[(next + items.length) % items.length].id;
    onChange(id);
    document.getElementById(railTabId(id, idPrefix))?.focus();
  };
  return (
    <div
      role="tablist"
      data-tour={idPrefix ? `${idPrefix}rail` : "rail"}
      aria-label={ariaLabel}
      aria-orientation={orientation}
      onKeyDown={onKeyDown}
      style={
        vertical
          ? { position: "absolute", zIndex: OVERLAY_Z_INDEX, top: TOP_BAR_HEIGHT_PX, bottom: 0, left: 0, width: RAIL_WIDTH_PX, background: "#F9FAFB", borderRight: "1px solid #E5E7EB", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "10px 0", overflowY: "auto", scrollbarWidth: "none" }
          : { position: "sticky", top: -20, zIndex: 2, display: "flex", gap: 4, background: "white", padding: "4px 0 8px", margin: "0 0 4px", borderBottom: "1px solid #E5E7EB", overflowX: "auto", scrollbarWidth: "none" }
      }
    >
      {items.map((it) => {
        const on = it.id === active;
        return (
          <button
            key={it.id}
            id={railTabId(it.id, idPrefix)}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={railPanelId(it.id, idPrefix)}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(it.id)}
            style={{
              width: vertical ? 46 : undefined, flex: "0 0 auto", minWidth: vertical ? undefined : 64, whiteSpace: "nowrap", padding: vertical ? "6px 0" : "6px 10px", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 11, fontWeight: on ? 700 : 500, lineHeight: 1.3,
              background: on ? it.bg : "transparent", color: on ? it.fg : "#4B5563", boxShadow: on ? `inset 3px 0 0 ${it.fg}` : "none",
              display: "flex", flexDirection: vertical ? "column" : "row", alignItems: "center", justifyContent: "center", gap: vertical ? 2 : 4,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {it.icon}
            </svg>
            <span>{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}
