import { useEffect, useRef } from "react";
import type { FoodBubble, FoodBubblesResponse } from "../../lib/apiClient";
import { formatMetric } from "../../lib/format";
import { toKakaoLatLng } from "../../lib/geo";
import { foodBubbleColor, foodBubbleRadius } from "../../lib/vizConfig";

interface AreaBubbleLayerProps {
  map: any;
  kakao: typeof window.kakao;
  data: FoodBubblesResponse;
  onSelect: (bubble: FoodBubble) => void;
}

/** 자치구·행정동·상권 중심에 놓는 숫자 버블(호갱노노식). 크기 = 점포 수, 색 = 지표, 안에 지역명과 값을 쓴다. */
export function AreaBubbleLayer({ map, kakao, data, onSelect }: AreaBubbleLayerProps) {
  const overlaysRef = useRef<any[]>([]);

  useEffect(() => {
    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];
    const maxSize = Math.max(1, ...data.bubbles.map((b) => b.size ?? 0));
    const ranked = data.bubbles.filter((b) => b.value !== null).map((b) => b.value as number).sort((a, b) => a - b);
    const rank01 = (v: number | null) => (v === null || ranked.length < 2 ? null : ranked.indexOf(v) / (ranked.length - 1));

    // 작은 버블이 큰 버블 위에 오도록 크기 내림차순으로 그린다.
    for (const b of [...data.bubbles].sort((x, y) => (y.size ?? 0) - (x.size ?? 0))) {
      const r = foodBubbleRadius(b.size, maxSize);
      const color = foodBubbleColor(data.kind, b.value, rank01(b.value));
      const dark = b.value !== null && data.kind !== "growth" && (rank01(b.value) ?? 0) > 0.55;
      const el = document.createElement("div");
      Object.assign(el.style, {
        width: `${r * 2}px`, height: `${r * 2}px`, marginLeft: `${-r}px`, marginTop: `${-r}px`, borderRadius: "50%",
        background: color, opacity: "0.88", border: b.value === null ? "1px dashed #9CA3AF" : "2px solid white",
        boxShadow: "0 1px 4px rgba(0,0,0,0.25)", cursor: "pointer", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", textAlign: "center", lineHeight: "1.15",
        color: dark || data.kind === "growth" ? "white" : "#111827", fontSize: r > 24 ? "11px" : "9px", overflow: "hidden",
      });
      el.title = `${b.name} · ${data.label} ${formatMetric(data.kind, b.value)} · 점포 ${b.size ?? "-"}곳`;
      if (r >= 20) {
        const name = document.createElement("div");
        name.textContent = b.name.length > 6 ? `${b.name.slice(0, 6)}…` : b.name;
        name.style.fontWeight = "600";
        el.appendChild(name);
      }
      const val = document.createElement("div");
      val.textContent = formatMetric(data.kind, b.value);
      el.appendChild(val);
      el.addEventListener("click", () => onSelect(b));
      overlaysRef.current.push(new kakao.maps.CustomOverlay({ position: toKakaoLatLng(kakao, b), content: el, map, zIndex: 2 }));
    }
    return () => {
      overlaysRef.current.forEach((o) => o.setMap(null));
      overlaysRef.current = [];
    };
  }, [map, kakao, data, onSelect]);

  return null;
}
