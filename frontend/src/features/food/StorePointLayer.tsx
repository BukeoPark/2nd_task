import { useEffect, useRef } from "react";
import type { FoodStorePoint } from "../../lib/apiClient";
import { toKakaoLatLng } from "../../lib/geo";
import { pointLook, pointRole } from "../../lib/pointStyle";
import { glyphFontSize, glyphFor } from "../../lib/storeGlyph";
import { PEER_RING_COLOR, SELECTED_RING_COLOR, STORE_POINT_COLOR } from "../../lib/vizConfig";

interface StorePointLayerProps {
  map: any;
  kakao: typeof window.kakao;
  stores: FoodStorePoint[];
  onSelect: (storeId: string) => void;
  /** 새 조건의 결과를 기다리는 중 — 이전 조건의 점은 흐리게 하고 누를 수 없게 한다 */
  stale?: boolean;
  /** 지금 상세를 보고 있는 매장 — 점이 아니라 SelectedStoreMarker 가 크게 그리므로 여기서는 건너뛴다 */
  selectedId?: string | null;
  /** 패널 목록에서 마우스를 올린 매장 */
  hoveredId?: string | null;
  /** 선택한 매장과 같은 비교 단위·업종의 매장 id. 모르면 null */
  peerIds?: ReadonlySet<string> | null;
}

/** 가장 확대했을 때 개별 외식 매장을 점으로 그린다. 선택·비교 대상에 따른 모양 변화는 점을 다시 만들지 않고 스타일만 바꾼다. */
export function StorePointLayer({ map, kakao, stores, onSelect, stale = false, selectedId = null, hoveredId = null, peerIds = null }: StorePointLayerProps) {
  const overlaysRef = useRef<any[]>([]);
  const itemsRef = useRef<Map<string, { el: HTMLElement; overlay: any }>>(new Map());

  useEffect(() => {
    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];
    itemsRef.current = new Map();
    for (const s of stores) {
      if (s.store_id === selectedId) continue;
      const el = document.createElement("div");
      // 점 안에 업종 이모티콘(치킨 🍗·커피 ☕ …) — 모두 같은 색 점이면 업종이 헷갈려서. 흰 바탕에 파란 테두리로 지도 위에서 읽히게 한다.
      const g = glyphFor(s.svc);
      Object.assign(el.style, {
        boxSizing: "border-box", borderRadius: "50%", background: "white", border: `1.5px solid ${STORE_POINT_COLOR}`,
        display: "flex", alignItems: "center", justifyContent: "center", lineHeight: "1", overflow: "hidden", userSelect: "none",
        fontFamily: '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif',
        cursor: stale ? "default" : "pointer", pointerEvents: stale ? "none" : "auto", transition: "width .12s, height .12s, margin .12s, box-shadow .12s, opacity .12s, font-size .12s",
      });
      el.textContent = g.glyph;
      el.setAttribute("role", "img");
      el.setAttribute("aria-label", `${g.label} 매장`);
      el.title = `${s.name}${s.branch ? ` ${s.branch}` : ""} · ${g.label} · ${s.category}`;
      if (!stale) el.addEventListener("click", () => onSelect(s.store_id));
      const overlay = new kakao.maps.CustomOverlay({ position: toKakaoLatLng(kakao, s), content: el, map, zIndex: 3, clickable: true });
      itemsRef.current.set(s.store_id, { el, overlay });
      overlaysRef.current.push(overlay);
    }
    return () => {
      overlaysRef.current.forEach((o) => o.setMap(null));
      overlaysRef.current = [];
      itemsRef.current = new Map();
    };
  }, [map, kakao, stores, onSelect, stale, selectedId]);

  // 선택·올림·비교 대상이 바뀌어도 점은 그대로 두고 모양만 갱신한다.
  useEffect(() => {
    const colors = { selectedRing: SELECTED_RING_COLOR, peerRing: PEER_RING_COLOR };
    itemsRef.current.forEach(({ el, overlay }, id) => {
      const look = pointLook(pointRole(id, { selectedId, hoveredId, peerIds }), colors);
      overlay.setZIndex(look.zIndex);
      el.style.width = el.style.height = `${look.size}px`;
      el.style.fontSize = `${glyphFontSize(look.size)}px`;
      el.style.marginLeft = el.style.marginTop = `${-look.size / 2}px`;
      el.style.opacity = stale ? "0.3" : String(look.opacity);
      el.style.boxShadow = look.ring ? `0 0 0 ${look.ringWidth}px ${look.ring}, 0 1px 4px rgba(0,0,0,0.45)` : "0 1px 3px rgba(0,0,0,0.4)";
    });
  }, [stores, stale, selectedId, hoveredId, peerIds]);

  return null;
}
