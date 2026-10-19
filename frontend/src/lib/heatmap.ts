// 지도 히트맵(유동인구·인구밀도·직장인구) — 상권 단위 점을 번지게 그려 열 지도처럼 보이는 계산. 그리는 일(캔버스)은 features/food/HeatmapLayer 가 한다.
// 점마다 투명도로 번짐(알파)을 쌓고, 쌓인 알파를 색 사다리(파랑→초록→노랑→빨강)로 바꾼다.
// 다른 모듈을 import 하지 않는 순수 함수(tests/heatmap.test.ts).

export type HeatMetric = "flpop" | "resident" | "worker";

export const HEAT_METRICS: { value: HeatMetric; label: string }[] = [
  { value: "flpop", label: "유동인구" },
  { value: "resident", label: "인구밀도" },
  { value: "worker", label: "직장인구" },
];

/** 색 사다리(0=옅음 → 1=진함) — 범례와 지도가 같은 값을 쓴다. */
export const HEAT_STOPS: { at: number; rgb: [number, number, number] }[] = [
  { at: 0.0, rgb: [47, 91, 255] },
  { at: 0.3, rgb: [25, 211, 197] },
  { at: 0.55, rgb: [123, 217, 87] },
  { at: 0.78, rgb: [255, 225, 77] },
  { at: 1.0, rgb: [255, 59, 48] },
];
export const HEAT_CSS_GRADIENT = `linear-gradient(to right, ${HEAT_STOPS.map((s) => `rgb(${s.rgb.join(",")}) ${Math.round(s.at * 100)}%`).join(", ")})`;

/** 점이 번지는 반경(실제 거리, m)과 화면에서의 한계(px) — 너무 작으면 점으로, 너무 크면 지도를 덮는다. */
export const HEAT_RADIUS_M = 420;
export const HEAT_RADIUS_MIN_PX = 16;
export const HEAT_RADIUS_MAX_PX = 120;

export function heatRadiusPx(metersPerPixel: number): number {
  if (!(metersPerPixel > 0)) return HEAT_RADIUS_MIN_PX;
  return Math.min(HEAT_RADIUS_MAX_PX, Math.max(HEAT_RADIUS_MIN_PX, HEAT_RADIUS_M / metersPerPixel));
}

/** 서버가 준 비율(0~1, 상위 5% 값=1)을 그리는 세기로 — 낮은 값도 조금은 보이게 완만하게 올린다. */
export function weightIntensity(weight: number): number {
  const w = Math.min(1, Math.max(0, weight));
  return Math.pow(w, 0.75) * 0.9;
}

/** 0~255 알파 → 색 사다리의 RGB 표(256칸). */
export function buildLut(): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let k = 0;
    while (k < HEAT_STOPS.length - 2 && t > HEAT_STOPS[k + 1].at) k++;
    const a = HEAT_STOPS[k], b = HEAT_STOPS[k + 1];
    const f = Math.min(1, Math.max(0, (t - a.at) / (b.at - a.at)));
    for (let c = 0; c < 3; c++) lut[i * 3 + c] = Math.round(a.rgb[c] + (b.rgb[c] - a.rgb[c]) * f);
  }
  return lut;
}

/** 번짐이 쌓인 RGBA 배열(알파만 의미 있음)을 색 입힌 RGBA 로 바꾼다. 거의 투명한 곳은 그대로 비운다. */
export function colorize(data: Uint8ClampedArray, lut: Uint8ClampedArray, maxAlpha = 210): void {
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 6) { data[i + 3] = 0; continue; }
    data[i] = lut[a * 3];
    data[i + 1] = lut[a * 3 + 1];
    data[i + 2] = lut[a * 3 + 2];
    data[i + 3] = Math.min(maxAlpha, 50 + a * 0.75);
  }
}

/** 범례 숫자 — 상위 5% 값을 가장 진한 색의 기준으로 쓴다는 설명과 함께 보인다. */
export function heatLegendText(unit: string, p95: number): string {
  return `${Math.round(p95).toLocaleString("ko-KR")}${unit.startsWith("명/") ? "명/㎢" : "명"} 이상이면 가장 진함`;
}
