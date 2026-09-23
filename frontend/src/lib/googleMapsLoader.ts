/** Google Maps JavaScript API(Places UI Kit) 로더. 'Google 고객평가'를 여는 순간에만 한 번 로드한다.
 * 키는 VITE_GOOGLE_MAPS_BROWSER_KEY(HTTP 리퍼러 제한 필수). 없으면 '연동 준비 중'으로 처리한다. */

declare global {
  interface Window {
    google?: any;
    __gmapsReady?: () => void;
  }
}

export class GoogleNotConfigured extends Error {}

let loadPromise: Promise<void> | null = null;

export function googleBrowserKeyConfigured(): boolean {
  return Boolean(import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY);
}

export function loadGooglePlacesUiKit(): Promise<void> {
  const key = import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY as string | undefined;
  if (!key) return Promise.reject(new GoogleNotConfigured("Google 브라우저 키가 설정되지 않았습니다"));
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    window.__gmapsReady = () => {
      window.google.maps.importLibrary("places").then(() => resolve(), reject);
    };
    const script = document.createElement("script");
    const q = new URLSearchParams({ key, v: "weekly", loading: "async", callback: "__gmapsReady", language: "ko", region: "KR" });
    script.src = `https://maps.googleapis.com/maps/api/js?${q}`;
    script.async = true;
    script.onerror = () => {
      loadPromise = null;
      reject(new Error("Google Maps 스크립트 로드 실패"));
    };
    document.head.appendChild(script);
  });
  return loadPromise;
}
