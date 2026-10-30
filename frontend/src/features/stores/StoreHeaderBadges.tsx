import type { StoreBasic } from "../../lib/apiClient";
import { useAreaCharacter } from "../food/useFood";
import { SummaryTypeBadge } from "../area/SummaryType";
import { FS } from "../../lib/typography";

/** 매장 자체가 아닌 소속 지역 통계의 상권 유형을 표시한다. */
export function StoreHeaderBadges({store}:{store:StoreBasic}) {
  const level=store.trdar?"trdar":"dong";
  const code=store.trdar?.code ?? store.adong_cd;
  const character=useAreaCharacter(level,code,null,null);
  return <div className="area-header-badges" aria-label="소속 지역 유형과 매장 업종">
    {character.data && <span title={`소속 ${store.trdar?.name ?? store.dong} 기준`}><SummaryTypeBadge data={character.data}/></span>}
    <span style={{display:"inline-flex",alignItems:"center",borderRadius:24,padding:"6px 13px",background:"#F1F5F9",border:"1px solid #E2E8F0",color:"#334155",fontSize:FS.cardTitle,fontWeight:700,lineHeight:1.4}}>{store.category.scls}</span>
  </div>;
}
