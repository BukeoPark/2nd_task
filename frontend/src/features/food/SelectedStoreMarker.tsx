import { useEffect } from "react";
import { toKakaoLatLng } from "../../lib/geo";
import { pointLook } from "../../lib/pointStyle";
import { PEER_RING_COLOR, SELECTED_RING_COLOR, STORE_POINT_COLOR } from "../../lib/vizConfig";

interface SelectedStoreMarkerProps {
  map: any;
  kakao: typeof window.kakao;
  store: { name: string; branch: string | null; lon: number; lat: number };
}

/** 지금 상세를 보고 있는 매장 — 어느 확대 단계에서도 크게(링) 표시하고 이름을 붙인다. 지도 이벤트를 가로채지 않는다. */
export function SelectedStoreMarker({ map, kakao, store }: SelectedStoreMarkerProps) {
  const { name, branch, lon, lat } = store;
  useEffect(() => {
    const look = pointLook("selected", { selectedRing: SELECTED_RING_COLOR, peerRing: PEER_RING_COLOR });
    const wrap = document.createElement("div");
    Object.assign(wrap.style, { position: "relative", width: `${look.size}px`, height: `${look.size}px`, pointerEvents: "none" });
    const dot = document.createElement("div");
    Object.assign(dot.style, {
      boxSizing: "border-box", width: "100%", height: "100%", borderRadius: "50%", background: STORE_POINT_COLOR, border: "3px solid white",
      boxShadow: `0 0 0 ${look.ringWidth}px ${look.ring}, 0 2px 8px rgba(0,0,0,0.5)`,
    });
    const label = document.createElement("div");
    label.textContent = `${name}${branch ? ` ${branch}` : ""}`;
    Object.assign(label.style, {
      position: "absolute", left: "50%", bottom: `${look.size + look.ringWidth + 4}px`, transform: "translateX(-50%)", whiteSpace: "nowrap",
      background: SELECTED_RING_COLOR, color: "white", fontSize: "12px", fontWeight: "600", padding: "3px 8px", borderRadius: "6px", boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
    });
    wrap.append(dot, label);
    const overlay = new kakao.maps.CustomOverlay({ position: toKakaoLatLng(kakao, { lon, lat }), content: wrap, map, zIndex: look.zIndex + 2, xAnchor: 0.5, yAnchor: 0.5 });
    return () => overlay.setMap(null);
  }, [map, kakao, name, branch, lon, lat]);

  return null;
}
