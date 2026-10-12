// 지도의 매장 점이 '지금 어떤 역할인지'(선택·마우스 올림·같은 비교 단위/업종·그 외)와 그에 따른 모양.
// 색에만 기대지 않도록 크기·테두리·투명도로도 구분한다. 다른 모듈을 import 하지 않는 순수 함수(tests/pointStyle.test.ts).

export type PointRole = "selected" | "hovered" | "peer" | "other" | "plain";

export interface PointContext {
  selectedId: string | null;
  hoveredId: string | null;
  /** 선택한 매장과 같은 비교 단위·같은 업종의 매장 id. 아직 모르면(조회 중·없음) null */
  peerIds: ReadonlySet<string> | null;
}

/** 선택 매장이 있고 비교 대상을 알면 peer/other 로 나누고, 모르면 모두 plain(원래 모양)으로 둔다 — 모르는 걸 '그 외'로 흐리게 하지 않는다. */
export function pointRole(id: string, ctx: PointContext): PointRole {
  if (id === ctx.selectedId) return "selected";
  if (id === ctx.hoveredId) return "hovered";
  if (ctx.selectedId === null || ctx.peerIds === null) return "plain";
  return ctx.peerIds.has(id) ? "peer" : "other";
}

export interface PointLook {
  /** 지름(px) — 테두리 포함(border-box) */
  size: number;
  /** 흰 테두리 바깥에 두르는 링 색(없으면 null) */
  ring: string | null;
  ringWidth: number;
  opacity: number;
  zIndex: number;
}

export function pointLook(role: PointRole, colors: { selectedRing: string; peerRing: string }): PointLook {
  switch (role) {
    case "selected":
      return { size: 26, ring: colors.selectedRing, ringWidth: 4, opacity: 1, zIndex: 7 };
    case "hovered":
      return { size: 22, ring: colors.selectedRing, ringWidth: 3, opacity: 1, zIndex: 6 };
    case "peer":
      return { size: 16, ring: colors.peerRing, ringWidth: 3, opacity: 1, zIndex: 4 };
    case "other":
      return { size: 12, ring: null, ringWidth: 0, opacity: 0.3, zIndex: 3 };
    default:
      return { size: 16, ring: null, ringWidth: 0, opacity: 1, zIndex: 3 };
  }
}
