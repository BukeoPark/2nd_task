import { useEffect, useRef } from "react";
import { toKakaoLatLng } from "../../lib/geo";
import { RADIUS_CIRCLE } from "../../lib/vizConfig";

interface RadiusCircleLayerProps {
  map: any;
  kakao: typeof window.kakao;
  center: { lon: number; lat: number };
  radiusM: number;
}

/** 선택 매장 중심의 분석 반경 원. kakao.maps.Circle(미터 단위 지리 반경)이라 확대·이동해도 실제 반경이 유지된다.
 * 원은 하나만 만들고 반경이 바뀌면 setRadius 로 고친다. 중심(매장)이 바뀌거나 사라지면 지운다. 매장 마커·버블은 CustomOverlay 라 원 위에 그려진다. */
export function RadiusCircleLayer({ map, kakao, center, radiusM }: RadiusCircleLayerProps) {
  const circleRef = useRef<any>(null);
  const radiusRef = useRef(radiusM);
  const { lon, lat } = center;

  // 아래 두 효과보다 먼저 실행돼, 원을 새로 만들 때 항상 최신 반경을 쓴다.
  useEffect(() => {
    radiusRef.current = radiusM;
  }, [radiusM]);

  useEffect(() => {
    const circle = new kakao.maps.Circle({
      map,
      center: toKakaoLatLng(kakao, { lon, lat }),
      radius: radiusRef.current,
      strokeWeight: RADIUS_CIRCLE.strokeWeight,
      strokeColor: RADIUS_CIRCLE.color,
      strokeOpacity: RADIUS_CIRCLE.strokeOpacity,
      fillColor: RADIUS_CIRCLE.color,
      fillOpacity: RADIUS_CIRCLE.fillOpacity,
      zIndex: 0,
    });
    circleRef.current = circle;
    return () => {
      circle.setMap(null);
      circleRef.current = null;
    };
  }, [map, kakao, lon, lat]);

  useEffect(() => {
    circleRef.current?.setRadius(radiusM);
  }, [radiusM]);

  return null;
}
