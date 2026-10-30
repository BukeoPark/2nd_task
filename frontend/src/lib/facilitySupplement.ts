import CATALOG from "./facilitySupplement.json" with { type: "json" };
import type { FacilityAccess } from "./apiClient";

export function facilityDistance(a: {lon:number;lat:number}, b: {lon:number;lat:number}): number {
  const rad = Math.PI / 180;
  const v = Math.sin((b.lat-a.lat)*rad/2)**2 + Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin((b.lon-a.lon)*rad/2)**2;
  return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(v), Math.sqrt(1-v)));
}
function inRing(p: {lon:number;lat:number}, ring: number[][]): boolean {
  let inside = false;
  for (let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const [x,y]=ring[i], [u,v]=ring[j];
    if ((y>p.lat)!==(v>p.lat) && p.lon<(u-x)*(p.lat-y)/(v-y)+x) inside=!inside;
  }
  return inside;
}
export function supplementalAreaFacilities(boundary: {type:string;coordinates:unknown}|null|undefined) {
  if (!boundary) return [];
  const polys = boundary.type === "Polygon" ? [boundary.coordinates as number[][][]] : boundary.type === "MultiPolygon" ? boundary.coordinates as number[][][][] : [];
  return CATALOG.filter(p => polys.some(poly => poly.length && inRing(p,poly[0]) && !poly.slice(1).some(hole=>inRing(p,hole))));
}
export function supplementRadiusFacilities(data: FacilityAccess|undefined, center: {lon:number;lat:number}): FacilityAccess|undefined {
  if (!data || data.status !== "ok") return data;
  const added = CATALOG.map((p,i)=>({...p, facility_id:`supplement-${i}`, type:p.category === "시장" ? "market" as const : "mid_hospital" as const, distance_m:facilityDistance(center,p)})).filter(p=>p.distance_m<=data.radius_m);
  const facilities = [...data.facilities.filter(x=>x.type!=="market" && x.type!=="mid_hospital"), ...added.map(p=>({ ...p, subtype:null, status:"unknown",status_label:p.source,source_name:p.source,source_type:"official",coordinate_source:"official",reference_date:null,usage_permission_status:"confirmed",coverage_status:"pilot",attribution:p.source }))];
  const by_type = {...data.selected.by_type};
  const incomplete = !data.selected.extent_complete || data.scope.boundary_distance_m === null || data.scope.boundary_distance_m < data.radius_m;
  for (const type of ["market","mid_hospital"] as const) {
    const rows=facilities.filter(p=>p.type===type).sort((a,b)=>a.distance_m-b.distance_m);
    by_type[type]={type,label:type==="market"?"시장":"중형병원",count:rows.length,count_state:incomplete?(rows.length?"lower_bound":"incomplete_zero"):(rows.length?"ok":"zero"),nearest:rows[0]??null,reliable:!incomplete,incomplete,reason:incomplete?"파일럿 지역 밖 시설은 누락될 수 있습니다.":null};
  }
  return {...data,attributions:[...new Set([...data.attributions,"서울시 전통시장 상권 대표 좌표 · 의료 인허가 영업 기록"])],facilities,selected:{...data.selected,by_type}};
}
