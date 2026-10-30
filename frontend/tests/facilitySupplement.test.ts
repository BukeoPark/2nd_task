import test from "node:test";
import assert from "node:assert/strict";
import {facilityDistance,supplementalAreaFacilities,supplementRadiusFacilities} from "../src/lib/facilitySupplement.ts";
import {displayCategory} from "../src/lib/areaFacilityNames.ts";
test("시설 거리는 직선거리이며 같은 좌표는 0",()=>{assert.equal(facilityDistance({lon:127,lat:37},{lon:127,lat:37}),0);assert.ok(facilityDistance({lon:127,lat:37},{lon:127,lat:38})>110000);});
test("경계 없는 지역에는 시장을 임의로 넣지 않는다",()=>assert.deepEqual(supplementalAreaFacilities(null),[]));
test("시장은 포함하고 의원과 약국은 제외",()=>{assert.equal(displayCategory({name:"시장",category:"시장"}),"시장");assert.equal(displayCategory({name:"의원",category:"병원"}),null);assert.equal(displayCategory({name:"약국",category:"약국"}),null);assert.equal(displayCategory({name:"병원",category:"중형병원"}),"중형병원");});

test("반경 보완은 범위 안 시설만 추가하고 같은 응답에 다시 적용해도 중복되지 않는다",()=>{
  const boundary={type:"Polygon",coordinates:[[[124,33],[132,33],[132,39],[124,39],[124,33]]]};
  const market=supplementalAreaFacilities(boundary).find(p=>p.category==="시장")!;
  assert.ok(market);
  const input={status:"ok",radius_m:500,selected:{radius_m:500,extent_complete:true,by_type:{}},facilities:[],official_only:true,includes_unconfirmed:false,attributions:[],caveats:[],scope:{distance_to_pilot_m:0,boundary_distance_m:1000,buffer_m:1100}} as any;
  const result=supplementRadiusFacilities(input,market)!;
  assert.equal(result.status,"ok");
  if(result.status!=="ok")return;
  assert.ok(result.facilities.some(p=>p.type==="market"));
  assert.ok(result.facilities.every(p=>p.distance_m<=500));
  assert.deepEqual(supplementRadiusFacilities(result,market),result);
  assert.equal(input.facilities.length,0);
});
