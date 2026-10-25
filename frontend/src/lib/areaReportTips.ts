import type { AreaReport } from "./areaReport";
import type { AreaCharacter, ReportDetail, FoodUnitStoresResponse } from "./apiClient";

export interface ReportTip { key: string; title: string; evidence: string; action: string; salesCaution?: boolean }
const signed = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
export function areaReportTips(r: AreaReport, detail?: ReportDetail, stores?: FoodUnitStoresResponse): ReportTip[] {
  if (r.lens.mode !== "founder") return [];
  const tips: ReportTip[] = [];
  const add = (key: string, title: string, evidence: string, action: string) => tips.push({ key, title, evidence, action });
  const lv = r.level, sl = r.slots;
  const top = sl?.rows.length ? sl.rows.reduce((a, b) => a.sales > b.sales ? a : b) : null;
  const office = r.profile.find((p) => p.label === "유형(참고용 분류)")?.value.includes("업무");
  // A leading slot alone is universal; require a marked concentration or a large peer gap.
  if (top && top.sales >= 45 && (top.pilot === null || top.sales - top.pilot >= 8)) {
    add("peak", office && top.label === "11~14시" ? "직장인 점심에 맞춘 빠른 식사형 운영" : `${top.label} 집중형 운영`, `${top.label} 매출 ${top.sales.toFixed(1)}%${top.pilot !== null ? ` · 비교 평균보다 ${(top.sales - top.pilot).toFixed(1)}%p 높음` : ""}${office ? " · 업무 중심 상권" : ""}`, "핵심 메뉴를 좁히고 사전 준비·짧은 조리 동선으로 피크 시간 처리량을 확보하는 구성을 우선 검토하세요. 인력도 이 시간대에 집중 배치하는 방식이 어울립니다.");
  }
  const weekend = detail?.composition["요일"]?.find((s) => s.label === "주말")?.pct;
  if (weekend != null && (weekend < 20 || weekend >= 40)) add("weekend", weekend < 20 ? "평일 매출 중심의 영업 일정" : "주말 수요를 살리는 영업 일정", `평일 매출 ${(100 - weekend).toFixed(1)}% · 주말 ${weekend.toFixed(1)}%`, weekend < 20 ? "평일 운영을 중심에 두고 주말은 단축 영업이나 휴무를 포함한 일정을 검토할 만합니다. 처음부터 주 7일 동일한 인력·준비량을 배치하는 방식은 피하는 편이 좋습니다." : "주말의 매출 비중이 큰 만큼 주말 영업을 핵심 일정으로 두고, 휴무일 분산과 주말 인력·식재료 준비량을 별도로 설계할 만합니다.");
  const ages = detail?.composition["연령"]?.filter((a) => a.pct != null) ?? [];
  const age = ages.length ? ages.reduce((a, b) => a.pct! > b.pct! ? a : b) : null;
  if (age && age.pct! >= 45) add("customer", `${age.label} 중심의 초기 고객 확보`, `${age.label} 매출 비중 ${age.pct!.toFixed(1)}%`, `초기 메뉴 테스트와 홍보의 우선 고객을 ${age.label}로 좁혀볼 만합니다. 여러 고객층을 동시에 겨냥하기보다 해당 고객층의 반응을 보며 메뉴·가격 구성을 다듬는 전략입니다.`);
  const trend = salesTrendStrategy(lv);
  if (trend) tips.push(trend);
  const mix = stores?.category_mix[0];
  if (mix && mix.share_pct >= 40 && stores!.total >= 20) add("competition", `${mix.name} 중심 경쟁에서 다른 선택 이유 만들기`, `${mix.name} ${mix.count}곳 · 선택 업종 점포의 ${mix.share_pct.toFixed(1)}%`, `같은 ${mix.name}으로 진입한다면 대표 메뉴·가격·제공 방식 중 뚜렷한 차이를 하나 정하세요. 다른 메뉴를 계획한다면 기존 식사 수요와 어떤 목적에서 연결되는지 먼저 정리하는 편이 좋습니다.`);
  return tips;
}

/** 전년 동기 두 매출 지표를 같은 기준으로 비교한다. ±5%는 통계적 유의성이 아닌 문구 분류 기준이다. */
export function salesTrendStrategy(lv: AreaReport["level"]): ReportTip | null {
  if (!lv || lv.sampleStatus === "too_few") return null;
  const valid = (n: number | null | undefined): n is number => n != null && Number.isFinite(n);
  const total = valid(lv.yoyTotal) ? lv.yoyTotal : null;
  const per = valid(lv.yoyPerStore) ? lv.yoyPerStore : null;
  const direction = (n: number | null) => n === null ? null : n >= 5 ? 1 : n <= -5 ? -1 : 0;
  const t = direction(total), p = direction(per);
  if ((t === null || t === 0) && (p === null || p === 0)) return null;
  const facts = [total !== null ? `총매출 ${signed(total)}` : "총매출 증감 미확인", per !== null ? `점포당 월평균 추정매출 ${signed(per)}` : "점포당 매출 증감 미확인"];
  if (valid(lv.storesFrom) && valid(lv.storesNow) && lv.storesFrom > 0 && lv.storesNow > 0) {
    facts.push(`서울시 집계 점포 수 ${lv.storesFrom.toLocaleString("ko-KR")}→${lv.storesNow.toLocaleString("ko-KR")}곳`);
  }
  const evidence = `전년 동기 대비 · ${facts.join(" · ")}`;
  const make = (title: string, action: string, salesCaution = true): ReportTip => ({key:"trend",title,evidence,action,salesCaution});
  const limit = " 개별 가게의 매출 변화나 원인을 확정하는 자료는 아닙니다.";
  if (t === null || p === null) return make("매출 지표를 함께 확인한 뒤 투자 규모 판단", "한쪽 지표만으로 시장 확대나 점포별 영업 개선을 판단하기 어렵습니다. 누락된 지표와 경쟁점의 실제 영업 상황을 확인한 뒤 초기 투자 규모를 정하세요." + limit);
  if (t === 1 && p === 1) return make("시장·점포당 매출 증가와 경쟁 진입을 함께 점검", "두 매출 지표가 함께 늘었습니다. 점포 수 변화와 신규 경쟁점의 메뉴·가격을 살펴보고, 후보지에서 핵심 메뉴의 실제 주문 수요를 검증하세요. 매장·인력 확대를 자동으로 권하는 신호는 아닙니다." + limit, false);
  if (t === 1 && p === -1) return make("시장 확대 속 점포당 매출 감소에 대비", "총매출이 늘어도 점포당 매출은 줄었습니다. 점포 수 증가와 경쟁 구성이 함께 바뀌었는지 살펴보고, 차별화할 메뉴·가격과 보수적인 초기 규모를 검토하세요." + limit);
  if (t === -1 && p === 1) return make("점포당 매출 개선이 점포 감소와 겹치는지 확인", "총매출은 줄었지만 점포당 매출은 늘었습니다. 집계 점포 수 감소나 업종 구성 변화에 따른 평균 변화인지 확인하고, 수요 회복으로 단정해 투자하지 마세요." + limit);
  if (t === -1 && p === -1) return make("시장·점포당 매출 감소에 맞춘 보수적 진입", "두 매출 지표가 함께 줄었습니다. 초기 고정비를 낮추고 핵심 메뉴·주력 시간대의 실제 수요를 먼저 검증하세요. 점포 수 변화와 주변 폐업·이전 상황도 함께 살펴보세요." + limit);
  if (p === -1) return make("점포당 매출 감소를 고려해 초기 투자 조절", "총매출 변동이 작아도 점포당 매출은 줄었습니다. 점포 수와 경쟁 구성을 확인하고, 초기 비용을 낮춘 상태에서 주문 수요를 검증하세요." + limit);
  if (t === -1) return make("시장 매출 감소와 점포 구성 변화 점검", "점포당 매출의 변동이 작더라도 총매출은 줄었습니다. 점포 수 감소와 업종 구성 변화가 함께 있었는지 확인하고 보수적으로 진입하세요." + limit);
  if (t === 1) return make("총매출 증가가 점포당 개선으로 이어지는지 확인", "총매출은 늘었지만 점포당 매출의 변동은 작습니다. 점포 수 증가와 경쟁 진입을 확인하고, 총매출 증가만으로 운영 규모를 늘리지 마세요." + limit);
  return make("점포당 매출 개선과 시장 수요를 함께 확인", "점포당 매출은 늘었지만 총매출의 변동은 작습니다. 점포 수·업종 구성 변화와 후보지의 실제 구매 수요를 확인한 뒤 투자 규모를 정하세요." + limit, false);
}

/** 일반적인 현장 확인은 전략 팁과 분리해 기존 체크리스트에 합친다. */
export const founderFieldChecks = [
  "예정 영업시간에 후보지 앞 통행 방향·역 출구·횡단보도·건물 출입구와 간판 시야 확인하기",
  "직접 경쟁할 가게의 메뉴·가격·영업시간·대기·좌석 회전·포장 및 배달 여부 비교하기",
  "평일과 주말 같은 시간대의 방문 인원·동반 고객·주문 메뉴를 비교하기",
  "후보 점포의 월세·관리비·보증금·권리금과 시설 상태 확인하기",
  "최근 상호가 바뀐 자리의 이전·폐업 사정을 이웃 상인에게 확인하기",
];

type TraitKey = AreaCharacter["type"]["traits"][number]["key"];

/** 상권 특성별 운영 전략 — 자료 근거는 그 특성을 판정한 근거 한 줄을 그대로 쓴다. 성공을 약속하지 않고 '검토'를 권한다. */
const TRAIT_STRATEGY: Record<TraitKey, { title: string; action: string }> = {
  business: { title: "직장인 점심·퇴근 시간대에 맞춘 운영", action: "평일 점심·퇴근 시간대의 회전과 빠른 제공 방식을 먼저 검토하고, 주말 영업은 현장에서 방문객을 확인한 뒤 정해 보세요." },
  residential: { title: "단골과 저녁·주말 수요에 맞춘 운영", action: "퇴근 후 저녁과 주말의 가족·1인 가구 수요, 포장·배달 비중을 함께 검토해 보세요." },
  transit: { title: "역 이용객 동선을 활용한 접근성", action: "역 출구에서 후보지까지의 보행 동선과 간판 시야를 확인하고, 이동 중 이용하기 쉬운 메뉴·포장 구성을 검토해 보세요." },
  commercial: { title: "경쟁이 모인 상권에서 차별점 만들기", action: "같은 업종 가게가 많은 편이니 대표 메뉴·가격대·제공 방식 중 뚜렷한 차이를 먼저 정해 보세요." },
};
const MIXED_STRATEGY = { title: "평일 낮과 저녁·주말 수요를 나눠 점검", action: "직장인구와 상주인구가 섞여 있어 한 시간대에 몰리지 않을 수 있습니다. 시간대별 손님 흐름을 현장에서 확인하고 영업시간을 정해 보세요." };

/** 상권 유형(업무·주거·교통 거점·상업 집중·혼합)에서 바로 이어지는 전략. 판정 보류면 만들지 않는다. */
export function traitStrategies(character: AreaCharacter | null | undefined): ReportTip[] {
  if (!character || character.type.kind === "hold") return [];
  const t = character.type;
  if (t.kind === "mixed" || t.traits.length === 0) return [{ key: "trait-mixed", ...MIXED_STRATEGY, evidence: t.mixed_evidence?.[0] ?? t.headline }];
  return t.traits.map((x) => ({ key: `trait-${x.key}`, ...TRAIT_STRATEGY[x.key], evidence: x.evidence[0] ?? x.label }));
}

/** 1쪽에 보이는 창업(운영) 전략 전체 — 자료로 두드러진 항목(예비 창업자만)을 먼저, 그다음 상권 유형 기반 전략. 같은 키는 한 번만. */
export function areaStrategies(r: AreaReport, character: AreaCharacter | null | undefined, detail?: ReportDetail, stores?: FoodUnitStoresResponse): ReportTip[] {
  const seen = new Set<string>();
  return [...areaReportTips(r, detail, stores), ...traitStrategies(character)].filter((t) => !seen.has(t.key) && seen.add(t.key));
}

/** 1쪽 '이 상권의 특징' — 핵심 숫자 카드(점포당 매출·순위·총매출 증감·폐업률)와 겹치지 않는 값만 문장으로 옮긴다(최대 4줄). 판단·점수는 만들지 않고, 값이 없는 줄은 만들지 않는다. */
export function areaFeatureLines(r: AreaReport, detail?: ReportDetail, stores?: FoodUnitStoresResponse): string[] {
  const out: string[] = [];
  const lv = r.level, sl = r.slots;
  const top = sl?.rows.length ? sl.rows.reduce((a, b) => a.sales > b.sales ? a : b) : null;
  if (top) out.push(`매출이 가장 몰리는 시간대는 ${top.label}(${top.sales.toFixed(0)}%)${top.pilot !== null ? `이고 비교 평균은 ${top.pilot.toFixed(0)}%입니다.` : "입니다."}`);
  const ages = detail?.composition["연령"]?.filter((a) => a.pct != null) ?? [];
  const age = ages.length ? ages.reduce((a, b) => a.pct! > b.pct! ? a : b) : null;
  const weekend = detail?.composition["요일"]?.find((x) => x.label === "주말")?.pct;
  if (age) out.push(`결제 매출 비중이 가장 큰 연령대는 ${age.label}(${age.pct!.toFixed(0)}%)${weekend != null ? `이고, 평일 ${(100 - weekend).toFixed(0)}% · 주말 ${weekend.toFixed(0)}%입니다.` : "입니다."}`);
  const mix = stores?.category_mix[0];
  if (mix && stores!.total >= 20) out.push(`세부 업종은 ${mix.name}(${mix.share_pct.toFixed(0)}%)이 가장 많습니다.`);
  if (lv && lv.flpopYoy != null) out.push(`유동인구 지수는 전년 동기 대비 ${lv.flpopYoy > 0 ? "+" : ""}${lv.flpopYoy.toFixed(1)}%입니다(길 단위로 배분한 추정치).`);
  return out.slice(0, 4);
}

/** 세부 카드 제목을 복사하지 않고 수요·입지와 운영 방향을 조합한 대표 창업전략을 만든다. */
export function strategyHeadline(tips: ReportTip[]): string | null {
  if (!tips.length) return null;
  const keys = new Set(tips.map(t => t.key));
  const trend = tips.find(t => t.key === "trend");
  const falling = trend?.salesCaution === true;
  const business = keys.has("trait-business");
  const residential = keys.has("trait-residential");
  const transit = keys.has("trait-transit");
  const competition = keys.has("competition") || keys.has("trait-commercial");
  // 고객과 입지의 결합을 먼저 표현하고, 매출 흐름은 초기 규모·검증 방향에 반영한다.
  if (business && transit) return falling
    ? "출퇴근 동선의 직장인 수요부터 작게 검증하세요"
    : "직장인 식사와 이동 수요를 함께 잡는 창업을 검토하세요";
  if (residential && transit) return falling
    ? "주민·역 이용객의 반복 수요부터 작게 검증하세요"
    : "주민의 재방문과 역 이용객의 포장 수요를 함께 겨냥하세요";
  if (business) return falling
    ? "직장인 주력 식사 수요에 집중해 초기 규모를 낮추세요"
    : "직장인의 반복 식사를 겨냥해 메뉴와 제공 방식을 설계하세요";
  if (residential) return falling
    ? "생활권 단골 수요를 확인하며 작은 규모로 시작하세요"
    : "주민이 반복해서 찾을 식사와 포장 구성을 설계하세요";
  if (transit) return falling
    ? "역 주변의 실제 구매 수요를 확인하며 작게 시작하세요"
    : "역에서 매장까지의 동선과 빠른 이용 방식을 함께 설계하세요";
  if (competition) return falling
    ? "경쟁점과 다른 선택 이유를 검증한 뒤 투자하세요"
    : "비슷한 가게 사이에서 선택받을 메뉴·가격·방식을 정하세요";
  if (keys.has("peak")) return falling
    ? "주력 시간대의 주문 수요를 확인하며 작게 시작하세요"
    : "매출이 몰리는 시간에 맞춰 메뉴와 처리 동선을 설계하세요";
  if (keys.has("weekend")) return "요일별 수요에 맞춰 영업일·메뉴·준비량을 함께 설계하세요";
  if (keys.has("customer")) return "주요 고객의 이용 목적에 맞춰 초기 메뉴와 가격을 검증하세요";
  if (trend) return falling
    ? "초기 고정비를 낮추고 실제 주문을 확인한 뒤 투자하세요"
    : "매출 흐름과 경쟁 진입을 함께 살펴 초기 수요를 검증하세요";
  return "시간대별 실제 수요를 확인해 메뉴와 운영 규모를 정하세요";
}
