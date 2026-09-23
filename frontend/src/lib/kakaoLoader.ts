/** 카카오맵 JS SDK를 한 번만 로드하는 헬퍼. 여러 컴포넌트가 동시에 불러도 스크립트는 한 번만 삽입된다. */

let loadPromise: Promise<typeof window.kakao> | null = null;

export function loadKakaoMaps(): Promise<typeof window.kakao> {
  if (window.kakao?.maps) {
    return Promise.resolve(window.kakao);
  }
  if (loadPromise) {
    return loadPromise;
  }

  const appKey = import.meta.env.VITE_KAKAO_JS_APP_KEY as string | undefined;
  if (!appKey) {
    return Promise.reject(
      new Error(
        "VITE_KAKAO_JS_APP_KEY 가 설정되지 않았습니다. frontend/.env 에 카카오 JavaScript 키를 넣으세요.",
      ),
    );
  }

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false`;
    script.async = true;
    script.onload = () => {
      window.kakao.maps.load(() => resolve(window.kakao));
    };
    script.onerror = () => {
      loadPromise = null; // 실패하면 다음 시도에서 다시 로드하게 둔다.
      reject(new Error("카카오맵 SDK 로드 실패 (네트워크 또는 플랫폼 도메인 미등록 확인)"));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}
