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
    let observer: ResizeObserver | null = null;
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
        // 컨테이너 크기가 바뀌면(창·패널 크기 변경, 휴대폰 회전, 숨겨졌다 다시 보임) 카카오맵은 스스로 알지 못하고 중심도 밀려서, 선택 매장 마커 같은 오버레이가
        // 화면 밖으로 나가 사라진다(카카오맵은 화면 밖 오버레이를 그리지 않는다). 크기가 바뀔 때마다 relayout 하고, 크기가 바뀌기 전에 보던 중심으로 되돌린다.
        // 중심은 크기가 그대로일 때의 idle(이동·확대 끝)에서만 기억한다 — 크기가 바뀐 뒤 카카오맵이 밀어 놓은 중심을 기억하지 않도록.
        const el = containerRef.current;
        let size = { w: el.clientWidth, h: el.clientHeight };
        let lastCenter = map.getCenter();
        kakao.maps.event.addListener(map, "idle", () => {
          if (el.clientWidth === size.w && el.clientHeight === size.h) lastCenter = map.getCenter();
        });
        observer = new ResizeObserver(() => {
          if (el.clientWidth === 0 || el.clientHeight === 0) return; // 숨겨져 크기가 0 인 동안은 건드리지 않는다(다시 보일 때 원래 크기와 같으면 그대로 둔다)
          if (el.clientWidth === size.w && el.clientHeight === size.h) return;
          size = { w: el.clientWidth, h: el.clientHeight };
          map.relayout();
          map.setCenter(lastCenter);
        });
        observer.observe(el);
        onReady(map, kakao);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
      observer?.disconnect();
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
