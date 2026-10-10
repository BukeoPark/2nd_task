import { useEffect, useRef } from "react";
import type { FoodStorePoint } from "../../lib/apiClient";
import { toKakaoLatLng } from "../../lib/geo";
import { STORE_POINT_COLOR } from "../../lib/vizConfig";

interface StorePointLayerProps {
  map: any;
  kakao: typeof window.kakao;
  stores: FoodStorePoint[];
  onSelect: (storeId: string) => void;
  /** 새 조건의 결과를 기다리는 중 — 이전 조건의 점은 흐리게 하고 누를 수 없게 한다 */
  stale?: boolean;
}

/** 가장 확대했을 때 개별 외식 매장을 점으로 그린다. */
export function StorePointLayer({ map, kakao, stores, onSelect, stale = false }: StorePointLayerProps) {
  const overlaysRef = useRef<any[]>([]);

  useEffect(() => {
    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];
    for (const s of stores) {
      const el = document.createElement("div");
      Object.assign(el.style, {
        width: "12px", height: "12px", marginLeft: "-6px", marginTop: "-6px", borderRadius: "50%",
        background: STORE_POINT_COLOR, border: "2px solid white", boxShadow: "0 1px 3px rgba(0,0,0,0.4)", cursor: stale ? "default" : "pointer",
        opacity: stale ? "0.3" : "1", pointerEvents: stale ? "none" : "auto",
      });
      el.title = `${s.name}${s.branch ? ` ${s.branch}` : ""} · ${s.category}`;
      if (!stale) el.addEventListener("click", () => onSelect(s.store_id));
      overlaysRef.current.push(new kakao.maps.CustomOverlay({ position: toKakaoLatLng(kakao, s), content: el, map, zIndex: 3 }));
    }
    return () => {
      overlaysRef.current.forEach((o) => o.setMap(null));
      overlaysRef.current = [];
    };
  }, [map, kakao, stores, onSelect, stale]);

  return null;
}
