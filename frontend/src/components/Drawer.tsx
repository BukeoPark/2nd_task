import { useContext, type ReactNode } from "react";
import { MapPeekContext } from "./MapPeekContext";
import { useNarrow } from "../lib/useNarrow";
import { OVERLAY_Z_INDEX, SIDE_PANEL_WIDTH_PX } from "../lib/vizConfig";

interface DrawerProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  onBack?: () => void;
  /** 뒤로 가기 버튼 문구(기본 '← 목록으로') */
  backLabel?: string;
  /** 왼쪽 가장자리에서 띄울 거리(px) — 왼쪽에 레일 등을 둘 때. 기본 0 */
  left?: number;
  children: ReactNode;
}

/** 지도 왼쪽에서 열리는 상세 서랍의 공용 틀(GNB 아래 전체 높이). */
/** 좁은 화면에서는 레일 옆 남는 폭까지 꽉 채우고 지도 조작 단추(확대·축소)보다 위에 둔다. */
export function Drawer({ title, subtitle, onClose, onBack, backLabel = "← 목록으로", left = 0, children }: DrawerProps) {
  const narrow = useNarrow();
  const showMap = useContext(MapPeekContext);
  return (
    <div
      style={{
        position: "absolute",
        zIndex: narrow ? OVERLAY_Z_INDEX + 3 : OVERLAY_Z_INDEX,
        top: 56,
        bottom: 0,
        left,
        width: narrow ? `calc(100vw - ${left}px)` : SIDE_PANEL_WIDTH_PX,
        background: "white",
        boxShadow: "2px 0 10px rgba(0,0,0,0.15)",
        padding: 20,
        overflowY: "auto",
        fontSize: 15,
        lineHeight: 1.6,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, gap: 8 }}>
        <div>
          {onBack && (
            <button type="button" onClick={onBack} style={{ border: "none", background: "none", color: "#3B82F6", cursor: "pointer", padding: 0, fontSize: 13.5 }}>
              {backLabel}
            </button>
          )}
          <strong style={{ fontSize: 22, lineHeight: 1.3, fontWeight: 800, display: "block" }}>{title}</strong>
          {subtitle && <span style={{ fontSize: 13, color: "#6B7280" }}>{subtitle}</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
        {narrow && showMap && (
          <button type="button" onClick={showMap} style={{ border: "1px solid #3B82F6", background: "white", color: "#1D4ED8", borderRadius: 8, padding: "5px 10px", cursor: "pointer", fontSize: 13.5, fontWeight: 600 }}>
            지도 보기
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          style={{ border: "none", background: "none", cursor: "pointer", fontSize: 24, lineHeight: 1, padding: "0 4px", color: "#6b7280" }}
          aria-label="닫기"
        >
          ×
        </button>
        </div>
      </div>
      {children}
    </div>
  );
}
