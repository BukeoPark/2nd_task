import { landingHref } from "./appLinks";

/** 현재 앱 환경(Vite)의 홈(랜딩) 주소 — 로고·'홈' 단추가 쓴다. 판단은 appLinks.landingHref(순수 함수). */
export const HOME_HREF = landingHref(import.meta.env.VITE_LANDING_URL as string | undefined, import.meta.env.DEV);
