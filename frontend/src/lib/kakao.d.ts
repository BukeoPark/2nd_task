// 카카오맵 JS SDK 공식 타입 패키지가 없어 최소한의 전역 선언만 둔다.
// 실제 사용은 kakaoLoader.ts 를 거친 뒤 features/map 안에서만 하고, `any` 노출 범위를 좁힌다.
export {};

declare global {
  interface Window {
    kakao: any;
  }
}
