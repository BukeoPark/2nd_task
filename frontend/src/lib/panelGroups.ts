// 매장 상세 패널의 블록이 어느 묶음(레일 메뉴)에 속하고 어떤 순서로 보이는지.
// 묶음은 lib/scope 의 네 범위와 같다: store(이 매장) / radius(주변) / area(상권) / mine(내 가게).
// 블록을 더하거나 옮길 때는 여기만 고치고, 테스트가 '모든 블록이 정확히 한 묶음에 있는지'를 지킨다.
// 다른 모듈을 import 하지 않는 순수 데이터(tests/panelGroups.test.ts).

export type GroupId = "store" | "radius" | "area" | "mine";

export type BlockId =
  | "basic" // 주소·영업 상태·업력·외부 링크
  | "google"
  | "history"
  | "competitors" // 반경 안 같은 업종 가게 목록(거리순·세부 업종별) → 지도 위치 → 운영이력·상세
  | "competition" // ⑤ 반경 동일 업종 인허가 개폐업
  | "radius" // 반경 입지 지표 — ① 상업·경쟁 ② 주요 집객시설 ③ 교통 접근성 ④ 교통 이용 수요(반경 토글은 여기)
  | "radius-basis" // ⑥ 분석 기준 자세히 보기(접힘)
  | "area-links" // 소속 행정동·상권 분석으로 이동
  | "area-model" // 상권 수요 유형·입지 요인
  | "area-extra" // 프랜차이즈 참고
  | "checkup" // 내 가게 점검(월 매출 기록·손익분기) — 내 매출 입력은 여기서만 받는다
  | "benchmark" // 내 매출 비교 — 기록한 가장 최근 달의 값을 읽는다
  | "improvement"; // 운영 점검(상권 비교 기반 점검 항목) — 입력 매출과 무관한 점검은 그대로, 내 매출 비교 한 줄만 입력값을 읽는다

export const GROUP_IDS: GroupId[] = ["store", "radius", "area", "mine"];

export const BLOCKS: { id: BlockId; group: GroupId }[] = [
  { id: "basic", group: "store" },
  { id: "google", group: "store" },
  { id: "history", group: "store" },
  { id: "radius", group: "radius" },
  { id: "competitors", group: "radius" },
  { id: "competition", group: "radius" },
  { id: "radius-basis", group: "radius" },
  { id: "area-links", group: "area" },
  { id: "area-model", group: "area" },
  { id: "area-extra", group: "area" },
  { id: "checkup", group: "mine" },
  { id: "benchmark", group: "mine" },
  { id: "improvement", group: "mine" },
];

export function blocksOf(group: GroupId): BlockId[] {
  return BLOCKS.filter((b) => b.group === group).map((b) => b.id);
}
