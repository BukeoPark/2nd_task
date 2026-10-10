// 매장 상세 화면의 어려운 말 풀이. 문구는 서버·계산 모듈이 실제로 쓰는 정의와 같게 유지한다
// (backend/app/services/sales_benchmark.py·store_churn.py·unit_metrics.py, lib/breakeven.ts).
// 다른 모듈을 import 하지 않는 순수 데이터(tests/glossary.test.ts).

export const GLOSSARY = {
  perStoreMonth: {
    term: "점포당 월평균 추정매출",
    help: "서울시가 카드 결제 등으로 추정한 분기 매출을 같은 업종 점포 수로 나누고 3개월로 나눈 값이에요. 개별 매장의 실제 매출이 아니고, 매출이 큰 매장이 평균을 끌어올릴 수 있어요.",
  },
  peerMedian: {
    term: "중앙값",
    help: "비교 대상들을 값 순서대로 세웠을 때 한가운데 값이에요. 아주 큰 값 하나에 휘둘리는 평균보다 '보통'을 보기 좋아요.",
  },
  churnOpen: {
    term: "연 개업률",
    help: "최근 4개 분기 개업 점포 수의 합 ÷ 같은 기간 평균 점포 수예요. 업종 변경이나 이전도 개업으로 잡힐 수 있어요.",
  },
  churnClose: {
    term: "연 폐업률",
    help: "최근 4개 분기 폐업 점포 수의 합 ÷ 같은 기간 평균 점포 수예요. 업종 변경이나 이전도 폐업으로 잡힐 수 있어요.",
  },
  floatingIndex: {
    term: "유동인구(상대 지수)",
    help: "서울시·KT 생활인구를 길 단위로 나눠 놓은 추정치예요. 실제 지나간 사람 수가 아니라 동네끼리 견주는 상대 값이에요.",
  },
  floatingPerTenK: {
    term: "유동인구 1만 명당 분기 매출",
    help: "분기 매출 ÷ 유동인구 × 10,000이에요. 사람이 많은 길에서 매출이 얼마나 나오는지 동네끼리 견주는 값이고, 구매 전환율은 아니에요. 오피스 상권은 높게 나올 수 있어요.",
  },
  hinterland: {
    term: "직장·상주인구, 집객시설",
    help: "서울시 상권분석서비스가 상권 영역 안에서 센 값이에요. 영역 밖 배후지는 포함하지 않아요.",
  },
  breakeven: {
    term: "손익분기 월 매출",
    help: "이 매출보다 낮으면 적자, 높으면 흑자가 되는 월 매출이에요. 월 고정비 ÷ (1 − 재료비율 − 수수료율)로 계산해요.",
  },
  safetyMargin: {
    term: "안전마진",
    help: "(매출 − 손익분기) ÷ 매출이에요. 매출이 이만큼 줄어도 적자가 아닌 정도이고, 음수면 이미 손익분기 아래예요.",
  },
} as const;

export type GlossaryKey = keyof typeof GLOSSARY;
