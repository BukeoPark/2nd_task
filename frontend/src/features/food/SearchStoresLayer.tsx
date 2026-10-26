import { useEffect } from "react";
import type { FoodStorePoint } from "../../lib/apiClient";
import { toKakaoLatLng } from "../../lib/geo";
import { glyphFontSize, glyphFor } from "../../lib/storeGlyph";
import { OVERLAY_Z_INDEX } from "../../lib/vizConfig";

const RING = "#1D4ED8";
const SIZE = 28;

interface Props {
  map: any;
  kakao: typeof window.kakao;
  stores: FoodStorePoint[];
  selectedId: string | null;
  onSelect: (storeId: string) => void;
  /** 처음 올릴 때 이 매장들이 한눈에 보이게 지도를 맞춘다 */
  fit: boolean;
}

/** 이름 검색('본죽')에 걸린 매장 전부를 어느 확대 단계에서나 업종 이모티콘 + 파란 링으로 올린다. 눌러서 매장 상세로 이어진다(선택한 매장은 SelectedStoreMarker 가 따로 그린다). */
export function SearchStoresLayer({ map, kakao, stores, selectedId, onSelect, fit }: Props) {
  useEffect(() => {
    const overlays: any[] = [];
    for (const s of stores) {
      if (s.store_id === selectedId) continue;
      const g = glyphFor(s.svc);
      const el = document.createElement("div");
      Object.assign(el.style, {
        boxSizing: "border-box", width: `${SIZE}px`, height: `${SIZE}px`, marginLeft: `${-SIZE / 2}px`, marginTop: `${-SIZE / 2}px`, borderRadius: "50%", background: "white",
        border: `2px solid ${RING}`, boxShadow: "0 0 0 3px rgba(29,78,216,0.25), 0 2px 6px rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: `${glyphFontSize(SIZE)}px`, lineHeight: "1", cursor: "pointer", userSelect: "none",
        fontFamily: '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif',
      });
      el.textContent = g.glyph;
      el.setAttribute("role", "button");
      const name = `${s.name}${s.branch ? ` ${s.branch}` : ""}`;
      el.setAttribute("aria-label", `${name} 매장 상세 열기`);
      el.title = `${name} · ${g.label}`;
      el.addEventListener("click", () => onSelect(s.store_id));
      overlays.push(new kakao.maps.CustomOverlay({ position: toKakaoLatLng(kakao, s), content: el, map, zIndex: OVERLAY_Z_INDEX - 2, clickable: true }));
    }
    return () => overlays.forEach((o) => o.setMap(null));
  }, [map, kakao, stores, selectedId, onSelect]);

  useEffect(() => {
    if (!fit || stores.length === 0) return;
    const b = new kakao.maps.LatLngBounds();
    stores.forEach((s) => b.extend(toKakaoLatLng(kakao, s)));
    map.setBounds(b, 110, 90, 90, 90); // 여백(위·오른쪽·아래·왼쪽) — 위쪽 상단바·이용 순서 표시에 가리지 않게
  }, [map, kakao, stores, fit]);

  return null;
}

interface ChipProps {
  query: string;
  total: number | null;
  truncated: boolean;
  loading: boolean;
  failed: boolean;
  onClose: () => void;
}

/** 지도에 올려 둔 검색 결과를 알리고 한 번에 지우는 칩 — 위쪽 이용 순서 표시 바로 아래에 둔다. */
export function SearchResultChip({ query, total, truncated, loading, failed, onClose }: ChipProps) {
  const text = loading ? `'${query}' 찾는 중…` : failed ? `'${query}' 검색 결과를 불러오지 못했어요` : total === 0 ? `'${query}'에 맞는 매장이 없어요` : `'${query}' 매장 ${total?.toLocaleString("ko-KR")}곳을 지도에 표시했어요${truncated ? " (가까운 일부만)" : ""}`;
  return (
    <div role="status" style={{ position: "absolute", zIndex: OVERLAY_Z_INDEX, top: 106, left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 8, maxWidth: "calc(var(--app-vw) - 24px)", background: "#1D4ED8", color: "white", borderRadius: 999, padding: "6px 8px 6px 14px", fontSize: 13, fontWeight: 600, boxShadow: "0 2px 10px rgba(0,0,0,0.3)" }}>
      <span>{text}</span>
      <button type="button" onClick={onClose} style={{ border: "none", background: "rgba(255,255,255,0.2)", color: "white", borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>지우기 ×</button>
    </div>
  );
}
