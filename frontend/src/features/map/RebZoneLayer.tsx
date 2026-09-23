import { useEffect, useRef } from "react";
import type { RebZone } from "../../lib/apiClient";
import { toKakaoLatLng } from "../../lib/geo";
import { REB_ZONE_COLOR, rentToRadiusPx } from "../../lib/vizConfig";

interface RebZoneLayerProps {
  map: any;
  kakao: typeof window.kakao;
  zones: RebZone[];
  onSelect?: (zone: RebZone) => void;
}

/** 한국부동산원 R-ONE 임대동향 상권(5곳)을 마커로 표시한다 — 소규모 상가 임대료 기준 크기, 없으면 오피스 임대료로 대체. */
export function RebZoneLayer({ map, kakao, zones, onSelect }: RebZoneLayerProps) {
  const overlaysRef = useRef<any[]>([]);

  useEffect(() => {
    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];

    const maxRent = Math.max(1, ...zones.map((z) => z.rent_small_shop ?? z.rent_office ?? 0));

    for (const zone of zones) {
      const rent = zone.rent_small_shop ?? zone.rent_office;
      const radius = rentToRadiusPx(rent, maxRent);

      const el = document.createElement("div");
      el.style.width = `${radius * 2}px`;
      el.style.height = `${radius * 2}px`;
      el.style.marginLeft = `${-radius}px`;
      el.style.marginTop = `${-radius}px`;
      el.style.borderRadius = "50%";
      el.style.background = REB_ZONE_COLOR;
      el.style.opacity = "0.85";
      el.style.border = "2px solid white";
      el.style.boxShadow = "0 1px 4px rgba(0,0,0,0.4)";
      el.style.cursor = "pointer";
      el.title = zone.reb_zone_nm;
      if (onSelect) {
        el.addEventListener("click", () => onSelect(zone));
      }

      const overlay = new kakao.maps.CustomOverlay({
        position: toKakaoLatLng(kakao, zone),
        content: el,
        map,
        zIndex: 3,
      });
      overlaysRef.current.push(overlay);
    }

    return () => {
      overlaysRef.current.forEach((o) => o.setMap(null));
      overlaysRef.current = [];
    };
  }, [map, kakao, zones, onSelect]);

  return null;
}
