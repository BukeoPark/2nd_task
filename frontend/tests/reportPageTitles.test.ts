import assert from "node:assert/strict";
import {test} from "node:test";
import {competitionPageTitle,demandPageTitle,slotsPageTitle} from "../src/lib/reportPageTitles.ts";
import type {ReportDetail} from "../src/lib/apiClient";
import type {AreaSlots} from "../src/lib/areaReport.ts";
const detail=(weekend:number|null):ReportDetail=>({period:"2026년 2분기",boundary:null,basis:"매출액 기준",composition:{"요일":[{label:"주말",pct:weekend}]}});
test("고객 장표 제목은 평일·주말 매출 구성에 맞고 0도 유효한 값이다",()=>{
 assert.equal(demandPageTitle(detail(16)),"평일에 매출의 84%가 발생합니다");
 assert.equal(demandPageTitle(detail(70)),"주말에 매출의 70%가 발생합니다");
 assert.equal(demandPageTitle(detail(0)),"평일에 매출의 100%가 발생합니다");
 assert.match(demandPageTitle(detail(null)),/자료를 확인하지 못/);
});
test("경쟁 제목은 입력 순서가 아닌 실제 최다 업종을 쓰고 원본을 바꾸지 않는다",()=>{
 const category_mix=[{code:"a",name:"카페",count:4,share_pct:40},{code:"b",name:"백반/한정식",count:6,share_pct:60}];
 assert.equal(competitionPageTitle({total:10,category_mix}),"백반/한정식 비중이 60%로 가장 높습니다");
 assert.equal(category_mix[0].name,"카페");
 assert.match(competitionPageTitle(),/자료/);
 assert.match(competitionPageTitle({total:0,category_mix:[]}),/확인된 매장이 없습니다/);
});
test("시간대 장표는 표지의 매출수준 제목 대신 해당 시간대의 관측값을 쓴다",()=>{
 const sl:AreaSlots={rows:[{label:"점심",sales:45,pilot:30,flpop:null},{label:"저녁",sales:55,pilot:70,flpop:null}],hasPilot:true,pilotLabel:"비교 평균",hasFloating:false,text:"",facts:[],take:""};
 assert.equal(slotsPageTitle(sl),"점심 매출 비중이 평균보다 15%p 높습니다");
 assert.equal(slotsPageTitle({...sl,hasPilot:false}),"저녁에 매출의 55%가 몰립니다");
 assert.match(slotsPageTitle({...sl,rows:[]}),/자료/);
});
