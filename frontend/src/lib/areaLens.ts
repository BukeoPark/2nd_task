// 상권·행정동 인사이트 리포트의 '관점' — 읽는 사람에 따라 같은 자료를 다르게 짚는다.
//  · 자영업자: 이미 운영 중이라 '매출을 더 올릴 기회'를 찾는다(비는 시간대, 유동 대비 매출, 차별화, 내 가게와 견주기).
//  · 예비 창업자: 아직 시작 전이라 '들어가도 괜찮은지'를 본다(긍정 신호·주의 신호를 값 그대로 나열하고 확인할 것을 짚는다).
// 두 관점 모두 점수·'창업 적합도'·성공 확률을 만들지 않는다. 신호는 비교 지역 중앙값·전년 동기 같은 정해진 기준을 넘는 사실만 적고, 개수로 합치지 않는다.
// 숫자 입력은 areaReport 가 계산한 섹션을 그대로 받는다(타입만 가져오는 순수 함수, tests/areaLens.test.ts).
import type { AreaLocation, AreaSlots, AreaStability } from "./areaReport";
import type { LevelSection } from "./insightReport";
import type { Mode } from "./mode";

export interface Signal { title: string; body: string }

export interface LensContext {
  unitWord: string;
  level: LevelSection | null;
  slots: AreaSlots | null;
  stability: AreaStability | null;
  location: AreaLocation | null;
  workers: number | null;
  /** 상권 유형 판정이 쓰는 수요 구조(직장인구 비중·업무형 여부·판정 가능 여부) — 인구 절대 수가 아니라 같은 기준의 비중으로 '직장인구가 많은지'를 말한다 */
  demand?: { type: string | null; sharePct: number | null; workers: number | null; baseOk: boolean } | null;
  /** 표본 점포 수와 상태(10곳 미만 제외·10~19곳 주의) — 없으면 판단하지 않는다 */
  sample?: { stores: number | null; status: "ok" | "caution" | "too_few" | "unknown" };
}

export interface Lens {
  mode: Mode;
  eyebrow: string;
  pageTitle: string;
  signalsTitle: string;
  positiveTitle: string;
  cautionTitle: string;
  positive: Signal[];
  caution: Signal[];
  /** 신호를 어떻게 골랐는지 한 줄(점수가 아님을 밝힌다) */
  ruleNote: string;
  /** 신호가 하나도 없을 때의 이유 — 자료 없음·표본 부족·평균 수준(중립)을 구분한다. 신호가 있으면 빈 문자열 */
  emptyNote: string;
  levelTake: string;
  slotsTakePrefix: string;
  takeLabel: string;
  stabilityTitle: string;
  checklistTitle: string;
  checklist: string[];
}

/** 받침 유무에 따라 조사를 고른다(한글 마지막 글자 기준, 그 밖의 글자는 받침 없음으로 본다). */
const hasBatchim = (w: string) => {
  const c = w.charCodeAt(w.length - 1);
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
};
export const eunNeun = (w: string) => (hasBatchim(w) ? "은" : "는");
export const iGa = (w: string) => (hasBatchim(w) ? "이" : "가");

const pct = (v: number, d = 1) => `${v.toFixed(d)}%`;
const sgn = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
const fmt = (n: number) => Math.round(n).toLocaleString("ko-KR");

/** 평균보다 낮은 시간대 중 가장 많이 낮은 곳(5%p 이상). 평균 자료가 없으면 null. */
function lowestSlot(s: AreaSlots | null): { label: string; sales: number; pilot: number; gap: number } | null {
  if (!s || !s.hasPilot) return null;
  const rows = s.rows.filter((r) => r.pilot !== null).map((r) => ({ label: r.label, sales: r.sales, pilot: r.pilot as number, gap: r.sales - (r.pilot as number) }));
  const lo = rows.reduce((m, r) => (r.gap < m.gap ? r : m), rows[0]);
  return lo && lo.gap <= -5 ? lo : null;
}

/** 유동인구 비중이 매출 비중보다 큰 시간대 중 차이가 가장 큰 곳(5%p 이상) — 지나가는 사람에 비해 매출이 덜 나오는 시간대. */
function floatingGapSlot(s: AreaSlots | null): { label: string; sales: number; flpop: number; gap: number } | null {
  if (!s || !s.hasFloating) return null;
  // 0~6시 유동인구는 생활인구 기반이라 대부분 집에 있는 주민이다 — 서버 비교(sales_benchmark.GAP_EXCLUDED)와 같이 '지나가는 사람' 비교에서 뺀다.
  const rows = s.rows.filter((r) => r.flpop !== null && !r.label.startsWith("00~06")).map((r) => ({ label: r.label, sales: r.sales, flpop: r.flpop as number, gap: (r.flpop as number) - r.sales }));
  if (rows.length === 0) return null;
  const hi = rows.reduce((m, r) => (r.gap > m.gap ? r : m), rows[0]);
  return hi && hi.gap >= 5 ? hi : null;
}

function topSlot(s: AreaSlots | null): { label: string; sales: number } | null {
  return s ? s.rows.reduce((m, r) => (r.sales > m.sales ? r : m), s.rows[0]) : null;
}

/** 소규모 상권(10~19곳)의 신호에 붙이는 꼬리말, 10곳 미만이면 비교 기반 신호를 만들지 않는다. */
const SMALL_TAIL = " (소규모 상권이라 변동성이 큽니다)";
const tail = (c: LensContext) => (c.sample?.status === "caution" ? SMALL_TAIL : "");
const tooFew = (c: LensContext) => c.sample?.status === "too_few";
/** 시간대 비중(점포 합계로 만든 구성비)은 비교 순위·증감처럼 제외하지는 않지만, 점포가 적으면 한두 곳이 크게 좌우한다는 말을 붙인다. */
const slotTail = (c: LensContext) => (c.sample?.status === "too_few" ? " (점포가 10곳 미만이라 참고용입니다)" : tail(c));
/** 중앙값을 조금 넘는 정도는 '높다'고 하지 않는다 — 중앙값의 1.25배 이상일 때만 눈에 띄게 높은 것으로 본다. */
const CLEAR_MARGIN = 1.25;
const clearlyHigher = (v: number | null | undefined, med: number | null | undefined) => v != null && med != null && med > 0 && v >= med * CLEAR_MARGIN;

function founderSignals(c: LensContext): { positive: Signal[]; caution: Signal[] } {
  const positive: Signal[] = [];
  const caution: Signal[] = [];
  const { slots: sl, location: lo } = c;
  const lv = tooFew(c) ? null : c.level;          // 점포 10곳 미만이면 매출 비교·증감·폐업률·프랜차이즈 비중·점포 수 증감 신호를 만들지 않는다
  const st = tooFew(c) ? null : c.stability;
  const ch = st?.churn ?? null;
  const T = tail(c);

  if (lv && lv.ratio >= 1.2) positive.push({ title: "점포당 추정매출이 비교 지역 중앙값보다 높습니다", body: `${fmt(lv.me)}만원으로 중앙값(${fmt(lv.median)}만원)의 ${lv.ratio.toFixed(1)}배입니다.${T}` });
  if (lv && lv.ratio < 0.8) caution.push({ title: "점포당 추정매출이 비교 지역 중앙값보다 낮습니다", body: `${fmt(lv.me)}만원으로 중앙값(${fmt(lv.median)}만원)의 ${lv.ratio.toFixed(1)}배입니다.${T}` });
  const yT = lv?.yoyCaution && !T ? SMALL_TAIL : T;
  if (lv?.yoyTotal != null && lv.yoyTotal > 0) positive.push({ title: "총매출이 전년 동기보다 늘었습니다", body: `전년 동기 대비 ${sgn(lv.yoyTotal)}입니다(점포 수 변화가 함께 반영된 값).${yT}` });
  if (lv?.yoyTotal != null && lv.yoyTotal < 0) caution.push({ title: "총매출이 전년 동기보다 줄었습니다", body: `전년 동기 대비 ${sgn(lv.yoyTotal)}입니다(점포 수 변화가 함께 반영된 값).${yT}` });
  if (lv?.flpopYoy != null && lv.flpopYoy >= 5) positive.push({ title: "유동인구 지수가 늘었습니다", body: `전년 동기 대비 ${sgn(lv.flpopYoy)}입니다(길 위 사람만 센 추정치).` });
  if (lv?.flpopYoy != null && lv.flpopYoy <= -5) caution.push({ title: "유동인구 지수가 줄었습니다", body: `전년 동기 대비 ${sgn(lv.flpopYoy)}입니다(길 위 사람만 센 추정치라 방향만 참고).` });

  if (ch?.closeRate != null && ch.medClose != null) {
    if (clearlyHigher(ch.closeRate, ch.medClose) && ch.p75Close != null && ch.closeRate >= ch.p75Close) caution.push({ title: "문 닫는 비율이 비교 지역 상위 25%에 듭니다", body: `최근 분기 폐업률 ${pct(ch.closeRate * 100)}가 상위 25% 경계(${pct(ch.p75Close * 100)})보다 높습니다. 원인은 이 자료로 알 수 없습니다.${T}` });
    else if (clearlyHigher(ch.closeRate, ch.medClose)) caution.push({ title: "문 닫는 비율이 비교 지역 중앙값보다 눈에 띄게 높습니다", body: `최근 분기 폐업률 ${pct(ch.closeRate * 100)}, 중앙값 ${pct(ch.medClose * 100)}입니다.${T}` });
    else if (ch.closeRate <= ch.medClose) positive.push({ title: "문 닫는 비율이 비교 지역 중앙값 이하입니다", body: `최근 분기 폐업률 ${pct(ch.closeRate * 100)}, 중앙값 ${pct(ch.medClose * 100)}입니다.${T}` });
    if (ch.openRate != null && ch.medOpen != null && clearlyHigher(ch.openRate, ch.medOpen) && clearlyHigher(ch.closeRate, ch.medClose)) caution.push({ title: "가게가 바뀌는 속도가 빠릅니다", body: "개업률과 폐업률이 모두 비교 지역 중앙값보다 높아, 자리 잡기 전에 교체되는 가게가 많을 수 있습니다." + T });
  }
  if (st?.chg2y != null && st.chg2y <= -5) caution.push({ title: "점포 수가 약 2년간 줄었습니다", body: `${sgn(st.chg2y)}입니다. 수요가 줄었거나 폐업이 이어졌을 수 있어 이유를 현장에서 확인해 보세요.${T}` });
  if (st?.chg2y != null && st.chg2y >= 5) caution.push({ title: "점포 수가 약 2년간 늘었습니다", body: `${sgn(st.chg2y)}입니다. 수요가 있다는 뜻일 수도, 경쟁이 늘고 있다는 뜻일 수도 있습니다.${T}` });
  if (st?.chg2y != null && Math.abs(st.chg2y) < 5 && st.volatility != null && st.volatility < 3) positive.push({ title: "점포 수가 안정적입니다", body: `약 2년 증감 ${sgn(st.chg2y)}, 분기 평균 변동폭 ${pct(st.volatility)}입니다.${T}` });
  if (st?.frc && st.frc.median !== null && st.frc.share > Math.max(st.frc.median * 1.5, st.frc.median + 0.05)) caution.push({ title: "프랜차이즈 점포 비중이 높습니다", body: `${pct(st.frc.share * 100)}로 비교 지역 중앙값(${pct(st.frc.median * 100, 0)})보다 높아, 브랜드 가게와 경쟁해야 할 수 있습니다.${T}` });

  const top = topSlot(sl);
  if (top && top.sales >= 45) caution.push({ title: "매출이 한 시간대에 쏠려 있습니다", body: `${top.label}에 매출의 ${pct(top.sales)}가 몰립니다. 그 시간대 수요에 맞지 않는 영업이면 불리할 수 있습니다.${slotTail(c)}` });
  if (lo?.facts.some((f) => f.label === "지하철 역" && /^[1-9]/.test(f.value))) positive.push({ title: "지하철역이 가깝습니다", body: lo.facts.find((f) => f.label === "지하철 역")?.note ?? "" });
  if (lo?.facts.some((f) => f.label.startsWith("소규모상가 임대료") && f.value === "자료 없음")) caution.push({ title: "임대료·공실률을 이 자료로 알 수 없습니다", body: "가까운 조사 상권이 없어 값이 없습니다. 실제 임대료·보증금·권리금은 부동산에서 직접 확인해야 합니다." });
  return { positive, caution };
}

function ownerSignals(c: LensContext): { positive: Signal[]; caution: Signal[] } {
  const positive: Signal[] = [];
  const caution: Signal[] = [];
  const { slots: sl } = c;
  const lv = tooFew(c) ? null : c.level;
  const st = tooFew(c) ? null : c.stability;
  const ch = st?.churn ?? null;
  const T = tail(c);

  const low = lowestSlot(sl);
  if (low) positive.push({ title: `${low.label}에 손님을 더 모을 여지가 있습니다`, body: `이 시간대 매출 비중이 ${pct(low.sales)}로 비교 지역 평균(${pct(low.pilot)})보다 ${Math.abs(low.gap).toFixed(1)}%p 낮습니다. 한정 메뉴·영업시간·예약 같은 한 가지를 시험해 볼 만합니다.${slotTail(c)}` });
  const fg = floatingGapSlot(sl);
  if (fg) positive.push({ title: `${fg.label}${eunNeun(fg.label)} 지나가는 사람에 비해 매출이 덜 나오는 시간대입니다`, body: `유동인구 비중 ${pct(fg.flpop)}에 비해 매출 비중은 ${pct(fg.sales)}입니다. 출근길·통행 인구가 많은 시간대일 수 있어 원인은 이 자료로 알 수 없지만, 이 시간대에 영업한다면 간판·메뉴판·포장·배달로 겨냥해 볼 수 있습니다.${slotTail(c)}` });
  const top = topSlot(sl);
  if (top && top.sales >= 40) positive.push({ title: `${top.label}${iGa(top.label)} 이 ${c.unitWord} 매출의 중심입니다`, body: `매출의 ${pct(top.sales)}가 이 시간대에 몰립니다. 대기·회전·예약을 점검하면 이미 있는 수요를 더 받을 수 있습니다.${slotTail(c)}` });
  // 직장인구 '절대 수' 고정 기준(1,500명)은 큰 단위(행정동)일수록 항상 넘어 편향되므로, 상권 유형 판정과 같은 비중 기준(직장인구 ÷ 직장+상주, 업무형)을 쓴다.
  // 판정 가능한 최소 인구에 못 미치거나 유형 자료가 없으면 신호를 만들지 않는다(자료 부족).
  const dm = c.demand;
  if (dm && dm.baseOk && dm.type === "업무형" && dm.sharePct !== null) positive.push({ title: `직장인구 비중이 높은 업무형 ${c.unitWord}입니다`, body: `직장인구가 직장+상주 인구의 ${pct(dm.sharePct)}${dm.workers !== null ? `(직장인구 ${fmt(dm.workers)}명)` : ""}입니다. 점심 세트·단체 예약·회식 메뉴로 접근해 볼 수 있습니다. 비중은 업무형 기준(60% 이상)과 견준 값이며 매장 방문객 수가 아닙니다.` });
  if (lv?.flpopYoy != null && lv.flpopYoy >= 5) positive.push({ title: "유동인구 지수가 늘고 있습니다", body: `전년 동기 대비 ${sgn(lv.flpopYoy)}입니다. 늘어난 사람들이 들어오게 할 입구 홍보를 점검해 볼 때입니다.` });
  if (st?.frc && st.frc.median !== null && st.frc.share > Math.max(st.frc.median * 1.5, st.frc.median + 0.05)) positive.push({ title: "개인 가게의 차별화가 눈에 띄기 쉬운 상권입니다", body: `프랜차이즈 비중이 ${pct(st.frc.share * 100)}로 높습니다. 브랜드 가게와 다른 메뉴·분위기·서비스를 한 줄로 정리해 알려 보세요.${T}` });
  if (ch?.closeRate != null && ch.medClose != null && ch.closeRate <= ch.medClose) positive.push({ title: "문 닫는 이웃 가게의 비율이 비교 지역 중앙값 이하입니다", body: `최근 분기 폐업률 ${pct(ch.closeRate * 100)}로 비교 지역 중앙값(${pct(ch.medClose * 100)}) 이하입니다. 한 분기 값이라 오래 버틴다는 뜻은 아닙니다.${T}` });

  if (lv?.yoyTotal != null && lv.yoyTotal < 0) caution.push({ title: "상권 전체 매출이 줄고 있습니다", body: `총매출이 전년 동기 대비 ${sgn(lv.yoyTotal)}입니다. 내 매출 변화율이 이보다 작다면 상권 영향이, 더 크다면 내 가게 요인이 클 수 있어 '내 가게 점검'으로 견줘 보세요.${lv.yoyCaution && !T ? SMALL_TAIL : T}` });
  if (lv?.flpopYoy != null && lv.flpopYoy <= -5) caution.push({ title: "유동인구 지수가 줄었습니다", body: `전년 동기 대비 ${sgn(lv.flpopYoy)}입니다(길 위 사람만 센 추정치라 방향만 참고).` });
  if (clearlyHigher(ch?.closeRate, ch?.medClose) && ch?.closeRate != null && ch.medClose != null) caution.push({ title: "이웃 가게가 문을 닫는 비율이 비교 지역 중앙값보다 눈에 띄게 높습니다", body: `최근 분기 폐업률 ${pct(ch.closeRate * 100)}로 비교 지역 중앙값(${pct(ch.medClose * 100)})보다 높습니다. 닫은 가게의 사정을 알아 두면 같은 어려움을 피하는 데 도움이 됩니다.${T}` });
  if (st?.chg2y != null && st.chg2y >= 5) caution.push({ title: "같은 업종 점포가 늘고 있습니다", body: `약 2년간 ${sgn(st.chg2y)}입니다. 손님을 나눠 갖는 가게가 늘고 있어 단골 관리와 차별점이 중요해집니다.${T}` });
  return { positive, caution };
}

export function buildLens(mode: Mode, c: LensContext): Lens {
  const founder = mode === "founder";
  const { positive, caution } = founder ? founderSignals(c) : ownerSignals(c);
  const low = lowestSlot(c.slots);
  const yoy = tooFew(c) ? null : (c.level?.yoyTotal ?? null);
  const fg = floatingGapSlot(c.slots);
  const ch = tooFew(c) ? null : (c.stability?.churn ?? null);
  const frc = tooFew(c) ? null : (c.stability?.frc ?? null);

  const checklist: string[] = [];
  if (founder) {
    checklist.push(`후보 ${c.unitWord}을 '입지 비교'에 담아 점포당 월평균 추정매출·폐업률·점포 수를 나란히 견주기`);
    const top = topSlot(c.slots);
    if (top && top.sales >= 45) checklist.push(`${top.label} 외 시간대(특히 내 메뉴가 노리는 시간대)의 실제 유동·손님을 현장에서 시간대별로 확인하기`);
    if (clearlyHigher(ch?.closeRate, ch?.medClose)) checklist.push("최근 문을 닫은 가게의 이유를 이웃 상인·부동산에 물어보기");
    checklist.push("실제 임대료·보증금·권리금은 이 자료에 없으니 부동산에서 직접 확인하기");
    if (frc && frc.median !== null && frc.share > frc.median) checklist.push(`프랜차이즈 점포(${(frc.share * 100).toFixed(0)}%)와 메뉴·가격대가 겹치는지 점검하기`);
  } else {
    checklist.push(yoy !== null ? `'내 가게 점검'에 월 매출을 기록해 이 ${c.unitWord}의 총매출 변화율(${sgn(yoy)})과 내 변화율을 견주기` : "'내 가게 점검'에 월 매출을 기록해 이 상권의 흐름과 견주기");
    if (low) checklist.push(`${low.label} 시간대에 한 가지(한정 메뉴·세트·영업시간)를 시험하고, 한 달 뒤 그 시간대 매출 변화를 보기`);
    if (fg) checklist.push(`유동인구가 많은 ${fg.label} 시간대에 내 가게가 열려 있는지, 밖에서 눈에 띄는지 점검하기`);
    if (frc && frc.median !== null && frc.share > frc.median) checklist.push(`프랜차이즈 점포(${(frc.share * 100).toFixed(0)}%)와 겹치는 메뉴·가격대를 보고, 내 가게의 차별점을 한 줄로 정리하기`);
    if (clearlyHigher(ch?.closeRate, ch?.medClose)) checklist.push("최근 문을 닫은 이웃 가게의 사정을 알아 두기");
    checklist.push("분기마다 이 리포트를 다시 뽑아 상권 흐름이 바뀌는지 확인하기");
  }

  let emptyNote = "";
  if (positive.length + caution.length === 0) {
    emptyNote = tooFew(c)
      ? `점포가 ${c.sample?.stores ?? ""}곳뿐이라(${"10"}곳 미만) 매출 비교·폐업률 기반 신호를 만들지 않았습니다. 자료가 없는 것이 아니라 표본이 작아 해석을 보류한 것입니다.`
      : !c.level && !c.slots
        ? `이 ${c.unitWord}·업종은 서울시 추정매출 자료가 없어 매출·시간대 기반 신호를 만들지 않았습니다(0이 아니라 자료 없음).`
        : `비교 지역 중앙값·전년 동기 같은 정해진 기준을 넘는 뚜렷한 신호가 없습니다(평균 수준). 신호를 일부러 만들지 않았습니다.`;
  }

  return {
    mode,
    eyebrow: founder ? "예비 창업자용 · 창업 전 점검" : "자영업자용 · 매출 증대·기회 포착",
    pageTitle: founder ? "상권 인사이트 리포트 · 예비 창업자용" : "상권 인사이트 리포트 · 자영업자용",
    signalsTitle: founder ? "창업 전에 살펴볼 신호" : "내 가게에 적용해 볼 기회와 점검",
    positiveTitle: founder ? "긍정 신호" : "기회로 볼 만한 점",
    cautionTitle: founder ? "주의 신호" : "대비해 둘 점",
    positive,
    caution,
    emptyNote,
    ruleNote: founder
      ? "신호는 비교 지역 중앙값·전년 동기 같은 정해진 기준을 넘는 사실만 적은 것입니다. 점수나 '창업 적합도'가 아니고, 신호의 개수가 아니라 내용을 보세요."
      : "기회는 비교 지역 평균과의 차이·유동인구·경쟁 구조 같은 사실에서 찾은 가설입니다. 매출이 늘어난다는 보장이 아니니 작게 시험해 보세요.",
    levelTake: founder
      ? "점포당 추정매출이 높다는 것은 이 지역에 매출이 모인다는 뜻이고, 이익이 많이 남는다는 뜻은 아닙니다. 임대료·인건비·원가는 이 자료에 없습니다. 최근 흐름이 내려가는 중이라면 그 이유(점포 수 변화·유동인구·경쟁)를 현장에서 확인해 보고, 후보 지역은 '입지 비교'로 나란히 견줘 보세요."
      : `이 숫자는 이 ${c.unitWord} 같은 업종 점포들의 평균이라 내 가게의 매출이 아닙니다.${yoy !== null ? ` 상권 총매출은 전년 동기 대비 ${sgn(yoy)}입니다. ` : " "}'내 가게 점검'에 월 매출을 기록해 상권 흐름과 견주면 내 가게가 앞서는지 뒤처지는지 감을 잡을 수 있습니다. 평균보다 낮다면 3쪽의 비는 시간대와 4쪽의 경쟁 환경에서 기회를 찾아보세요.`,
    slotsTakePrefix: founder
      ? ""
      : low
        ? `${low.label}${eunNeun(low.label)} 비교 지역 평균보다 매출 비중이 낮습니다. 그 시간대에 손님을 더 오게 할 여지(한정 메뉴·영업시간·예약)를 한 가지 시험해 볼 만합니다. 원인은 이 자료로 알 수 없습니다. `
        : "이 상권의 시간대 패턴과 내 가게의 시간대별 매출을 견주면 어디에 여지가 있는지 보입니다. ",
    takeLabel: founder ? "창업 전에 의미" : "사장님께 의미",
    stabilityTitle: founder ? "안정성·경쟁과 입지" : "경쟁 환경과 입지",
    checklistTitle: founder ? "창업 전에 확인해 볼 것" : "이번 달 해볼 것",
    checklist,
  };
}
