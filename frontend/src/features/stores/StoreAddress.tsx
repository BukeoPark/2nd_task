import { AppIcon } from "../../components/DataVisuals";
import { SourceNote } from "../../components/Notice";
import { PK } from "../../lib/panelStyle";
import type { StoreBasic } from "../../lib/apiClient";
import { FS } from "../../lib/typography";

/** 가게 이름 바로 아래에 두는 주소 한 줄(핀 + 주소·건물명 + '?' 출처) — 어느 메뉴에서나 이름과 함께 보인다. */
export function StoreAddress({ store }: { store: StoreBasic }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: FS.body, color: PK.sub, lineHeight: 1.5 }}>
      <span style={{ marginTop: 3, flexShrink: 0 }}><AppIcon name="pin" /></span>
      <span style={{ minWidth: 0 }}>
        {store.address ?? "주소 정보 없음"}{store.building ? ` (${store.building})` : ""}
        <SourceNote title={store.source.title} reference={store.source.reference} />
      </span>
    </div>
  );
}
