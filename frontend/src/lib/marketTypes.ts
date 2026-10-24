/** 현재 세부 상권 원천(서울시)의 공식 유형을 쉬운 설명으로 표시한다. */
export const MARKET_TYPES = [
 { code: "A", label: "골목상권", icon: "home", color: "#0F766E", bg: "#ECFDF5", description: "주택가 골목의 생활밀착 상점" },
 { code: "D", label: "발달상권", icon: "building", color: "#1D4ED8", bg: "#EFF6FF", description: "여러 업종이 모인 중심 상업지역" },
 { code: "R", label: "전통시장", icon: "store", color: "#B45309", bg: "#FFFBEB", description: "상설·정기시장이 형성된 곳" },
 { code: "U", label: "관광특구", icon: "pin", color: "#7C3AED", bg: "#F5F3FF", description: "관광 활성화를 위해 지정한 곳" },
] as const;
export function marketType(type: string) {
 return MARKET_TYPES.find(t => t.code === type || t.label === type || (type === "전통시장상권" && t.code === "R")) ?? null;
}
