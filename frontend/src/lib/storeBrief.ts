// 매장 상세 '이 매장' 맨 위의 핵심 요약(3단) — ① 확인된 사실 ② 어떻게 읽을까? ③ 다음 확인사항(기본 1 + 보조 2).
//  · 자영업자: 이 브라우저에 있는 내 기록(월 매출 개수·비용 입력 여부)과 소속 상권 → 내 가게 점검·주변·상권으로 이어진다.
//  · 예비 창업자: 내 가게 기록은 쓰지 않는다. 인허가 기준 영업 상태·업력과 소속 상권 → 주변 입지·경쟁·소속 상권으로 이어진다.
// 새 통계·점수는 만들지 않는다. 기록·자료가 없는 것은 0이 아니라 '기록 없음'·'확인 불가'로 말한다. 리포트는 각 묶음 맨 아래의 기존 버튼으로 간다.
// 다른 모듈을 import 하지 않는 순수 함수(tests/storeBrief.test.ts).

export type StoreBriefTarget = "mine" | "radius" | "compete" | "area";

export interface StoreBriefInput {
  mode: "owner" | "founder";
  /** 기록한 월 매출 개수(자영업자만 쓴다) */
  monthsRecorded: number;
  /** 가장 최근 기록 월 'YYYY-MM' (없으면 null) */
  lastMonth: string | null;
  /** 입력한 비용 칸 수(임대료·인건비·기타 고정비·원가율·수수료율 중) */
  costsFilled: number;
  /** 인허가 기준 영업 상태 문구·업력 문구(예비 창업자용, 없으면 null) */
  statusLabel: string | null;
  ageLabel: string | null;
  /** 소속 상권 이름(서울시 지정 상권 밖이면 null) */
  trdarName: string | null;
  dongName: string;
}

export interface StoreBrief {
  eyebrow: string;
  facts: { label: string; value: string; note: string }[];
  reading: string[];
  /** 첫 항목이 기본 행동, 나머지는 보조 행동 */
  next: { target: StoreBriefTarget; label: string; why: string }[];
}

const COST_TOTAL = 5;

export function buildStoreBrief(inp: StoreBriefInput): StoreBrief {
  const area = { label: "소속 상권", value: inp.trdarName ?? `${inp.dongName} (행정동 기준)`, note: inp.trdarName ? "서울시 지정 상권" : "서울시 지정 상권 밖(행정동으로 봄)" };
  if (inp.mode === "founder") {
    const known = inp.statusLabel !== null;
    return {
      eyebrow: "예비 창업자 · 이 매장 핵심 요약",
      facts: [
        { label: "영업 상태(인허가 기준)", value: inp.statusLabel ?? "확인 불가", note: known ? "현장 영업 확인은 아님" : "인허가 자료로 확인 안 됨" },
        { label: "업력", value: inp.ageLabel ?? "자료 없음", note: "인허가일 기준" },
        area,
      ],
      reading: [
        known ? `인허가 기록상 '${inp.statusLabel}'입니다. 현장에서 실제로 영업 중인지는 확인되지 않았습니다.` : "인허가 자료로 영업 여부를 확인하지 못했습니다(영업하지 않는다는 뜻은 아닙니다).",
        "이 매장 하나의 기록입니다. 입지는 '주변 환경', 경쟁은 '경쟁', 상권 흐름은 '상권'에서 따로 확인하세요.",
      ],
      next: [
        { target: "radius", label: "주변 환경 확인", why: "반경 안 교통·집객시설·근처 브랜드" },
        { target: "compete", label: "경쟁 가게 확인", why: "반경 안 같은 업종 가게와 개업·폐업" },
        { target: "area", label: "소속 상권 종합분석 보기", why: "상권 흐름·경쟁 변화" },
      ],
    };
  }
  const has = inp.monthsRecorded > 0;
  const reading: string[] = [];
  if (!has) reading.push("아직 기록이 없어 상권 평균과 견줄 수 없습니다(0원이라는 뜻이 아닙니다). 주변 경쟁과 상권 변화부터 보고, 매출 기록은 원할 때 남기세요.");
  else {
    reading.push(`가장 최근 기록(${inp.lastMonth})을 기준으로 같은 업종 상권 평균과 금액이 아닌 변화율로 견줍니다.`);
    if (inp.costsFilled === 0) reading.push("비용을 입력하지 않아 손익분기는 아직 계산하지 않았습니다.");
  }
  return {
    eyebrow: "자영업자 · 내 매장 핵심 점검",
    facts: [
      { label: "내 매출 기록", value: has ? `${inp.monthsRecorded}개월` : "기록 없음", note: has ? `최근 ${inp.lastMonth}` : "아직 입력 전(0원이 아님)" },
      { label: "비용 입력", value: inp.costsFilled > 0 ? `${inp.costsFilled}/${COST_TOTAL}칸` : "입력 없음", note: inp.costsFilled > 0 ? "손익분기 계산에 사용" : "넣으면 손익분기를 계산" },
      area,
    ],
    reading,
    // 기록이 있으면 내 숫자(기록·손익분기)부터, 없으면 경쟁 환경·상권 변화부터 — 매출 입력은 선택으로 안내한다
    next: has
      ? [
          { target: "mine", label: "내 가게 점검·손익분기 보기", why: "이전 기록과 상권 변화율 견주기" },
          { target: "compete", label: "경쟁 가게 확인", why: "가까운 같은 업종 가게와 영업 상태" },
          { target: "area", label: "상권 흐름·시간대 수요 보기", why: "소속 상권·행정동 종합분석" },
        ]
      : [
          { target: "compete", label: "경쟁 가게 확인", why: "가까운 같은 업종 가게와 영업 상태" },
          { target: "area", label: "상권 흐름·시간대 수요 보기", why: "소속 상권·행정동 종합분석" },
          { target: "mine", label: "매출·비용 기록하기(선택)", why: "상권 평균과 변화율로 견줘 보기" },
        ],
  };
}
