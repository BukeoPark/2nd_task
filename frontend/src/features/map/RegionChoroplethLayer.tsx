import { useEffect, useRef } from "react";
import type { DongMetric, RegionFeature } from "../../lib/apiClient";
import { ringsFromGeometry } from "../../lib/geo";
import { changeIndexToTrendColor } from "../../lib/vizConfig";

interface RegionChoroplethLayerProps {
  map: any;
  kakao: typeof window.kakao;
  features: RegionFeature[];
  metrics: DongMetric[];
  onSelect?: (record: DongMetric) => void;
}

/** 행정동 폴리곤을 상권변화지표(change_index) 기준 상승/하강/보합 3색 코로플레스로 채운다.
 * region_id 로 features<->metrics 를 잇는다. */
export function RegionChoroplethLayer({ map, kakao, features, metrics, onSelect }: RegionChoroplethLayerProps) {
  const polygonsRef = useRef<any[]>([]);

  useEffect(() => {
    polygonsRef.current.forEach((p) => p.setMap(null));
    polygonsRef.current = [];

    const metricByRegionId = new Map(metrics.map((m) => [m.region_id, m]));

    for (const feature of features) {
      const regionId = feature.properties.region_id;
      const metric = regionId !== undefined ? metricByRegionId.get(regionId) : undefined;
      const fillColor = metric ? changeIndexToTrendColor(metric.change_index) : "#e5e7eb";

      for (const ring of ringsFromGeometry(feature.geometry)) {
        const path = ring.map(([lon, lat]) => new kakao.maps.LatLng(lat, lon));
        const polygon = new kakao.maps.Polygon({
          path,
          strokeColor: "#374151",
          strokeWeight: 1,
          strokeOpacity: 0.5,
          fillColor,
          fillOpacity: 0.75,
        });
        polygon.setMap(map);
        if (metric && onSelect) {
          kakao.maps.event.addListener(polygon, "click", () => onSelect(metric));
        }
        polygonsRef.current.push(polygon);
      }
    }

    return () => {
      polygonsRef.current.forEach((p) => p.setMap(null));
      polygonsRef.current = [];
    };
  }, [map, kakao, features, metrics, onSelect]);

  return null;
}
