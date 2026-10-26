// 입지 영향력 화면의 문장 만들기 — 서버(location_influence.py)가 보낸 값을 사람이 읽는 문장으로 바꾼다.
// 다른 모듈을 import 하지 않는 순수 함수(tests/locationText.test.ts).

export interface EffectInput {
  label: string;
  pct: number;
  pct_lo: number;
  pct_hi: number;
  significant: boolean;
  direction: "positive" | "negative";
  /** 0/1 요인(없음→있음)이면 true */
  binary: boolean;
}

const signed = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;

/** 관계 문장. 95% 구간이 0 을 포함하면(significant=false) '뚜렷한 관계 없음'으로 쓰고, 방향·크기를 단정하지 않는다. 인과 표현은 쓰지 않는다. */
export function effectSentence(f: EffectInput): string {
  const range = `95% 구간 ${signed(f.pct_lo)} ~ ${signed(f.pct_hi)}`;
  if (!f.significant) return `뚜렷한 관계를 찾지 못했어요(${range}).`;
  const dir = f.direction === "positive" ? "높은" : "낮은";
  const cond = f.binary ? "없는 상권보다 있는 상권의" : "값이 표준편차 1만큼 클 때";
  return `${cond} 점포당 추정매출이 약 ${signed(f.pct)} ${dir} 경향(${range}).`;
}

/** 같은 업종 상권 중 위치. percentile 은 '나보다 값이 작거나 같은 상권 비율(0~100)'. */
export function percentileText(percentile: number | null): string {
  if (percentile === null) return "비교 불가";
  if (percentile >= 50) return `상위 ${Math.max(1, 100 - percentile)}%`;
  return `하위 ${Math.max(1, percentile)}%`;
}

/** 반경 라벨 — 1000m 는 1km. */
export function radiusLabel(m: number): string {
  return m >= 1000 ? `${m / 1000}km` : `${m}m`;
}

/** 요인 값 표시 — 10 미만은 소수 한 자리(앵커 평균 1.6곳이 2곳으로 보이지 않게), 그 이상은 정수. 0/1 요인은 있음·없음. */
export function factorValueText(value: number | null, unit: string, binary: boolean): string | null {
  if (value === null) return null;
  if (binary) return value >= 1 ? "있음" : "없음";
  const n = Math.abs(value) < 10 ? value.toFixed(1) : Math.round(value).toLocaleString("ko-KR");
  return unit ? `${n}${unit}` : n;
}

/** 반경 안 점포 수의 단순 밀도 — 수 ÷ 원의 넓이(π·r²)를 km² 당으로 환산한다. 반경 안이 전부 상업지라는 가정이 없는 단순 나눗셈이며 새 통계가 아니다. */
export function densityPerKm2(count: number, radiusM: number): number | null {
  if (!Number.isFinite(count) || !Number.isFinite(radiusM) || radiusM <= 0) return null;
  return count / ((Math.PI * radiusM * radiusM) / 1_000_000);
}

export function densityText(count: number, radiusM: number): string {
  const d = densityPerKm2(count, radiusM);
  if (d === null) return "자료 없음";
  return `1km²당 ${d >= 100 ? Math.round(d).toLocaleString("ko-KR") : d.toFixed(1)}곳`;
}
