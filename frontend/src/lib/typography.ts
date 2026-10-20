// 글자 크기 기준(px) — 중요도에 따라 차등을 둔다. 모든 글자를 키우지 않고 '화면 제목 > 핵심 숫자 > 카드 제목 > 본문 > 메뉴·버튼 > 경고 > 보조 설명' 순으로 읽히게 한다.
// 입력칸은 16px 이상이어야 휴대폰이 확대하지 않으므로 INPUT 을 따로 둔다. 공통 컴포넌트(Drawer·Notice·Section·RailHeading 등)가 이 값을 쓰고,
// 개별 화면의 글자 크기도 같은 단계에서 고른다(tests/typography.test.ts 가 단계 순서와 최소 크기를 지킨다). 다른 모듈을 import 하지 않는다.
export const FS = {
  /** 화면(패널·작업 화면) 제목 22~24 */
  screenTitle: 22,
  /** 핵심 숫자 24~28 */
  metric: 26,
  /** 카드·섹션 제목 16~18 */
  cardTitle: 17,
  /** 본문 15~16 */
  body: 15,
  /** 메뉴·버튼 14~16 */
  ui: 14.5,
  /** 주요 경고 13~14 */
  warn: 13.5,
  /** 보조 설명(출처·기준·부연) 12~13 */
  caption: 12.5,
  /** 입력칸 */
  input: 16,
} as const;

export type FsKey = keyof typeof FS;

/** 버튼 최소 높이(px) — 손가락으로 누르기 편한 크기 */
export const BTN_MIN_HEIGHT = 38;
