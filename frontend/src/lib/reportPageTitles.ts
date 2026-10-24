import type {AreaReport, AreaSlots, AreaStability} from "./areaReport.ts";
import type {AreaCharacter, FoodUnitStoresResponse, ReportDetail, ReportExtras} from "./apiClient";
const pct=(v:number)=>`${Number(v.toFixed(1))}%`;
export function slotsPageTitle(sl:AreaSlots):string {
  if(!sl.rows.length)return "시간대별 매출 자료를 확인하지 못했습니다";
  const top=sl.rows.reduce((a,b)=>a.sales>=b.sales?a:b);
  const gaps=sl.hasPilot?sl.rows.filter(x=>x.pilot!==null).map(x=>({...x,gap:x.sales-x.pilot!})).sort((a,b)=>Math.abs(b.gap)-Math.abs(a.gap)):[];
  const gap=gaps[0];
  return gap&&Math.abs(gap.gap)>=8?`${gap.label} 매출 비중이 평균보다 ${Number(Math.abs(gap.gap).toFixed(1))}%p ${gap.gap>0?"높습니다":"낮습니다"}`:`${top.label}에 매출의 ${pct(top.sales)}가 몰립니다`;
}
export function competitionPageTitle(stores?:Pick<FoodUnitStoresResponse,"total"|"category_mix">):string {
  if(!stores)return "점포 구성 자료를 확인하지 못했습니다";
  const top=[...stores.category_mix].sort((a,b)=>b.count-a.count)[0];
  if(top&&stores.total>0)return `${top.name} 비중이 ${pct(top.share_pct)}로 가장 높습니다`;
  return stores.total===0?"선택 범위에서 확인된 매장이 없습니다":`선택 업종 매장 ${stores.total.toLocaleString()}곳이 확인됩니다`;
}
export function demandPageTitle(detail?:ReportDetail):string {
  const weekend=detail?.composition["요일"]?.find(x=>x.label==="주말")?.pct;
  if(weekend!=null)return weekend>50?`주말에 매출의 ${pct(weekend)}가 발생합니다`:`평일에 매출의 ${pct(100-weekend)}가 발생합니다`;
  const age=detail?.composition["연령"]?.filter(x=>x.pct!==null).sort((a,b)=>b.pct!-a.pct!)[0];
  return age?`${age.label} 결제 매출 비중이 ${pct(age.pct!)}로 가장 큽니다`:"결제 고객 구성 자료를 확인하지 못했습니다";
}
export function industryPageTitle(extras:ReportExtras):string {
  const top=extras.industry.status==="ok"?[...extras.industry.rows].filter(x=>x.per_store_month!==null).sort((a,b)=>b.per_store_month!-a.per_store_month!)[0]:null;
  return top?`${top.svc_nm}의 점포당 추정매출이 가장 높습니다`:"업종별 추정매출을 비교할 자료가 부족합니다";
}
export function survivalPageTitle(extras?:ReportExtras, stability?:AreaStability|null):string {
  const active=extras?.license.status==="ok"?extras.license.active:null;
  if(active?.enough&&active.median_years!=null)return `영업 중 가게의 업력 중앙값은 ${active.median_years.toFixed(1)}년입니다`;
  const closed=stability?.facts.find(x=>x.label.includes("연 폐업률"));
  return closed?`최근 1년 폐업률은 ${closed.value}입니다`:"영업 기간을 판단할 자료가 충분하지 않습니다";
}
export function locationPageTitle(character?:AreaCharacter|null):string {
  if(!character)return "주변 환경 자료를 확인하지 못했습니다";
  const worker=character.sections.demand.worker_share_pct;
  const rail=character.sections.transit.rail.count;
  const population=worker==null?"":worker>=50?`직장인구 ${pct(worker)}`:`상주인구 ${pct(100-worker)}`;
  return `${population?population+" · ":""}가까운 지하철역 ${rail}곳이 확인됩니다`;
}
export function summaryPageTitle(r:AreaReport):string {
  const lv=r.level;
  if(lv&&lv.sampleStatus!=="too_few")return `매출 수준은 중앙값의 ${lv.ratio.toFixed(1)}배${lv.yoyTotal!=null?`, 총매출은 ${lv.yoyTotal>0?"+":""}${pct(lv.yoyTotal)}`:"입니다"}`;
  return r.findings[0]?.title??"확인된 특징과 추가 확인사항을 함께 살펴보세요";
}
