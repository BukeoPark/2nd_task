import type { ReactNode } from "react";
import { COMPETE_ICON, LOCATION_ICON, STORE_ICON } from "../../components/railIcons";
import { TabRail, type RailItem } from "../../components/TabRail";
import { GROUP_IDS, type GroupId } from "../../lib/panelGroups";
import { SCOPE_GROUP, SCOPE_STYLE } from "../../lib/scope";

const ICON: Record<GroupId, ReactNode> = {
  store: STORE_ICON,
  radius: LOCATION_ICON,
  compete: COMPETE_ICON,
  area: <path d="M3 6l5-3 4 3 5-2v11l-5 2-4-3-5 3z" />,
  mine: <path d="M5 3h7l3 3v11H5zM12 3v3h3M8 10h4M8 13h4" />,
};

const ITEMS: RailItem[] = GROUP_IDS.map((g) => ({ id: g, label: SCOPE_GROUP[g], icon: ICON[g], ...SCOPE_STYLE[g] }));

/** 매장 상세의 묶음 메뉴(이 매장 / 주변 환경 / 경쟁 / 상권 / 내 가게). groups 의 순서가 메뉴 순서다(모드마다 다르다). */
export function GroupRail({ active, onChange, orientation, groups = GROUP_IDS }: { active: GroupId; onChange: (g: GroupId) => void; orientation: "vertical" | "horizontal"; groups?: GroupId[] }) {
  return <TabRail items={groups.map((g) => ITEMS.find((it) => it.id === g) as RailItem)} active={active} onChange={(id) => onChange(id as GroupId)} orientation={orientation} ariaLabel="매장 정보 묶음" wrapLabels />;
}
