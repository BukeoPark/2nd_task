// 튜토리얼(처음 쓰는 사람이 길을 잃지 않게 하는 안내) — 모드별로 어느 요소를 어떤 말로 가리킬지와, 말풍선 자리 계산.
// 대상은 화면의 data-tour 이름으로 가리킨다(요소가 지금 없으면 화면 가운데 카드로 말한다). 다른 모듈은 타입만 가져오는 순수 함수(tests/tour.test.ts).
import type { Mode } from "./mode";

export type Placement = "top" | "bottom" | "left" | "right";

export interface TourStep {
  id: string;
  /** 가리킬 요소의 data-tour 값 */
  target: string;
  title: string;
  body: string;
  placement: Placement;
  /** 대상이 지금 화면에 없을 때 가운데 카드에 덧붙이는 말(없으면 body 만) */
  fallback?: string;
  /** 대상 아래로 펼쳐지는 것(검색 후보 목록 등)의 크기 — 말풍선이 그 위를 덮지 않게 자리 계산에만 더한다(밝게 보이는 영역은 그대로) */
  avoid?: Size;
}

export const TOUR_VERSION = 1;
export const tourStorageKey = (mode: Mode) => `tour:v${TOUR_VERSION}:${mode}`;

/** 저장된 값이 '봤음'이 아니면 처음 방문으로 보고 환영 팝업을 띄운다. */
export function shouldWelcome(stored: string | null): boolean {
  return stored !== "done";
}

/** 검색창 아래로 펼쳐지는 후보 목록의 대략적인 크기(SearchBox) */
const SEARCH_DROPDOWN = { width: 400, height: 440 };

export const TOURS: Record<Mode, TourStep[]> = {
  owner: [
    { id: "mode", target: "mode", placement: "bottom", title: "나에게 맞는 모드", body: "운영 중인 가게가 있으면 '자영업자', 창업을 준비 중이면 '예비 창업자'를 고르세요. 모드에 따라 안내와 화면 구성이 달라져요." },
    { id: "search", target: "search", placement: "right", avoid: SEARCH_DROPDOWN, title: "① 내 가게 찾기", body: "내 가게 이름이나 주소를 검색하세요. 입력하는 동안 아래에 후보가 바로 뜨고, 결과를 누르면 지도가 그 위치로 가고 매장 정보가 열려요. 같은 이름의 매장이 여러 곳이면 '모두 보기'로 지도에 한꺼번에 볼 수 있어요." },
    { id: "svc", target: "svc", placement: "bottom", title: "② 내 업종 고르기", body: "업종과 세부 업종을 고르면 그 업종 기준으로 상권과 점포를 볼 수 있어요. 세부 업종은 점포 수·매장 위치에만 적용돼요." },
    { id: "metric", target: "metric", placement: "bottom", title: "③ 주변 상권과 비교", body: "지도 지표를 매출·점포 수·개업률·폐업률 등으로 바꾸면 지도의 원 크기와 색이 달라져요. 내 상권이 주변과 비교해 어느 정도인지 살펴보세요." },
    { id: "dock", target: "dock", placement: "top", title: "순위표와 범례", body: "순위표 탭에서는 지금 지표의 순위를, 범례 탭에서는 색·크기의 뜻과 업종 범위를 볼 수 있어요." },
    { id: "area", target: "area-rail", placement: "right", title: "④ 상권 종합분석", body: "지도의 원이나 순위표에서 상권을 누르면 이 패널이 열려요. 맨 위 '요약'은 확인된 사실 → 어떻게 읽을까? → 다음 확인사항 순이고, 왼쪽 메뉴로 성장성·안정·경쟁·소비 수요·입지를 넘겨 보세요.", fallback: "지도의 원이나 순위표에서 상권을 누르면 종합분석 패널이 열려요. 왼쪽 메뉴로 요약·성장성·안정·경쟁·소비 수요·입지를 넘겨 볼 수 있어요." },
    { id: "report", target: "report-button", placement: "bottom", title: "⑤ 내 가게 견주기와 리포트", body: "'내 가게' 탭에 월 매출을 기록하면 상권 평균과 견주고, 이 버튼으로 인사이트 리포트를 한 번에 뽑을 수 있어요.", fallback: "지도를 확대해 매장 점을 누르면 매장 상세가 열려요. '내 가게' 탭에 월 매출을 기록하면(이 브라우저에만 저장) 상권 평균과 견주고, '상권 인사이트 리포트 뽑기'로 한 번에 정리할 수 있어요." },
  ],
  founder: [
    { id: "mode", target: "mode", placement: "bottom", title: "나에게 맞는 모드", body: "창업을 준비 중이면 '예비 창업자', 운영 중인 가게가 있으면 '자영업자'를 고르세요. 모드에 따라 안내와 화면 구성이 달라져요." },
    { id: "search", target: "search", placement: "right", avoid: SEARCH_DROPDOWN, title: "① 관심 지역 찾기", body: "관심 있는 지역·역·상권 이름을 검색하세요. 입력하는 동안 아래에 후보가 바로 뜨고, 결과를 누르면 지도가 그 위치로 가고 요약이 열려요." },
    { id: "svc", target: "svc", placement: "bottom", title: "② 창업 업종 고르기", body: "창업하려는 업종을 고르면 그 업종 기준으로 후보 지역이 보여요." },
    { id: "metric", target: "metric", placement: "bottom", title: "③ 후보 지역 훑어보기", body: "지표를 바꿔 가며 어느 지역이 눈에 띄는지 보세요. 점포 수·폐업률·점포당 월평균 추정매출 등을 볼 수 있어요." },
    { id: "favorites", target: "favorites", placement: "bottom", title: "관심 지역 모아 두기", body: "마음에 둔 상권·행정동을 최대 10곳까지 담아 두고 다시 열거나 비교에 담을 수 있어요. 이 브라우저에만 저장돼요." },
    { id: "dock", target: "dock", placement: "top", title: "순위표로 후보 찾기", body: "순위표 탭에서 지금 지표의 순위를 확인하고, 행을 누르면 그 지역 요약이 열려요." },
    { id: "compare-add", target: "compare-add", placement: "right", title: "④ 후보 담기", body: "후보 상권·행정동의 요약 패널에서 '비교에 담기'를 눌러 최대 4곳까지 모아요.", fallback: "후보 상권·행정동을 눌러 열린 요약 패널에서 '비교에 담기'를 눌러 최대 4곳까지 모아요." },
    { id: "compare-open", target: "compare-open", placement: "top", title: "⑤ 입지 비교", body: "후보를 나란히 견줘 보세요. 매출·점포 수·개폐업·입지 요인을 한 화면에서 비교해요.", fallback: "후보를 담으면 지도 아래에 '입지 비교' 버튼이 나타나요. 눌러서 후보를 나란히 견줘 보세요." },
    { id: "cost", target: "area-rail", placement: "right", title: "⑥ 비용 점검·현장 확인", body: "왼쪽 메뉴의 '창업 비용 점검'에서 내가 넣은 비용으로 손익분기를 계산하고, '현장 확인'에서 답사 체크리스트를 채울 수 있어요. 입력은 이 브라우저에만 저장돼요.", fallback: "후보 상권·행정동을 열면 왼쪽 메뉴에 '창업 비용 점검'(내가 넣은 비용으로 손익분기 계산)과 '현장 확인'(답사 체크리스트)이 나와요. 입력은 이 브라우저에만 저장돼요." },
    { id: "report", target: "area-report-button", placement: "right", title: "⑦ 인사이트 리포트", body: "마음에 드는 후보의 요약에서 이 버튼을 누르면 매출 수준·시간대·안정성·입지를 4쪽으로 정리해 드려요. 인쇄·PDF 저장도 돼요.", fallback: "후보 상권·행정동의 요약 패널에서 '인사이트 리포트 뽑기'를 누르면 매출 수준·시간대·안정성·입지를 4쪽으로 정리해 드려요." },
  ],
};

export interface Size { width: number; height: number }
export interface Rect { left: number; top: number; width: number; height: number }
const GAP = 12;
const EDGE = 8;

/** 말풍선 자리 — 원하는 방향에 들어가지 않으면 반대쪽, 그래도 안 되면 화면 안으로 눌러 넣는다. */
export function placeTip(target: Rect, tip: Size, view: Size, want: Placement): { left: number; top: number; placement: Placement } {
  const room = {
    bottom: view.height - (target.top + target.height) - GAP - EDGE,
    top: target.top - GAP - EDGE,
    right: view.width - (target.left + target.width) - GAP - EDGE,
    left: target.left - GAP - EDGE,
  };
  const need = { top: tip.height, bottom: tip.height, left: tip.width, right: tip.width };
  const opposite: Record<Placement, Placement> = { top: "bottom", bottom: "top", left: "right", right: "left" };
  const order: Placement[] = [want, opposite[want], "bottom", "top", "right", "left"];
  const placement = order.find((p) => room[p] >= need[p]) ?? want;
  const clampX = (x: number) => Math.min(Math.max(EDGE, x), view.width - tip.width - EDGE);
  const clampY = (y: number) => Math.min(Math.max(EDGE, y), view.height - tip.height - EDGE);
  const cx = target.left + target.width / 2 - tip.width / 2;
  const cy = target.top + target.height / 2 - tip.height / 2;
  switch (placement) {
    case "bottom": return { left: clampX(cx), top: clampY(target.top + target.height + GAP), placement };
    case "top": return { left: clampX(cx), top: clampY(target.top - GAP - tip.height), placement };
    case "right": return { left: clampX(target.left + target.width + GAP), top: clampY(cy), placement };
    default: return { left: clampX(target.left - GAP - tip.width), top: clampY(cy), placement };
  }
}
