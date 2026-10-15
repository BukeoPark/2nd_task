import { useEffect } from "react";
import { toKakaoLatLng } from "../../lib/geo";

export const RAIL_MARK_COLOR = "#6D28D9";   // 지하철 — 파란 반경 원·초록/빨강 앵커·검정 선택 매장 링과 겹치지 않는 보라

interface RailStationLayerProps {
  map: any;
  kakao: typeof window.kakao;
  stations: { id: string; name: string; lines: string; lon: number; lat: number; basis: "entrance" | "center" }[];
  exits: { id: string; label: string; lon: number; lat: number }[];
}

/** 반경 안 지하철 역(보라 '역' 네모 + 이름)과, 켰을 때만 출입구(작은 보라 점 + 번호)를 지도에 그린다.
 * 새 목록이 오거나 컴포넌트가 사라지면(매장·반경·메뉴 변경) 이전 오버레이를 모두 지운다. 지도 클릭을 가로채지 않는다. */
export function RailStationLayer({ map, kakao, stations, exits }: RailStationLayerProps) {
  useEffect(() => {
    const items: any[] = [];
    for (const s of stations) {
      const wrap = document.createElement("div");
      Object.assign(wrap.style, { position: "relative", pointerEvents: "none" });
      const box = document.createElement("div");
      box.textContent = "역";
      Object.assign(box.style, {
        width: "20px", height: "20px", marginLeft: "-10px", marginTop: "-10px", borderRadius: "5px", background: RAIL_MARK_COLOR, color: "white", fontSize: "12px", fontWeight: "700",
        display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid white", boxShadow: "0 1px 4px rgba(0,0,0,0.45)",
        outline: s.basis === "entrance" ? "none" : `1.5px dashed ${RAIL_MARK_COLOR}`, outlineOffset: "2px",   // 중심점 기준 역은 점선 테두리로 구분
      });
      const label = document.createElement("div");
      label.textContent = s.name;
      Object.assign(label.style, {
        position: "absolute", left: "14px", top: "-9px", whiteSpace: "nowrap", fontSize: "11px", fontWeight: "600", color: RAIL_MARK_COLOR,
        background: "rgba(255,255,255,0.92)", padding: "1px 5px", borderRadius: "4px", boxShadow: "0 1px 2px rgba(0,0,0,0.25)",
      });
      wrap.append(box, label);
      items.push(new kakao.maps.CustomOverlay({ position: toKakaoLatLng(kakao, s), content: wrap, map, zIndex: 3 }));
    }
    for (const e of exits) {
      const dot = document.createElement("div");
      dot.textContent = e.label;
      Object.assign(dot.style, {
        minWidth: "14px", height: "14px", marginLeft: "-7px", marginTop: "-7px", padding: "0 2px", boxSizing: "border-box", borderRadius: "7px", background: "white", color: RAIL_MARK_COLOR,
        fontSize: "9px", fontWeight: "700", lineHeight: "11px", textAlign: "center", border: `1.5px solid ${RAIL_MARK_COLOR}`, pointerEvents: "none",
      });
      items.push(new kakao.maps.CustomOverlay({ position: toKakaoLatLng(kakao, e), content: dot, map, zIndex: 2.8 }));
    }
    return () => items.forEach((o) => o.setMap(null));
  }, [map, kakao, stations, exits]);

  return null;
}
