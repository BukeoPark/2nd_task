import { useEffect } from "react";
import { ringsFromGeometry } from "../../lib/geo";
import { UNIT_BOUNDARY } from "../../lib/vizConfig";

interface UnitBoundaryLayerProps {
  map: any;
  kakao: typeof window.kakao;
  /** 선택한 매장의 비교 단위(상권·행정동) 경계 GeoJSON geometry */
  geometry: { type: string; coordinates: unknown };
}

/** 선택한 매장이 어느 영역과 비교되는지 보이도록 그 비교 단위의 경계를 파란 윤곽선으로 그린다. */
export function UnitBoundaryLayer({ map, kakao, geometry }: UnitBoundaryLayerProps) {
  useEffect(() => {
    const polygons = ringsFromGeometry(geometry).map(
      (ring) => new kakao.maps.Polygon({ map, path: ring.map(([lon, lat]) => new kakao.maps.LatLng(lat, lon)), ...UNIT_BOUNDARY }),
    );
    return () => polygons.forEach((p) => p.setMap(null));
  }, [map, kakao, geometry]);

  return null;
}
