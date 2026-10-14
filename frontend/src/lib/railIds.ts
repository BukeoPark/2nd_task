/** 레일 탭과 그 패널을 서로 가리키는 id (aria-controls / aria-labelledby). 매장 상세는 prefix 없이, 다른 패널은 prefix 로 구분한다. */
export const railTabId = (id: string, prefix = "") => `rail-tab-${prefix}${id}`;
export const railPanelId = (id: string, prefix = "") => `rail-panel-${prefix}${id}`;
