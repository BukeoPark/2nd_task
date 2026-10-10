import type { ReactNode } from "react";
import { OVERLAY_Z_INDEX, SIDE_PANEL_WIDTH_PX } from "../lib/vizConfig";

interface DrawerProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  onBack?: () => void;
  children: ReactNode;
}

/** 지도 왼쪽에서 열리는 상세 서랍의 공용 틀(GNB 아래 전체 높이). */
export function Drawer({ title, subtitle, onClose, onBack, children }: DrawerProps) {
  return (
    <div
      style={{
        position: "absolute",
        zIndex: OVERLAY_Z_INDEX,
        top: 56,
        bottom: 0,
        left: 0,
        width: SIDE_PANEL_WIDTH_PX,
        background: "white",
        boxShadow: "2px 0 10px rgba(0,0,0,0.15)",
        padding: 20,
        overflowY: "auto",
        fontSize: 13,
        lineHeight: 1.6,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, gap: 8 }}>
        <div>
          {onBack && (
            <button type="button" onClick={onBack} style={{ border: "none", background: "none", color: "#3B82F6", cursor: "pointer", padding: 0, fontSize: 12 }}>
              ← 목록으로
            </button>
          )}
          <strong style={{ fontSize: 16, display: "block" }}>{title}</strong>
          {subtitle && <span style={{ fontSize: 12, color: "#6B7280" }}>{subtitle}</span>}
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{ border: "none", background: "none", cursor: "pointer", fontSize: 18, color: "#6b7280" }}
          aria-label="닫기"
        >
          ×
        </button>
      </div>
      {children}
    </div>
  );
}
