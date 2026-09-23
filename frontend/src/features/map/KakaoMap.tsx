import { useEffect, useRef, useState } from "react";
import { loadKakaoMaps } from "../../lib/kakaoLoader";
import { toKakaoLatLng, DEFAULT_CENTER, DEFAULT_LEVEL, type LonLat } from "../../lib/geo";

interface KakaoMapProps {
  center?: LonLat;
  level?: number;
  onReady: (map: any, kakao: typeof window.kakao) => void;
  children?: React.ReactNode;
}

/** 카카오맵 SDK를 로드하고 지도 인스턴스를 만든다. 실제 레이어(버블 등)는 onReady 로 받은 map/kakao 로 자식이 그린다. */
export function KakaoMap({ center = DEFAULT_CENTER, level = DEFAULT_LEVEL, onReady, children }: KakaoMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadKakaoMaps()
      .then((kakao) => {
        if (cancelled || !containerRef.current) return;
        const map = new kakao.maps.Map(containerRef.current, {
          center: toKakaoLatLng(kakao, center),
          level,
        });
        map.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);
        // 컨테이너 크기를 카카오맵이 최초 렌더 시점에 못 잡는 경우가 있어(특히 flex 레이아웃),
        // relayout 을 한 번 더 불러 폴리곤 등 오버레이의 클릭 히트박스가 어긋나지 않게 한다.
        requestAnimationFrame(() => {
          map.relayout();
          map.setCenter(toKakaoLatLng(kakao, center));
        });
        onReady(map, kakao);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 지도 인스턴스는 최초 1회만 생성한다.
  }, []);

  if (error) {
    return (
      <div style={{ padding: 24, color: "#b91c1c", background: "#fef2f2", borderRadius: 8 }}>
        지도를 불러오지 못했습니다: {error}
      </div>
    );
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      {children}
    </div>
  );
}
