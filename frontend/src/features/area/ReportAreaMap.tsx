import { storeCategoryColor, storeCategoryLegend } from "../../lib/storeCategoryColor";
import { useEffect, useRef, useState } from "react";
import type { ReportExtras } from "../../lib/apiClient";
import { loadKakaoMaps } from "../../lib/kakaoLoader";
import { railLineBadge, splitRailLines } from "../../lib/railLines";
import { RF } from "../stores/report/reportTypography";

const COLORS:Record<string,string>={"공공기관":"#475569","은행":"#2563EB","초등학교":"#D97706","중학교":"#EA580C","고등학교":"#C2410C","대학교":"#9A3412","유치원":"#F59E0B","종합병원":"#BE123C","병원":"#E11D48","약국":"#F43F5E","전통시장":"#7C3AED","백화점":"#9333EA","복합쇼핑몰":"#A21CAF","쇼핑몰":"#A21CAF","대형마트":"#6D28D9","아울렛":"#C026D3","문화시설":"#0891B2","영화관":"#0E7490","숙박시설":"#64748B","스타벅스":"#00754A","다이소":"#E60020","올리브영":"#82A51A"};
const color=(category:string)=>COLORS[category]??"#0F766E";
type MapData=NonNullable<ReportExtras["map"]>;
type Position={x:number;y:number};

/** 서비스와 같은 카카오 지도 위에 경계와 분류별 위치를 별도 레이어로 표시한다. */
export function ReportAreaMap({data,name,showCounts=true,categoryNames}:{data:MapData;name:string;showCounts?:boolean;categoryNames?:string[]}) {
  const base=useRef<HTMLDivElement>(null);
  const [projection,setProjection]=useState<{rings:Position[][];points:Position[];stations:Position[];landmarks:Position[];width:number;height:number;zoom:number;cx:number;cy:number}|null>(null);
  const [error,setError]=useState(false);
  useEffect(()=>{
    let cancelled=false;
    let observer:ResizeObserver|undefined;
    let cleanup=()=>{};
    if(!data.boundary||!base.current)return;
    const polygons=(data.boundary.type==="Polygon"?[data.boundary.coordinates]:data.boundary.coordinates) as number[][][][];
    const rings=polygons.flat();
    loadKakaoMaps().then(kakao=>{
      if(cancelled||!base.current)return;
      const el=base.current;
      const bounds=new kakao.maps.LatLngBounds();
      rings.flat().forEach(p=>bounds.extend(new kakao.maps.LatLng(p[1],p[0])));
      const map=new kakao.maps.Map(el,{center:new kakao.maps.LatLng(rings[0][0][1],rings[0][0][0]),level:5,draggable:false,scrollwheel:false,disableDoubleClickZoom:true});
      const update=()=>{
        if(cancelled)return;
        const proj=map.getProjection();
        const project=(lon:number,lat:number):Position=>{const p=proj.containerPointFromCoords(new kakao.maps.LatLng(lat,lon));return{x:p.x,y:p.y};};
        const projectedRings=rings.map(r=>r.map(p=>project(p[0],p[1])));
        const vertices=projectedRings.flat();
        const minX=Math.min(...vertices.map(p=>p.x)),maxX=Math.max(...vertices.map(p=>p.x));
        const minY=Math.min(...vertices.map(p=>p.y)),maxY=Math.max(...vertices.map(p=>p.y));
        // 카카오 지도의 단계별 배율 사이에서도 경계가 칸을 채우도록 남은 여백을 보정한다.
        const zoom=Math.min((el.clientWidth-24)/Math.max(maxX-minX,1),(el.clientHeight-24)/Math.max(maxY-minY,1));
        setProjection({zoom,cx:(minX+maxX)/2,cy:(minY+maxY)/2,rings:projectedRings,points:data.points.map(p=>project(p.lon,p.lat)),stations:(data.stations??[]).map(p=>project(p.lon,p.lat)),landmarks:(data.landmarks??[]).map(p=>project(p.lon,p.lat)),width:el.clientWidth,height:el.clientHeight});
      };
      const fit=()=>{map.relayout();map.setBounds(bounds,12,12,12,12);update();};
      kakao.maps.event.addListener(map,"idle",update);
      observer=new ResizeObserver(fit);observer.observe(el);
      window.addEventListener("beforeprint",fit);window.addEventListener("afterprint",fit);
      cleanup=()=>{kakao.maps.event.removeListener(map,"idle",update);window.removeEventListener("beforeprint",fit);window.removeEventListener("afterprint",fit);};
      fit();
    }).catch(()=>{if(!cancelled)setError(true);});
    return()=>{cancelled=true;observer?.disconnect();cleanup();};
  },[data]);
  if(!data.boundary)return <p>지역 경계 자료 없음</p>;
  const facility=data.kind==="facilities";
  const brands=["스타벅스","다이소","올리브영"];
  const ordered=storeCategoryLegend(data.points);
  const paletteNames=categoryNames??ordered.map(c=>c.name);
  const legend=facility?ordered.filter(c=>!brands.includes(c.name)).map(c=>c.name).sort():ordered.map(c=>c.name);
  const brandCount=(c:string)=>data.points.filter(p=>p.category===c).length;
  const categories=data.categories??[];
  return <section aria-label={`${name} 경계 지도`}>
    <div className="irp-report-map-canvas" style={{height:420,position:"relative",background:"#F4F7FA",border:"1px solid #DDE3EB",overflow:"hidden"}}>
      <div style={{position:"absolute",inset:0,transformOrigin:"0 0",transform:projection?`translate(${projection.width/2}px,${projection.height/2}px) scale(${projection.zoom}) translate(${-projection.cx}px,${-projection.cy}px)`:undefined}}>
      <div ref={base} style={{position:"absolute",inset:0,opacity:.48}}/>
      {projection&&<svg viewBox={`0 0 ${projection.width} ${projection.height}`} aria-label={`${name} 경계와 시설 위치`} role="img" style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none"}}>
        <path d={projection.rings.map(r=>r.map((p,j)=>`${j?"L":"M"}${p.x},${p.y}`).join(" ")+"Z").join(" ")} fill="#315ED5" fillOpacity=".035" fillRule="evenodd" stroke="#315ED5" strokeWidth={2/projection.zoom}/>
        {projection.points.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r={6/projection.zoom} fill={facility?color(data.points[i].category):storeCategoryColor(data.points[i].category,paletteNames)} stroke="white" strokeWidth={1.5/projection.zoom} fillOpacity={1}><title>{data.points[i].name} · {data.points[i].category}</title></circle>)}
        {projection.stations.map((p,i)=>{
          const st=data.stations![i];const lines=splitRailLines(st.lines);const label=`${st.name.replace(/역$/,"")}역`;
          const labelWidth=lines.length*22+label.length*13+14;
          const left=Math.max(4,Math.min(p.x-10,projection.width-labelWidth-4));
          return <g key={`station-${st.name}`} transform={`translate(${left},${Math.max(24,p.y)}) scale(${1/projection.zoom})`}>
            <rect x="-4" y="-13" width={labelWidth} height="26" rx="5" fill="white" fillOpacity=".94" stroke="#D0D5DD"/>
            {lines.map((line,j)=>{const b=railLineBadge(line);return <g key={line} transform={`translate(${j*22+9},0)`}><circle r="10" fill={b.color}/><text textAnchor="middle" dominantBaseline="central" fontSize={b.label.length>1?8:12} fontWeight="700" fill={["#BDB092","#F5A200","#B7C452","#77C4A3"].includes(b.color)?"#172033":"white"}>{b.label}</text></g>;})}
            <text x={lines.length*22} y="1" dominantBaseline="central" fontSize="12" fontWeight="700" fill="#1C2530">{label}</text>
          </g>;
        })}
        {projection.landmarks.map((p,i)=>{
          const place=data.landmarks![i];const w=Math.min(220,place.name.length*13+30);
          const left=Math.max(4,Math.min(p.x+10,projection.width-w-4));const top=Math.max(20,Math.min(p.y-28,projection.height-24));
          return <g key={`landmark-${i}`} transform={`translate(${p.x},${p.y}) scale(${1/projection.zoom}) translate(${-p.x},${-p.y})`}><path d={`M${p.x},${p.y-14} L${p.x+9},${p.y-5} L${p.x},${p.y+5} L${p.x-9},${p.y-5} Z`} fill="#7C3AED" stroke="white" strokeWidth="2"/>
            <rect x={left} y={top-13} width={w} height="25" rx="4" fill="white" stroke="#7C3AED"/>
            <text x={left+8} y={top} dominantBaseline="central" fontSize="12" fontWeight="700" fill="#6D28D9">◆ {place.name}</text><title>{place.source}</title></g>;
        })}
      </svg>}
      </div>
      <a href="https://map.kakao.com/" target="_blank" rel="noreferrer" style={{position:"absolute",bottom:4,left:6,fontSize:RF.caption,color:"#475569",background:"#FFFFFFD9",padding:"1px 4px"}}>© Kakao</a>
      {error&&<p style={{position:"absolute",inset:20}}>지도를 불러오지 못했습니다. 보고서를 다시 열어 주세요.</p>}
    </div>
    <div className="irp-map-legend" aria-label="지도 범례" style={{display:"flex",flexWrap:"wrap",gap:"6px 14px",fontSize:RF.caption,marginTop:10}}>
      {legend.map(c=><span key={c} style={{display:"inline-flex",alignItems:"center",gap:5}}><span style={{width:10,height:10,borderRadius:"50%",background:facility?color(c):storeCategoryColor(c,paletteNames)}}/>{facility?c:`${c}(${data.points.filter(p=>p.category===c).length})`}</span>)}
      {facility&&brands.map(c=><span key={c} style={{display:"inline-flex",alignItems:"center",gap:5}}><span style={{width:10,height:10,borderRadius:"50%",background:color(c)}}/>{c}({brandCount(c)})</span>)}
      {(data.stations?.length??0)>0&&<span>호선 배지: 지하철역</span>}
      {(data.landmarks?.length??0)>0&&<span style={{color:"#7C3AED"}}>◆ 대표 장소</span>}
    </div>
    {showCounts&&facility&&categories.length>0&&<div className="irp-map-facilities" style={{marginTop:16}}><div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:8,fontSize:RF.body}}>{categories.map(c=><div key={c.label} style={{background:"#F4F6F8",padding:"8px 10px"}}>{c.label} <b>{c.count.toLocaleString()}곳</b></div>)}</div></div>}
    <p style={{fontSize:RF.caption,color:"#667085",margin:"10px 0 0"}}>{facility?"지도는 좌표가 확인된 시설·브랜드, 아래 개수는 지역 경계별 집계 기준입니다.":`선택 업종 매장 ${data.points.length.toLocaleString()}곳 · 소상공인 상가정보 기준`}</p>
  </section>;
}
