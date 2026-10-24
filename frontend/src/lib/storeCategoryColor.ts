/** 지도의 옅은 배경 위에서 구별되는 고대비 색. 구성 그래프와 지도가 같은 색을 쓴다. */
const COLORS=["#0057E7","#E6005C","#00823B","#F07800","#7800C8","#006C80","#962B00","#242424","#B00028","#577C00","#005399","#8C4500"];
const NAMED:Record<string,string>={"경양식":"#0057E7","파스타/스테이크":"#F07800","기타 서양식 음식점":"#00823B","패밀리레스토랑":"#E6005C"};
export function storeCategoryColor(name:string, names?:string[]):string {
  if(NAMED[name])return NAMED[name];
  if(names){
    const rest=[...new Set(names)].filter(n=>!NAMED[n]).sort((a,b)=>a.localeCompare(b,"ko"));
    const reserved=new Set(names.map(n=>NAMED[n]).filter(Boolean));
    const available=COLORS.filter(c=>!reserved.has(c));
    return available[Math.max(0,rest.indexOf(name))%available.length];
  }
  let hash=0;for(const char of name.normalize("NFC"))hash=(hash*31+char.charCodeAt(0))>>>0;
  return COLORS[hash%COLORS.length];
}
export function storeCategoryLegend(points:{category:string}[]):{name:string;count:number}[]{
  const counts=new Map<string,number>();
  for(const point of points)counts.set(point.category,(counts.get(point.category)??0)+1);
  return [...counts].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,"ko"));
}
