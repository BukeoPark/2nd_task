import { useEffect } from "react";
import type { FoodHeatResponse } from "../../lib/apiClient";
import { buildLut, colorize, heatRadiusPx, weightIntensity } from "../../lib/heatmap";

interface HeatmapLayerProps {
  map: any;
  kakao: typeof window.kakao;
  data: FoodHeatResponse;
}

const SCALE = 0.5; // 절반 해상도로 그려 빠르게 하고, 화면에서 늘리면 번짐이 더 부드러워진다

/** 인구 히트맵 — 상권 단위 점을 번지게 쌓아 색으로 바꾼 캔버스를 지도 위에 얹는다(마우스는 그대로 지도로 통과).
 * 지도를 움직이거나 확대·축소하는 동안에도 따라가도록 bounds_changed 마다 다시 그린다. */
export function HeatmapLayer({ map, kakao, data }: HeatmapLayerProps) {
  useEffect(() => {
    const node: HTMLElement = map.getNode();
    const canvas = document.createElement("canvas");
    Object.assign(canvas.style, { position: "absolute", left: "0", top: "0", width: "100%", height: "100%", pointerEvents: "none", zIndex: "2" });
    canvas.setAttribute("aria-hidden", "true");
    node.appendChild(canvas);
    const off = document.createElement("canvas");
    const lut = buildLut();
    let raf = 0;

    const draw = () => {
      raf = 0;
      const w = Math.max(1, Math.round(node.clientWidth * SCALE));
      const h = Math.max(1, Math.round(node.clientHeight * SCALE));
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      off.width = w;
      off.height = h;
      const g = off.getContext("2d");
      const out = canvas.getContext("2d");
      if (!g || !out) return;
      const proj = map.getProjection();
      // 화면 한 칸이 실제 몇 m 인지 — 가운데 점과 동쪽으로 조금 간 점의 화면 거리로 잰다
      const c = map.getCenter();
      const a = proj.containerPointFromCoords(c);
      const b = proj.containerPointFromCoords(new kakao.maps.LatLng(c.getLat(), c.getLng() + 0.001));
      const metersPerPx = (0.001 * 111320 * Math.cos((c.getLat() * Math.PI) / 180)) / Math.max(0.5, Math.abs(b.x - a.x));
      const r = heatRadiusPx(metersPerPx) * SCALE;
      for (const p of data.points) {
        const pt = proj.containerPointFromCoords(new kakao.maps.LatLng(p.lat, p.lon));
        const x = pt.x * SCALE, y = pt.y * SCALE;
        if (x < -r || y < -r || x > w + r || y > h + r) continue;
        const grad = g.createRadialGradient(x, y, 0, x, y, r);
        const alpha = weightIntensity(p.weight);
        grad.addColorStop(0, `rgba(0,0,0,${alpha})`);
        grad.addColorStop(0.5, `rgba(0,0,0,${alpha * 0.45})`);
        grad.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = grad;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      const img = g.getImageData(0, 0, w, h);
      colorize(img.data, lut);
      out.putImageData(img, 0, 0);
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(draw); };

    kakao.maps.event.addListener(map, "bounds_changed", schedule);
    kakao.maps.event.addListener(map, "zoom_changed", schedule);
    window.addEventListener("resize", schedule);
    draw();
    return () => {
      if (raf) cancelAnimationFrame(raf);
      kakao.maps.event.removeListener(map, "bounds_changed", schedule);
      kakao.maps.event.removeListener(map, "zoom_changed", schedule);
      window.removeEventListener("resize", schedule);
      canvas.remove();
    };
  }, [map, kakao, data]);

  return null;
}
