import { useContext, useState, useId, type CSSProperties, type ReactNode } from "react";
import { MapPeekContext } from "./MapPeekContext";
import { useNarrow } from "../lib/useNarrow";
import { OVERLAY_Z_INDEX, SIDE_PANEL_WIDTH_PX } from "../lib/vizConfig";
import { FS } from "../lib/typography";

interface DrawerProps {
  title: string;
  titleAside?: ReactNode;
  /** 제목 바로 아래 한 줄(매장 주소 등) */
  subtitle?: ReactNode;
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
export function Drawer({ title, titleAside, subtitle, onClose, onBack, backLabel = "← 목록으로", left = 0, children }: DrawerProps) {
  const narrow = useNarrow();
  const [collapsed, setCollapsed] = useState(false);
  const contentId = useId();
  const hidden = collapsed && !narrow;
  const showMap = useContext(MapPeekContext);
  return (
    <>
    {!narrow && <button type="button" aria-label={hidden ? "왼쪽 정보 창 펼치기" : "왼쪽 정보 창 접기"} aria-expanded={!hidden} aria-controls={contentId}
      onClick={() => setCollapsed(v => !v)}
      style={{ position: "absolute", zIndex: OVERLAY_Z_INDEX + 4, top: "50%", left: hidden ? left : SIDE_PANEL_WIDTH_PX, transform: "translateY(-50%)", width: 28, height: 64, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #D1D5DB", borderLeft: "none", borderRadius: "0 12px 12px 0", background: "white", color: "#374151", boxShadow: "3px 0 8px rgba(0,0,0,0.1)", cursor: "pointer" }}>
      <svg width="18" height="24" viewBox="0 0 18 24" fill="none" aria-hidden="true"><path d={hidden ? "M6 5l7 7-7 7" : "M12 5l-7 7 7 7"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </button>}
    <div id={contentId} hidden={hidden}
      style={{
        ...Object.fromEntries(Object.entries(FS).map(([key, value]) => [`--panel-${key}`, `${value}px`])) as CSSProperties,
        position: "absolute",
        zIndex: narrow ? OVERLAY_Z_INDEX + 3 : OVERLAY_Z_INDEX,
        top: 56,
        bottom: 0,
        left,
        width: narrow ? `calc(var(--app-vw) - ${left}px)` : SIDE_PANEL_WIDTH_PX - left,
        background: "white",
        boxShadow: "2px 0 10px rgba(0,0,0,0.15)",
        padding: 20,
        overflowY: "auto",
        fontSize: FS.body,
        lineHeight: 1.6,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          {onBack && (
            <button type="button" onClick={onBack} style={{ border: "none", background: "none", color: "#3B82F6", cursor: "pointer", padding: 0, fontSize: FS.warn }}>
              {backLabel}
            </button>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "4px 0" }}><strong style={{ fontSize: FS.screenTitle, lineHeight: 1.3, fontWeight: 800, display: "block", wordBreak: "keep-all" }}>{title}</strong>{titleAside}</div>
          {subtitle && <div style={{ marginBottom: 4 }}>{subtitle}</div>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
        {narrow && showMap && (
          <button type="button" onClick={showMap} style={{ border: "1px solid #3B82F6", background: "white", color: "#1D4ED8", borderRadius: 8, padding: "5px 10px", cursor: "pointer", fontSize: FS.warn, fontWeight: 600 }}>
            지도 보기
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          style={{ border: "none", background: "none", cursor: "pointer", fontSize: FS.screenTitle, lineHeight: 1, padding: "0 4px", color: "#6b7280" }}
          aria-label="닫기"
        >
          ×
        </button>
        </div>
      </div>
      {children}
    </div>
    </>
  );
}
