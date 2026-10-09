import { useEffect, useRef } from "react";
import type { FoodAnchorsResponse } from "../../lib/apiClient";
import { toKakaoLatLng } from "../../lib/geo";
import { ANCHOR_MARK, ZONE_COLORS } from "../../lib/vizConfig";

interface AnchorLayerProps {
  map: any;
  kakao: typeof window.kakao;
  data: FoodAnchorsResponse;
  /** 도보권(250m) 원까지 그릴지 — 넓게 볼 때는 원이 겹쳐 지도를 가려서 확대했을 때만 켠다. */
  showWalkCircles: boolean;
}

/** 앵커 브랜드(스타벅스·다이소) 매장 표시 + 도보권 원. 버블보다 위, 매장 점보다 아래에 그린다. */
export function AnchorLayer({ map, kakao, data, showWalkCircles }: AnchorLayerProps) {
  const itemsRef = useRef<any[]>([]);

  useEffect(() => {
    itemsRef.current.forEach((o) => o.setMap(null));
    itemsRef.current = [];
    for (const s of data.stores) {
      const color = ZONE_COLORS[s.brand];
      const pos = toKakaoLatLng(kakao, s);
      if (showWalkCircles) {
        itemsRef.current.push(new kakao.maps.Circle({
          map, center: pos, radius: data.walk_m, strokeWeight: 1, strokeColor: color, strokeOpacity: 0.6,
          fillColor: color, fillOpacity: 0.06,
        }));
      }
      const el = document.createElement("div");
      Object.assign(el.style, {
        width: "18px", height: "18px", marginLeft: "-9px", marginTop: "-9px", borderRadius: "4px", background: color,
        color: "white", fontSize: "11px", fontWeight: "700", display: "flex", alignItems: "center", justifyContent: "center",
        border: "1.5px solid white", boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
      });
      el.textContent = ANCHOR_MARK[s.brand];
      el.title = `${data.brands[s.brand]} ${s.name}${s.branch ? ` ${s.branch}` : ""}`;
      itemsRef.current.push(new kakao.maps.CustomOverlay({ position: pos, content: el, map, zIndex: 2.5 }));
    }
    return () => {
      itemsRef.current.forEach((o) => o.setMap(null));
      itemsRef.current = [];
    };
  }, [map, kakao, data, showWalkCircles]);

  return null;
}
