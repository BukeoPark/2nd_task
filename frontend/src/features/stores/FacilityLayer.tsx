import { useEffect } from "react";
import { FACILITY_MARK, type FacilityMapItem } from "../../lib/facilityText";
import { toKakaoLatLng } from "../../lib/geo";

interface FacilityLayerProps {
  map: any;
  kakao: typeof window.kakao;
  facilities: FacilityMapItem[];
}

/** 반경 안 공식 집객시설을 종류별 색·글자의 둥근 마커로 그린다(보라 '역' 네모, 파란 반경 원, 앵커 마커와 모양·색이 다르다).
 * 이 데이터는 공식 자료·이용 권한 확인 시설뿐이다 — 카카오 로컬 장소 데이터는 지도 타일(SDK)과 별개이고 여기에 그리지 않는다.
 * 문화시설은 수가 많아 이름표 없이 점+툴팁만 둔다. 새 목록이 오거나 컴포넌트가 사라지면(매장·반경·메뉴·체크 변경) 이전 오버레이를 모두 지운다. */
export function FacilityLayer({ map, kakao, facilities }: FacilityLayerProps) {
  useEffect(() => {
    const items: any[] = [];
    for (const f of facilities) {
      const mark = FACILITY_MARK[f.type];
      const wrap = document.createElement("div");
      Object.assign(wrap.style, { position: "relative" });
      const shown = f.display_name ?? f.name;
      wrap.title = `${shown}${shown !== f.name ? ` (공식 명칭: ${f.name})` : ""} · ${f.distance_m.toLocaleString("ko-KR")}m · ${f.status_label}`;
      const dot = document.createElement("div");
      dot.textContent = mark.glyph;
      Object.assign(dot.style, {
        width: "18px", height: "18px", marginLeft: "-9px", marginTop: "-9px", borderRadius: "50%", background: mark.color, color: "white", fontSize: "11px", fontWeight: "700",
        display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid white", boxShadow: "0 1px 4px rgba(0,0,0,0.45)",
        outline: f.subtype === "상급종합" ? `2px solid ${mark.color}` : "none", outlineOffset: "1px",      // 상급종합병원은 바깥 링으로 구분
      });
      wrap.append(dot);
      if (f.type !== "cultural_facility") {
        const label = document.createElement("div");
        label.textContent = shown;
        Object.assign(label.style, {
          position: "absolute", left: "13px", top: "-9px", whiteSpace: "nowrap", fontSize: "11px", fontWeight: "600", color: mark.color,
          background: "rgba(255,255,255,0.92)", padding: "1px 5px", borderRadius: "4px", boxShadow: "0 1px 2px rgba(0,0,0,0.25)", pointerEvents: "none",
        });
        wrap.append(label);
      }
      items.push(new kakao.maps.CustomOverlay({ position: toKakaoLatLng(kakao, f), content: wrap, map, zIndex: 2.6 }));
    }
    return () => items.forEach((o) => o.setMap(null));
  }, [map, kakao, facilities]);

  return null;
}
