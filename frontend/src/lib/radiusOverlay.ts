// '주변' 반경 원을 지도에 그릴지 판단 — 다른 모듈을 import 하지 않는 순수 함수(tests/radiusOverlay.test.ts).

/** 서버가 허용하는 분석 반경(location-influence 의 RADII_M 과 같다). */
export const OVERLAY_RADII_M: readonly number[] = [250, 500, 1000];

/** 원을 그릴 반경. '주변' 묶음이 열려 있고 허용된 반경일 때만 값을 돌려준다(아니면 null = 원 없음). */
export function overlayRadius(group: string, radiusM: number): number | null {
  return group === "radius" && OVERLAY_RADII_M.includes(radiusM) ? radiusM : null;
}

/** 지도에 놓을 수 있는 좌표인지 — 숫자가 아니거나 (0,0)·한반도 밖이면 원을 만들지 않는다. */
export function validCenter(lon: number | null | undefined, lat: number | null | undefined): boolean {
  if (typeof lon !== "number" || typeof lat !== "number" || !Number.isFinite(lon) || !Number.isFinite(lat)) return false;
  return lon >= 124 && lon <= 132 && lat >= 33 && lat <= 39;
}
