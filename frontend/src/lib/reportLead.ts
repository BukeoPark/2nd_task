// 보고서 맨 위 '이 보고서에서 볼 수 있는 것' — 모드마다 사용자가 알고 싶은 순서로 보고서 안의 어느 쪽에 답이 있는지 안내한다.
//  · 자영업자(내 매장 점검): 내 매장 주변 경쟁 · 상권 변화 · 고객(시간대) 수요 · 이번 달 확인사항
//  · 예비 창업자(후보 입지 검토): 후보지 매출 흐름 · 경쟁 · 입지 · 현장 확인사항
// 새 분석을 만들지 않는다 — 보고서가 실제로 가진 쪽만 쪽 번호로 가리키고, 없으면 '이 보고서에는 없음'이라고 말하며, 보고서 밖(앱의 비용 점검)은 '앱에서'라고 밝힌다.
// 지역 보고서(상권·행정동 전체)와 매장 보고서(매장 한 곳 기준, 자영업자용만 있다)를 구분한다. 다른 모듈을 import 하지 않는 순수 함수(tests/reportLead.test.ts).

export type ReportScope = "area" | "store";
export type LeadMode = "owner" | "founder";

/** 보고서 쪽 번호(없으면 그 쪽이 이 보고서에 없다는 뜻). */
export interface LeadPages {
  summary?: number;
  tips?: number;
  /** 매출 수준·흐름(상권 변화·후보지 매출 흐름) */
  level?: number;
  /** 시간대·수요 */
  slots?: number;
  /** 안정성·경쟁·입지(지역 보고서) / 경쟁·폐업(매장 보고서) */
  competition?: number;
  /** 입지 요인(지역 보고서는 같은 쪽의 입지 부분) */
  location?: number;
  /** 확인할 일(마지막 쪽) */
  checklist?: number;
}

export interface LeadRow {
  title: string;
  /** '2쪽' / '앱에서 이어서' / '이 보고서에는 없음' */
  where: string;
  kind: "page" | "app" | "missing";
}

export interface Lead {
  heading: string;
  scopeNote: string;
  rows: LeadRow[];
}

const page = (title: string, n: number | undefined): LeadRow => (n ? { title, where: `${n}쪽`, kind: "page" } : { title, where: "이 보고서에는 없음(자료 없음)", kind: "missing" });

export function reportLead(mode: LeadMode, scope: ReportScope, p: LeadPages): Lead {
  const scopeNote = scope === "area"
    ? "지역 보고서 — 이 상권·행정동 전체(같은 업종) 기준이에요. 한 가게의 보고서가 아니에요."
    : "매장 보고서 — 이 매장과 반경 500m 안 같은 업종 기준이에요(자영업자용).";
  if (mode === "owner") {
    return {
      heading: "내 매장 점검 — 이 보고서에서 볼 수 있는 것",
      scopeNote,
      rows: [
        page(scope === "area" ? "내 매장 주변 경쟁(개폐업·프랜차이즈)" : "내 매장 주변 경쟁(개폐업)", p.competition),
        page("상권 변화(매출 흐름)", p.level),
        page("고객 수요(시간대·연령)", p.slots),
        page("이번 달 확인사항", p.checklist),
        ...(p.summary ? [page("종합 정리", p.summary)] : []),
        ...(p.tips ? [page("실전 팁", p.tips)] : []),
      ],
    };
  }
  return {
    heading: "후보 입지 검토 — 이 보고서에서 볼 수 있는 것",
    scopeNote,
    rows: [
      page("후보지 매출 흐름", p.level),
      page("경쟁(개폐업·프랜차이즈)", p.competition),
      page("입지(교통·임대료 참고값)", p.location),
      page("현장 확인사항", p.checklist),
      ...(p.summary ? [page("종합 정리", p.summary)] : []),
        ...(p.tips ? [page("실전 팁", p.tips)] : []),
    ],
  };
}


/** 지역 보고서의 실제 대분류·페이지 순서를 그대로 안내한다. 통합된 전략·확인 목록은 중복 안내하지 않는다. */
export function areaReportLead(p: {signals?:number;level?:number;slots?:number;demand?:number;industries?:number;competitors?:number;stability?:number;location?:number;summary?:number;basis?:number}):Lead {
  const entries:[string,number|undefined][]=[
    ["상권 변화 신호",p.signals],["매출 흐름",p.level],["시간대별 수요",p.slots],
    ["소비 고객",p.demand],["업종 비교",p.industries],["주변 경쟁점",p.competitors],
    ["점포 변화·업력",p.stability],["입지·주변 시설",p.location],["종합·창업전략",p.summary],["자료·계산 기준",p.basis],
  ];
  return {heading:"보고서 길잡이",scopeNote:"상권·행정동 기준 보고서",rows:entries.filter(([,n])=>n!==undefined&&n>0).sort((a,b)=>a[1]!-b[1]!).map(([title,n])=>page(title,n))};
}
