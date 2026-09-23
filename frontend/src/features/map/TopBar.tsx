import { OVERLAY_Z_INDEX } from "../../lib/vizConfig";
import { CategoryPicker, type CategorySelection } from "../categories/CategoryPicker";
import type { ViewMode } from "./types";

const MODE_LABEL: Record<ViewMode, string> = {
  stores: "점포 밀도",
  trend: "매출 증감률",
};

interface TopBarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  category: CategorySelection | null;
  onCategoryChange: (category: CategorySelection | null) => void;
  sizeM: number;
  onSizeChange: (sizeM: number) => void;
  sizes: readonly number[];
  rebZonesVisible: boolean;
  onRebZonesVisibleChange: (visible: boolean) => void;
}

/** 지도 최상단 GNB. 왼쪽 로고 + 가운데 지표/업종 필터 + 오른쪽 보조 옵션. */
export function TopBar({
  viewMode,
  onViewModeChange,
  category,
  onCategoryChange,
  sizeM,
  onSizeChange,
  sizes,
  rebZonesVisible,
  onRebZonesVisibleChange,
}: TopBarProps) {
  return (
    <div
      style={{
        position: "absolute",
        zIndex: OVERLAY_Z_INDEX + 1,
        top: 0,
        left: 0,
        right: 0,
        height: 56,
        background: "white",
        boxShadow: "0 1px 6px rgba(0,0,0,0.12)",
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "0 16px",
      }}
    >
      <strong style={{ fontSize: 16, color: "#111827", whiteSpace: "nowrap" }}>상권분석</strong>

      <Dropdown
        value={viewMode}
        onChange={(v) => onViewModeChange(v as ViewMode)}
        options={(Object.keys(MODE_LABEL) as ViewMode[]).map((v) => ({ value: v, label: MODE_LABEL[v] }))}
      />

      <CategoryPicker value={category} onChange={onCategoryChange} disabled={viewMode !== "stores"} />

      {viewMode === "stores" && (
        <div style={{ display: "flex", gap: 4 }}>
          {sizes.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSizeChange(s)}
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid #e5e7eb",
                background: s === sizeM ? "#3B82F6" : "white",
                color: s === sizeM ? "white" : "#374151",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {s}m 격자
            </button>
          ))}
        </div>
      )}

      <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, color: "#374151", cursor: "pointer", marginLeft: "auto" }}>
        <input type="checkbox" checked={rebZonesVisible} onChange={(e) => onRebZonesVisibleChange(e.target.checked)} />
        임대료(R-ONE)
      </label>
    </div>
  );
}

function Dropdown({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        padding: "6px 10px",
        borderRadius: 6,
        border: "1px solid #e5e7eb",
        background: "white",
        color: "#111827",
        fontSize: 13,
        cursor: "pointer",
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
