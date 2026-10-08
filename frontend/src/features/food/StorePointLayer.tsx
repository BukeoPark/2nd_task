import { useEffect, useRef } from "react";
import type { FoodStorePoint } from "../../lib/apiClient";
import { toKakaoLatLng } from "../../lib/geo";

interface StorePointLayerProps {
  map: any;
  kakao: typeof window.kakao;
  stores: FoodStorePoint[];
  onSelect: (storeId: string) => void;
}

/** 가장 확대했을 때 개별 외식 매장을 점으로 그린다. */
export function StorePointLayer({ map, kakao, stores, onSelect }: StorePointLayerProps) {
  const overlaysRef = useRef<any[]>([]);

  useEffect(() => {
    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];
    for (const s of stores) {
      const el = document.createElement("div");
      Object.assign(el.style, {
        width: "12px", height: "12px", marginLeft: "-6px", marginTop: "-6px", borderRadius: "50%",
        background: "#F97316", border: "2px solid white", boxShadow: "0 1px 3px rgba(0,0,0,0.4)", cursor: "pointer",
      });
      el.title = `${s.name}${s.branch ? ` ${s.branch}` : ""} · ${s.category}`;
      el.addEventListener("click", () => onSelect(s.store_id));
      overlaysRef.current.push(new kakao.maps.CustomOverlay({ position: toKakaoLatLng(kakao, s), content: el, map, zIndex: 3 }));
    }
    return () => {
      overlaysRef.current.forEach((o) => o.setMap(null));
      overlaysRef.current = [];
    };
  }, [map, kakao, stores, onSelect]);

  return null;
}
