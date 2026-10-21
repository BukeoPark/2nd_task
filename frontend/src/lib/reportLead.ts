// 보고서 맨 위 '이 보고서에서 볼 수 있는 것' — 모드마다 사용자가 알고 싶은 순서로 보고서 안의 어느 쪽에 답이 있는지 안내한다.
//  · 자영업자(내 매장 점검): 내 매장 주변 경쟁 · 상권 변화 · 고객(시간대) 수요 · 이번 달 확인사항
//  · 예비 창업자(후보 입지 검토): 후보지 매출 흐름 · 경쟁 · 입지 · 비용 검토 · 현장 확인사항
// 새 분석을 만들지 않는다 — 보고서가 실제로 가진 쪽만 쪽 번호로 가리키고, 없으면 '이 보고서에는 없음'이라고 말하며, 보고서 밖(앱의 비용 점검)은 '앱에서'라고 밝힌다.
// 지역 보고서(상권·행정동 전체)와 매장 보고서(매장 한 곳 기준, 자영업자용만 있다)를 구분한다. 다른 모듈을 import 하지 않는 순수 함수(tests/reportLead.test.ts).

export type ReportScope = "area" | "store";
export type LeadMode = "owner" | "founder";

/** 보고서 쪽 번호(없으면 그 쪽이 이 보고서에 없다는 뜻). */
export interface LeadPages {
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
const app = (title: string, where: string): LeadRow => ({ title, where, kind: "app" });

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
      app("비용 검토", "앱의 '창업 비용 점검'에서(내가 넣은 값으로 계산)"),
      page("현장 확인사항", p.checklist),
    ],
  };
}
