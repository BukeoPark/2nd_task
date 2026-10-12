// '비교 기준' 안내 문구 — 이 매장의 비교 숫자가 어떤 단위(상권·행정동)와 어떤 업종을 기준으로 하는지, 왜 그 단위인지.
// 같은 모양의 점도 비교 단위·업종이 다를 수 있어서, 그 차이를 요약 맨 위에서 말해 준다.
// 다른 모듈을 import 하지 않는 순수 함수(tests/compareBasis.test.ts).

export interface CompareBasisInput {
  level: "trdar" | "dong";
  unitName: string;
  unitType: string | null; // 골목상권·발달상권 등. 행정동이면 null
  fallbackReason: string | null; // 상권이 아니라 행정동으로 비교하는 이유
  svcNm: string; // 서울시 업종 (예: 분식전문점)
  sclsNm: string | null; // 이 매장의 소상공인 세부 업종 (예: 김밥/만두/분식)
  /** 같은 비교 단위·업종의 상가정보 매장 수. 아직 모르면 null */
  peerCount: number | null;
}

export interface CompareBasis {
  unit: string;
  why: string;
  category: string;
  map: string | null;
}

export function compareBasis(i: CompareBasisInput): CompareBasis {
  const kind = i.unitType ?? (i.level === "trdar" ? "상권" : "행정동");
  const category =
    i.sclsNm && i.sclsNm !== i.svcNm
      ? `서울시 업종 '${i.svcNm}' 전체 — 이 매장의 세부 업종은 '${i.sclsNm}'이지만 매출은 업종 전체 값이에요`
      : `서울시 업종 '${i.svcNm}' 전체`;
  return {
    unit: `${i.unitName} (${kind})`,
    why: i.fallbackReason ?? "매장이 서울시 지정 상권 안에 있어 상권 기준으로 비교해요.",
    category,
    map:
      i.peerCount === null
        ? null
        : `같은 비교 단위·업종의 상가정보 매장 ${i.peerCount.toLocaleString("ko-KR")}곳을 지도에서 강조해요. 점포당 평균의 분모인 서울시 점포 수와는 센 기준이 달라 숫자가 다를 수 있어요.`,
  };
}
