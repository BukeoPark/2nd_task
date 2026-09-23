import { useEffect, useRef } from "react";
import type { RegionFeature } from "../../lib/apiClient";
import { ringsFromGeometry } from "../../lib/geo";
import { REGION_OUTLINE } from "../../lib/vizConfig";

interface RegionOutlineLayerProps {
  map: any;
  kakao: typeof window.kakao;
  features: RegionFeature[];
}

/** 행정동 경계(GeoJSON Polygon/MultiPolygon, [lon,lat] 순서)를 카카오 Polygon 외곽선으로 그린다. */
export function RegionOutlineLayer({ map, kakao, features }: RegionOutlineLayerProps) {
  const polygonsRef = useRef<any[]>([]);

  useEffect(() => {
    polygonsRef.current.forEach((p) => p.setMap(null));
    polygonsRef.current = [];

    for (const feature of features) {
      const rings = ringsFromGeometry(feature.geometry);
      for (const ring of rings) {
        const path = ring.map(([lon, lat]) => new kakao.maps.LatLng(lat, lon));
        const polygon = new kakao.maps.Polygon({ path, ...REGION_OUTLINE });
        polygon.setMap(map);
        polygonsRef.current.push(polygon);
      }
    }

    return () => {
      polygonsRef.current.forEach((p) => p.setMap(null));
      polygonsRef.current = [];
    };
  }, [map, kakao, features]);

  return null;
}
