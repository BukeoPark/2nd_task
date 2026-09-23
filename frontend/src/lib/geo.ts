/** 좌표는 항상 { lon, lat } 객체로 다루고, 카카오 SDK 가 요구하는 (lat, lng) 변환은 여기서만 한다. */

export interface LonLat {
  lon: number;
  lat: number;
}

export function toKakaoLatLng(kakao: typeof window.kakao, p: LonLat) {
  return new kakao.maps.LatLng(p.lat, p.lon);
}

// 파일럿 두 구를 함께 보여주는 기본 지도 중심(영등포구청 인근) — data/processed 파이프라인의 PILOT_SIGUNGU 와 대응.
export const DEFAULT_CENTER: LonLat = { lon: 126.9095, lat: 37.5219 };
export const DEFAULT_LEVEL = 7; // 카카오맵 확대 레벨(작을수록 확대)

/** GeoJSON Polygon/MultiPolygon([lon,lat] 순서)의 바깥 링(구멍 제외)만 뽑아 평탄화한다. */
export function ringsFromGeometry(geometry: { type: string; coordinates: unknown }): [number, number][][] {
  if (geometry.type === "Polygon") {
    const coords = geometry.coordinates as number[][][];
    return coords.length ? [coords[0] as [number, number][]] : [];
  }
  if (geometry.type === "MultiPolygon") {
    const coords = geometry.coordinates as number[][][][];
    return coords.filter((poly) => poly.length).map((poly) => poly[0] as [number, number][]);
  }
  return [];
}
