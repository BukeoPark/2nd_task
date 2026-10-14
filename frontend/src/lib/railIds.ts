import type { GroupId } from "./panelGroups";

/** 레일 탭과 그 패널을 서로 가리키는 id (aria-controls / aria-labelledby). */
export const railTabId = (g: GroupId) => `rail-tab-${g}`;
export const railPanelId = (g: GroupId) => `rail-panel-${g}`;
