import { AppIcon } from "../../components/DataVisuals";
import { Block } from "../../components/PanelKit";
import { InfoTip } from "../../components/InfoTip";
import type { OverviewTrdar } from "../../lib/apiClient";
import { MARKET_TYPES, marketType } from "../../lib/marketTypes";
import { FS } from "../../lib/typography";

export function SubmarketList({ areas, onSelect }: { areas: OverviewTrdar[]; onSelect: (area: OverviewTrdar) => void }) {
 return <>
  <Block title={<>상권 유형 한눈에 <InfoTip label="상권 유형 기준">현재 목록은 서울시 상권분석서비스의 분류입니다. 행정동은 행정구역이고, 아래 네 가지는 상권 유형입니다. 발달상권이라는 이름이 매출 성장이나 창업 적합성을 뜻하지는 않습니다.</InfoTip></>}>
   <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10, marginTop: 12 }}>
    {MARKET_TYPES.map(t => <div key={t.code} style={{ background: t.bg, border: `1px solid ${t.color}22`, borderRadius: 12, padding: 12 }}>
     <div style={{ display: "flex", alignItems: "center", gap: 6, color: t.color, fontSize: FS.body, fontWeight: 700 }}><AppIcon name={t.icon}/>{t.label}<span style={{ marginLeft: "auto", fontSize: FS.caption }}>{areas.filter(a => marketType(a.type)?.code === t.code).length}곳</span></div>
     <div style={{ marginTop: 6, color: "#4B5563", fontSize: FS.warn, lineHeight: 1.5, wordBreak: "keep-all" }}>{t.description}</div>
    </div>)}
   </div>
  </Block>
  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
   {areas.map(area => {
    const type = marketType(area.type);
    return <button type="button" key={area.code} onClick={() => onSelect(area)} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: 14, border: "1px solid #E5E7EB", borderRadius: 12, background: "white", color: "#111827", cursor: "pointer", textAlign: "left" }}>
     <span style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: type?.color ?? "#475569", background: type?.bg ?? "#F1F5F9" }}><AppIcon name={type?.icon ?? "pin"}/></span>
     <span style={{ minWidth: 0, flex: 1 }}>
      <span style={{ display: "block", fontSize: FS.body, fontWeight: 700, wordBreak: "keep-all" }}>{area.name}</span>
      <span style={{ display: "inline-flex", alignItems: "center", marginTop: 5, padding: "2px 8px", borderRadius: 6, background: type?.bg ?? "#F1F5F9", color: type?.color ?? "#475569", fontSize: FS.warn, fontWeight: 600 }}>{type?.label ?? area.type}</span>
     </span>
     <span style={{ color: "#6B7280", fontSize: FS.caption, textAlign: "right", flexShrink: 0, whiteSpace: "nowrap" }}>{area.overlap_pct >= 100 ? "전체 포함" : `일부 포함 ${area.overlap_pct}%`}</span>
     <svg width="16" height="20" viewBox="0 0 16 20" fill="none" aria-hidden="true"><path d="m5 4 6 6-6 6" stroke="#64748B" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </button>;
   })}
  </div>
 </>;
}
