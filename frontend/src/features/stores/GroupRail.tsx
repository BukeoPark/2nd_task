import type { ReactNode } from "react";
import { TabRail, type RailItem } from "../../components/TabRail";
import { GROUP_IDS, type GroupId } from "../../lib/panelGroups";
import { SCOPE_GROUP, SCOPE_STYLE } from "../../lib/scope";

const ICON: Record<GroupId, ReactNode> = {
  store: <path d="M3 9l1.5-5h11L17 9M4 9v8h12V9M8 17v-4h4v4" />,
  radius: (
    <>
      <circle cx="10" cy="10" r="7" />
      <circle cx="10" cy="10" r="2.5" />
    </>
  ),
  area: <path d="M3 6l5-3 4 3 5-2v11l-5 2-4-3-5 3z" />,
  mine: <path d="M5 3h7l3 3v11H5zM12 3v3h3M8 10h4M8 13h4" />,
};

const ITEMS: RailItem[] = GROUP_IDS.map((g) => ({ id: g, label: SCOPE_GROUP[g], icon: ICON[g], ...SCOPE_STYLE[g] }));

/** 매장 상세의 묶음 메뉴(이 매장 / 주변 / 상권 / 내 가게). */
export function GroupRail({ active, onChange, orientation }: { active: GroupId; onChange: (g: GroupId) => void; orientation: "vertical" | "horizontal" }) {
  return <TabRail items={ITEMS} active={active} onChange={(id) => onChange(id as GroupId)} orientation={orientation} ariaLabel="매장 정보 묶음" />;
}
