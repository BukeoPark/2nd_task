import { useEffect } from "react";
import { toKakaoLatLng, type LonLat } from "../../lib/geo";
import { OVERLAY_Z_INDEX } from "../../lib/vizConfig";

/** 검색으로 고른 위치 표시(핀). */
export function SearchMarker({ map, kakao, place }: { map: any; kakao: typeof window.kakao; place: (LonLat & { name: string }) | null }) {
  useEffect(() => {
    if (!place) return;
    const el = document.createElement("div");
    Object.assign(el.style, { transform: "translate(-50%, -100%)", textAlign: "center", pointerEvents: "none" });
    const label = document.createElement("div");
    label.textContent = place.name.length > 14 ? `${place.name.slice(0, 14)}…` : place.name;
    Object.assign(label.style, { background: "#1D4ED8", color: "white", fontSize: "11px", fontWeight: "600", padding: "3px 8px", borderRadius: "999px", whiteSpace: "nowrap", boxShadow: "0 1px 4px rgba(0,0,0,0.3)" });
    const pin = document.createElement("div");
    Object.assign(pin.style, { width: "0", height: "0", margin: "0 auto", borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: "8px solid #1D4ED8" });
    el.append(label, pin);
    const overlay = new kakao.maps.CustomOverlay({ position: toKakaoLatLng(kakao, place), content: el, map, zIndex: OVERLAY_Z_INDEX - 1 });
    return () => overlay.setMap(null);
  }, [map, kakao, place]);
  return null;
}
