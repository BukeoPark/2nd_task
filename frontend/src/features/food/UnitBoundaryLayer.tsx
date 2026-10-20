import { useEffect } from "react";
import { ringsFromGeometry } from "../../lib/geo";
import { UNIT_BOUNDARY, UNIT_BOUNDARY_WEAK } from "../../lib/vizConfig";

interface UnitBoundaryLayerProps {
  map: any;
  kakao: typeof window.kakao;
  /** 선택한 매장의 비교 단위(상권·행정동) 경계 GeoJSON geometry */
  geometry: { type: string; coordinates: unknown };
  /** '주변·경쟁' 분석을 보는 중이면 진하게, 아니면 약하게 */
  strong?: boolean;
}

/** 선택한 매장이 어느 영역과 비교되는지 보이도록 그 비교 단위의 경계를 파란 윤곽선으로 그린다. */
export function UnitBoundaryLayer({ map, kakao, geometry, strong = true }: UnitBoundaryLayerProps) {
  useEffect(() => {
    const polygons = ringsFromGeometry(geometry).map(
      (ring) => new kakao.maps.Polygon({ map, path: ring.map(([lon, lat]) => new kakao.maps.LatLng(lat, lon)), ...(strong ? UNIT_BOUNDARY : UNIT_BOUNDARY_WEAK) }),
    );
    return () => polygons.forEach((p) => p.setMap(null));
  }, [map, kakao, geometry, strong]);

  return null;
}
