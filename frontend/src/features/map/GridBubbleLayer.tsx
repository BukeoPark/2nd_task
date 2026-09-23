import { useEffect, useRef } from "react";
import type { GridRecord } from "../../lib/apiClient";
import { toKakaoLatLng } from "../../lib/geo";
import { storeCountToRadiusPx, ZONE_COLORS } from "../../lib/vizConfig";

interface GridBubbleLayerProps {
  map: any;
  kakao: typeof window.kakao;
  records: GridRecord[];
  /** 업종을 고르면 격자별 점포수를 그 업종 기준으로 바꿔 그린다(0곳 격자는 숨김). */
  countOverride?: Record<string, number> | null;
  onSelect?: (record: GridRecord) => void;
}

/** 격자 점포 밀도를 버블(원)로 그린다. 확대/축소해도 화면상 크기가 일정하도록 CustomOverlay(div)를 쓴다. */
export function GridBubbleLayer({ map, kakao, records, countOverride, onSelect }: GridBubbleLayerProps) {
  const overlaysRef = useRef<any[]>([]);

  useEffect(() => {
    overlaysRef.current.forEach((overlay) => overlay.setMap(null));
    overlaysRef.current = [];

    const visible = countOverride
      ? records.map((r) => ({ ...r, store_count: countOverride[r.grid_id] ?? 0 })).filter((r) => r.store_count > 0)
      : records;
    const maxCount = Math.max(1, ...visible.map((r) => r.store_count));

    for (const record of visible) {
      const radius = storeCountToRadiusPx(record.store_count, maxCount);
      const color = record.starbucks_zone
        ? ZONE_COLORS.starbucks
        : record.daiso_zone
          ? ZONE_COLORS.daiso
          : ZONE_COLORS.base;

      const el = document.createElement("div");
      el.style.width = `${radius * 2}px`;
      el.style.height = `${radius * 2}px`;
      el.style.marginLeft = `${-radius}px`;
      el.style.marginTop = `${-radius}px`;
      el.style.borderRadius = "50%";
      el.style.background = color;
      el.style.opacity = "0.55";
      el.style.border = "1px solid rgba(0,0,0,0.2)";
      el.style.cursor = "pointer";
      el.title = countOverride ? `선택 업종 점포 ${record.store_count}개` : `점포 ${record.store_count}개 · ${record.top_category ?? "업종 정보 없음"}`;
      if (onSelect) {
        el.addEventListener("click", () => onSelect(record));
      }

      const overlay = new kakao.maps.CustomOverlay({
        position: toKakaoLatLng(kakao, record),
        content: el,
        map,
        zIndex: 1,
      });
      overlaysRef.current.push(overlay);
    }

    return () => {
      overlaysRef.current.forEach((overlay) => overlay.setMap(null));
      overlaysRef.current = [];
    };
  }, [map, kakao, records, countOverride, onSelect]);

  return null;
}
