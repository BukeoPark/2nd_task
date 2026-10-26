import type { ReactNode } from "react";

// 레일 메뉴 아이콘 중 상권 페이지(AreaOverviewPanel)와 매장 상세(GroupRail)가 같은 뜻으로 쓰는 것 — 한 곳에서 정해 두 화면의 모양을 맞춘다.
// 20x20 viewBox 안에 그리는 선 아이콘(TabRail 이 stroke 를 입힌다).

/** 가게 목록·이 매장 */
export const STORE_ICON: ReactNode = <path d="M3 9l1.5-5h11L17 9M4 9v8h12V9M8 17v-4h4v4" />;
/** 주변 환경(교통·시설) */
export const LOCATION_ICON: ReactNode = <path d="M10 18s6-5 6-9a6 6 0 10-12 0c0 4 6 9 6 9zM10 11a2 2 0 100-4 2 2 0 000 4z" />;
/** 경쟁(가게가 모인 정도·개폐업) */
export const COMPETE_ICON: ReactNode = <path d="M10 3l6 2v5c0 4-3 6-6 7-3-1-6-3-6-7V5z" />;
/** 요약 */
export const SUMMARY_ICON: ReactNode = <path d="M4 4h12v12H4zM7 8h6M7 12h4" />;
/** 소비 수요(사람들) */
export const DEMAND_ICON: ReactNode = (
  <>
    <circle cx="7" cy="7" r="2.5" />
    <circle cx="14" cy="8" r="2" />
    <path d="M2 16c0-3 2-5 5-5s5 2 5 5M12 16c0-2 1-3 3-3s3 1 3 3" />
  </>
);
/** 비용·임대(막대) */
export const COST_ICON: ReactNode = <path d="M4 16V8M10 16V4M16 16v-6M3 16h14" />;
