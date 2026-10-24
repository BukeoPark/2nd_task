import type { AreaReport } from "./areaReport";
import type { AreaCharacter, ReportDetail, FoodUnitStoresResponse } from "./apiClient";

export interface ReportTip { key: string; title: string; evidence: string; action: string }
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
  if (lv && lv.sampleStatus !== "too_few" && lv.yoyTotal != null && Math.abs(lv.yoyTotal) >= 5) {
    const falling = lv.yoyTotal < 0;
    add("trend", falling && lv.ratio >= 1.5 ? "매출 수준은 높지만 확장보다 집중이 필요한 흐름" : falling ? "감소 흐름에 맞춘 가벼운 초기 운영" : "매출 증가기에 맞춘 단계적 운영 확대", `점포당 매출 비교 중앙값의 ${lv.ratio.toFixed(1)}배 · 총매출 전년 동기 ${signed(lv.yoyTotal)}${lv.flpopYoy != null && Math.abs(lv.flpopYoy) >= 5 ? ` · 유동인구 ${signed(lv.flpopYoy)}` : ""}`, falling ? "높은 매출 수준만 보고 큰 매장과 많은 인력을 전제하기보다 핵심 메뉴·주력 시간대 중심으로 시작하세요. 좌석과 인력은 실제 주문이 쌓이는 속도에 맞춰 늘리는 전략이 적절합니다." : "초기에는 핵심 메뉴와 운영 규모를 유지하면서 주문 증가가 이어지는 시간대부터 인력·준비량을 단계적으로 늘리는 방식을 검토하세요.");
  }
  const mix = stores?.category_mix[0];
  if (mix && mix.share_pct >= 40 && stores!.total >= 20) add("competition", `${mix.name} 중심 경쟁에서 다른 선택 이유 만들기`, `${mix.name} ${mix.count}곳 · 선택 업종 점포의 ${mix.share_pct.toFixed(1)}%`, `같은 ${mix.name}으로 진입한다면 대표 메뉴·가격·제공 방식 중 뚜렷한 차이를 하나 정하세요. 다른 메뉴를 계획한다면 기존 식사 수요와 어떤 목적에서 연결되는지 먼저 정리하는 편이 좋습니다.`);
  return tips;
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
