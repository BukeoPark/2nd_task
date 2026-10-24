// 종합 정리의 인사이트 — 여러 쪽의 사실을 묶어 '숫자가 들어간 결론 한 줄(검은 제목) + 근거·확인할 일(회색 글)'로 쓴다
// (최대 6개, 순서: 가장 두드러지는 특징 · 매출 · 수요 · 유동인구 · 업종 · 영업 기간).
// 제목은 다른 쪽의 검은 제목(lib/reportPageTitles)과 같은 방식으로 쓴다: 주어 + 숫자 + '~입니다·합니다' 한 문장, 해석 단어만 얹는다.
// 같은 문장이 쪽 제목·카드에 반복되지 않도록, 각 쪽의 사실 하나가 아니라 둘 이상을 합친 해석만 쓴다.
// 원인·전망·성공 가능성은 단정하지 않고 '확인할 일'로 끝낸다. 점수·순위는 만들지 않는다. 값이 없는 인사이트는 만들지 않는다.
// 다른 모듈은 타입만 import 하는 순수 함수(tests/summaryInsights.test.ts).
import type { AreaCharacter, FoodUnitStoresResponse, ReportDetail, ReportExtras } from "./apiClient";
import type { AreaReport } from "./areaReport";

/** detail 이 빈 문자열이면 회색 글을 쓰지 않는다(특징은 제목만). */
export interface Insight { key: "feature" | "sales" | "demand" | "flpop" | "industry" | "survival"; title: string; detail: string }

const HIGH = 1.25;   // lib/interpretRules 와 같은 '눈에 띄게 높다' 기준(그 역수 0.8 이하는 낮다)
const LOW = 1 / HIGH;
const TREND = 3;     // 총매출 전년 동기 증감이 ±3% 이상이면 늘고·줄고 있다고 본다
const FOCUS = 1.25;  // 폐업률이 비교 중앙값의 1.25배 이상이면 '많다'
const SKEW = 40;     // 한 세부 업종이 이 비율(%) 이상이면 쏠림
const sign = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
const r0 = (n: number) => Math.round(n);
const iga = (name: string) => { const c = name.charCodeAt(name.length - 1) - 0xac00; return c >= 0 && c <= 11171 && c % 28 !== 0 ? "이" : "가"; };

function salesInsight(lv: AreaReport["level"]): Insight | null {
  if (!lv) return null;
  if (lv.sampleStatus === "too_few") return { key: "sales", title: `비교에 쓴 점포가 ${lv.sampleStores ?? "?"}곳뿐이라 매출 비교는 참고용입니다`, detail: "현장에서 직접 확인해 보세요." };
  const level = lv.ratio >= HIGH ? "high" : lv.ratio <= LOW ? "low" : "mid";
  const y = lv.yoyTotal;
  const dir = y == null ? null : y >= TREND ? "up" : y <= -TREND ? "down" : "flat";
  const ratio = `점포당 매출은 중앙값의 ${lv.ratio.toFixed(1)}배`;
  if (y == null) return { key: "sales", title: `${ratio}${level === "high" ? "로 높습니다" : level === "low" ? "로 낮습니다" : "입니다"}`, detail: "내 매출 목표와 견줘 보세요." };
  const conj = level === "high" ? (dir === "down" ? "로 높지만" : "로 높고") : level === "low" ? (dir === "up" ? "로 낮지만" : "로 낮고") : "이고";
  const flpop = dir === "down" && lv.flpopYoy != null && lv.flpopYoy < 0 ? `유동인구 지수도 ${sign(lv.flpopYoy)}입니다. ` : "";
  const check = dir === "down" ? "줄어든 이유를 현장에서 확인해 보세요." : dir === "up" ? "늘어난 이유를 현장에서 확인해 보세요." : "내 매출 목표와 견줘 보세요.";
  return { key: "sales", title: `${ratio}${conj} 총매출은 전년 동기 ${sign(y)}입니다`, detail: `${flpop}${check}` };
}

function demandInsight(character?: AreaCharacter | null, detail?: ReportDetail): Insight | null {
  const w = character?.sections.demand.worker_share_pct ?? null;
  const weekend = detail?.composition["요일"]?.find((x) => x.label === "주말")?.pct ?? null;
  if (w === null && weekend === null) return null;
  const type = w === null ? null : w >= 60 ? "business" : w <= 30 ? "residential" : "mixed";
  const title = type === "business" ? `직장인구 ${r0(w!)}%로 평일 직장인 수요가 중심입니다` : type === "residential" ? `상주인구 ${r0(100 - w!)}%로 주민 수요가 중심입니다`
    : type === "mixed" ? `직장인구 ${r0(w!)}%로 직장인과 주민 수요가 섞여 있습니다`
    : weekend! < 20 ? `평일이 ${r0(100 - weekend!)}%로 평일 손님이 대부분입니다` : weekend! >= 40 ? `주말이 ${r0(weekend!)}%로 주말 손님 비중이 높습니다` : `평일 ${r0(100 - weekend!)}% · 주말 ${r0(weekend!)}%로 고르게 있습니다`;
  const split = w !== null && weekend !== null ? `평일 ${r0(100 - weekend)}% · 주말 ${r0(weekend)}%입니다. ` : "";
  const check = type === "business" ? "저녁·주말에 기대는 메뉴는 불리할 수 있습니다." : type === "residential" ? "저녁·주말 방문 흐름을 확인해 보세요." : "시간대별 손님 흐름을 현장에서 확인해 보세요.";
  return { key: "demand", title, detail: `${split}${check}` };
}

/** 유동인구와 매출이 몰리는 시간대를 견준다 — 지나는 사람이 많은 때와 매출이 나는 때가 같은지. */
function flpopInsight(sl: AreaReport["slots"], flpopYoy: number | null | undefined, salesAlreadyUsedFlpop: boolean): Insight | null {
  const rows = sl?.rows ?? [];
  const f = rows.filter((x) => x.flpop != null);
  if (!rows.length || !f.length) return null;
  const peakF = f.reduce((a, b) => (a.flpop! >= b.flpop! ? a : b));
  const peakS = rows.reduce((a, b) => (a.sales >= b.sales ? a : b));
  const trend = flpopYoy != null && Math.abs(flpopYoy) >= 5 && !salesAlreadyUsedFlpop ? `유동인구 지수는 전년 동기 ${sign(flpopYoy)}입니다. ` : "";
  return peakF.label === peakS.label
    ? { key: "flpop", title: `유동인구와 매출이 모두 ${peakS.label}에 가장 몰립니다`, detail: `유동인구 ${r0(peakF.flpop!)}% · 매출 ${r0(peakS.sales)}%입니다. ${trend}이 시간대 영업 준비를 먼저 확인해 보세요.` }
    : { key: "flpop", title: `유동인구는 ${peakF.label}에, 매출은 ${peakS.label}에 가장 몰립니다`, detail: `유동인구 ${r0(peakF.flpop!)}% · 매출 ${r0(peakS.sales)}%입니다. ${trend}지나는 사람이 손님이 되는지 확인해 보세요.` };
}

/** 업종 — 세부 업종 쏠림, 아니면 점포가 가장 많은 업종과 점포당 매출이 가장 높은 업종을 견준다(외식 업종별 비교표 기준). */
function industryInsight(stores?: FoodUnitStoresResponse, extras?: ReportExtras): Insight | null {
  const mix = stores && stores.total >= 20 ? stores.category_mix[0] : undefined;
  if (mix && mix.share_pct >= SKEW) return { key: "industry", title: `${mix.name}${iga(mix.name)} 점포의 ${r0(mix.share_pct)}%로 경쟁이 한 업종에 쏠려 있습니다`, detail: "같은 업종이라면 차별점부터 정해 보세요." };
  const rows = extras?.industry?.status === "ok" ? extras.industry.rows.filter((x) => x.stores != null && x.stores >= 10 && x.per_store_month != null) : [];
  if (rows.length >= 2) {
    const byStores = rows.reduce((a, b) => (a.stores! >= b.stores! ? a : b));
    const bySales = rows.reduce((a, b) => (a.per_store_month! >= b.per_store_month! ? a : b));
    const man = (won: number) => (won >= 1e8 ? `${(won / 1e8).toFixed(1)}억원` : `${r0(won / 1e4).toLocaleString("ko-KR")}만원`);
    return byStores.svc_cd === bySales.svc_cd
      ? { key: "industry", title: `${bySales.svc_nm}${iga(bySales.svc_nm)} 점포 수(${r0(bySales.stores!)}곳)·점포당 매출(${man(bySales.per_store_month!)}) 모두 1위입니다`, detail: "업종마다 객단가·하루 결제 건수가 다릅니다." }
      : { key: "industry", title: `점포 수 1위는 ${byStores.svc_nm}(${r0(byStores.stores!)}곳), 점포당 매출 1위는 ${bySales.svc_nm}(${man(bySales.per_store_month!)})입니다`, detail: "업종마다 객단가·하루 결제 건수가 다릅니다." };
  }
  return mix ? { key: "industry", title: `세부 업종 1위는 ${mix.name}(${r0(mix.share_pct)}%)입니다`, detail: "직접 경쟁할 가게의 메뉴·가격을 비교해 보세요." } : null;
}

function survivalInsight(extras?: ReportExtras, st?: AreaReport["stability"]): Insight | null {
  const l = extras?.license;
  if (!l || l.status !== "ok" || l.cohort?.status !== "ok" || l.cohort.rate == null) return null;
  const median = l.active?.enough ? l.active.median_years : null;
  const c = st?.churn;
  const close = c?.closeRate != null ? c.closeRate * 100 : null, med = c?.medClose != null ? c.medClose * 100 : null;
  const manyClosures = close !== null && med !== null && med > 0 && close >= med * FOCUS;
  const facts = [median != null ? `영업 중 가게 업력 중앙값은 ${median.toFixed(1)}년입니다.` : null, manyClosures ? `분기 폐업률은 ${close!.toFixed(1)}%(중앙값 ${med!.toFixed(1)}%)입니다.` : null].filter(Boolean) as string[];
  return { key: "survival", title: `인허가 후 ${l.cohort.horizon_years}년 안에 가게 10곳 중 ${r0(l.cohort.rate * 10)}곳이 폐업했습니다`,
    detail: `${facts.length ? facts.join(" ") : `인허가 ${l.cohort.denominator.toLocaleString("ko-KR")}건 기준입니다.`} ${manyClosures ? "최근 폐업한 가게의 사정을 확인해 보세요." : "오래 버틴 가게의 공통점을 확인해 보세요."}` };
}

const TRAIT_NAME: Record<string, string> = { business: "업무 중심", residential: "주거 중심", transit: "교통 거점", commercial: "상업 집중" };
const TRAIT_ORDER = ["business", "residential", "transit", "commercial"];

/** 가장 두드러지는 특징 — 상권 유형(업무·주거·교통 거점·상업 집중, 최대 둘)을 제목 한 줄로만 쓴다(요약 글 없음). */
function featureInsight(character?: AreaCharacter | null): Insight | null {
  const t = character?.type;
  if (!t || t.kind === "hold") return null;
  const keys = TRAIT_ORDER.filter((k) => t.traits.some((x) => x.key === k));
  return { key: "feature", title: keys.length ? `${keys.slice(0, 2).map((k) => TRAIT_NAME[k]).join("·")} 상권으로 분류됩니다` : "직장인과 주민이 섞인 상권으로 분류됩니다", detail: "" };
}

export function summaryInsights(i: { report: AreaReport; character?: AreaCharacter | null; detail?: ReportDetail; stores?: FoodUnitStoresResponse; extras?: ReportExtras }): Insight[] {
  const sales = salesInsight(i.report.level);
  const salesUsedFlpop = !!sales && /유동인구/.test(sales.detail);
  return [featureInsight(i.character), sales, demandInsight(i.character, i.detail), flpopInsight(i.report.slots, i.report.level?.flpopYoy, salesUsedFlpop),
    industryInsight(i.stores, i.extras), survivalInsight(i.extras, i.report.stability)].filter((x): x is Insight => x !== null);
}
