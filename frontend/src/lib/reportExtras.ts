// 보고서 '업종별 비교'·'영업 기간·생존' 쪽의 표시 문구 — 서버가 준 값을 문장·표 칸으로 옮긴다. 판단·점수·순위는 만들지 않고,
// 값이 없으면 0이 아니라 '자료 없음'이라고 쓴다. 다른 모듈은 타입만 import 하는 순수 함수(tests/reportExtras.test.ts).
import type { ReportExtras } from "./apiClient";

export const NO_DATA = "자료 없음";
const num = (n: number) => Math.round(n).toLocaleString("ko-KR");

export const countText = (n: number | null) => (n === null ? NO_DATA : `${num(n)}곳`);
export const manwonText = (won: number | null) => (won === null ? NO_DATA : `${num(won / 1e4)}만원`);
export const wonText = (won: number | null) => (won === null ? NO_DATA : `${num(won)}원`);
export const txText = (n: number | null) => (n === null ? NO_DATA : `${n.toFixed(1)}건`);
export const pctText = (n: number | null) => (n === null ? NO_DATA : `${n.toFixed(n % 1 === 0 ? 0 : 1)}%`);
export const yearsText = (n: number | null) => (n === null ? NO_DATA : `${n.toFixed(1)}년`);

/** 개월 → '130개월(약 10.8년)'. */
export const monthsText = (m: number | null) => (m === null ? NO_DATA : `${num(m)}개월(약 ${(m / 12).toFixed(1)}년)`);

export interface IndustryLine { svc: string; selected: boolean; stores: string; perStore: string; ticket: string; daily: string; close: string; note: string | null }

export function industryLines(ind: ReportExtras["industry"]): IndustryLine[] {
  return ind.rows.map((r) => ({ svc: r.svc_nm, selected: r.selected, stores: countText(r.stores), perStore: manwonText(r.per_store_month), ticket: wonText(r.ticket),
    daily: txText(r.daily_tx_per_store), close: pctText(r.close_rate), note: r.note }));
}

/** 변화지표의 영업 개월을 서울시 평균과 견주는 문장(좋고 나쁨은 말하지 않는다). */
function monthsGap(label: string, mine: number | null, seoul: number | null): string | null {
  if (mine === null || seoul === null) return null;
  const d = Math.round(mine - seoul);
  return `${label} 평균 영업 ${monthsText(mine)}으로 서울시 평균(${num(seoul)}개월)보다 ${d === 0 ? "같은 수준" : `${Math.abs(d)}개월 ${d > 0 ? "깁니다" : "짧습니다"}`}`;
}

/** 꿀팁 — 영업 기간 쪽. 자료가 있는 것만 말하고, 원인·전망·성공 가능성은 말하지 않는다. */
export function survivalTake(x: ReportExtras): string {
  const parts: string[] = [];
  const ci = x.change_index;
  if (ci) {
    const gap = monthsGap("폐업한 점포는", ci.close_months, ci.seoul_close_months);
    if (gap) parts.push(`${ci.scope === "소속 행정동" ? `소속 행정동(${ci.dong_name}) 기준으로 ` : ""}${gap}.`);
  }
  const lic = x.license;
  if (lic.status === "ok" && lic.cohort?.status === "ok" && lic.cohort.rate !== null) {
    parts.push(`${lic.scope_label} 인허가 중 ${lic.cohort.horizon_years}년 안에 폐업한 비율은 ${Math.round(lic.cohort.rate * 100)}%입니다.`);
  }
  if (parts.length === 0) return "이 지역은 영업 기간·생존을 말할 자료가 부족합니다. 현장에서 오래된 가게와 최근 바뀐 가게를 직접 확인해 보세요.";
  return `${parts.join(" ")} 과거 통계이며 내 가게의 폐업 가능성이 아닙니다. 오래 버틴 가게의 공통점(메뉴·가격·영업시간)과 최근 문을 닫은 가게의 사정을 현장에서 확인해 보세요.`;
}

/** 꿀팁 — 업종별 비교 쪽. */
export function industryTake(x: ReportExtras): string {
  const sel = x.industry.rows.find((r) => r.selected);
  const lead = sel ? `보고서의 기준 업종(${sel.svc_nm})${sel.per_store_month !== null ? "과" : ""} 다른 업종을 같은 분기·같은 지역에서 견줘 보세요. ` : "";
  return `${lead}점포당 매출이 비슷해도 객단가와 하루 결제 건수가 달라 필요한 판매 방식이 다릅니다. 이 표는 추천 순위가 아니고, 점포 수가 적은 업종은 값이 크게 흔들릴 수 있습니다.`;
}

/** 쪽에서 자료 없음 사유를 한 줄로 — 서버 사유가 있으면 그것을, 없으면 일반 문구를. */
export function licenseNotice(x: ReportExtras["license"]): string | null {
  if (x.status !== "ok") return x.message ?? "이 업종·지역은 인허가 이력으로 영업 기간을 계산할 수 없습니다.";
  if (x.closures_available === false) return x.message ?? "이 업종의 인허가 원천은 폐업일자를 제공하지 않습니다.";
  return null;
}
