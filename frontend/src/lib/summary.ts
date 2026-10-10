// 매장 상세 맨 위 '한눈에 보기' — 동네 매출 비교 응답에서 사실 몇 줄만 뽑는다.
// 점수·좋고 나쁨 판정은 만들지 않고, 순위와 '비교 단위 중앙값보다 높음/낮음/비슷' 같은 방향만 말한다.
// 다른 모듈을 import 하지 않는 순수 함수(tests/summary.test.ts).

export interface SummaryInput {
  peerLabel: string; // "파일럿 구 상권" 등 비교 대상 이름
  rank: number | null;
  peerCount: number | null;
  perStoreYoyPct: number | null;
  churn: {
    status: string;
    message: string | null;
    openRate: number | null; // 0~1
    closeRate: number | null;
    peerMedianOpen: number | null;
    peerMedianClose: number | null;
  } | null;
  floating: { rank: number; peerCount: number } | null;
  workplace: { total: number | null; peerMedian: number | null } | null;
  resident: { total: number | null; peerMedian: number | null } | null;
}

export interface SummaryLine {
  key: string;
  text: string;
}

export type Direction = "higher" | "lower" | "similar";

/** 매출 증감이 이 값(%) 안쪽이면 '거의 같아요'. */
export const YOY_FLAT_PCT = 1;
/** 개업률·폐업률이 중앙값과 이 값(%p) 이상 차이 나야 높음·낮음으로 말한다. */
export const RATE_DIFF_PP = 2;
/** 인구가 중앙값의 이 배수 이상이면 많음, 역수 이하이면 적음. */
export const POP_RATIO = 1.5;

export function rateDirection(mine: number | null, median: number | null): Direction | null {
  if (mine === null || median === null || !Number.isFinite(mine) || !Number.isFinite(median)) return null;
  const diffPp = (mine - median) * 100;
  return diffPp >= RATE_DIFF_PP ? "higher" : diffPp <= -RATE_DIFF_PP ? "lower" : "similar";
}

export function popDirection(mine: number | null, median: number | null): Direction | null {
  if (mine === null || median === null || !Number.isFinite(mine) || !Number.isFinite(median) || median <= 0) return null;
  const ratio = mine / median;
  return ratio >= POP_RATIO ? "higher" : ratio <= 1 / POP_RATIO ? "lower" : "similar";
}

const POP_MID: Record<Direction, string> = { higher: "중앙값보다 많고", lower: "중앙값보다 적고", similar: "중앙값 수준이고" };
const POP_END: Record<Direction, string> = { higher: "중앙값보다 많아요", lower: "중앙값보다 적어요", similar: "중앙값 수준이에요" };

function pct0(v: number): string {
  return `${Math.round(v * 100)}%`;
}

function signed(v: number): string {
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
}

function rateLine(key: string, name: string, mine: number | null, median: number | null): SummaryLine | null {
  if (mine === null || !Number.isFinite(mine)) return null;
  const dir = rateDirection(mine, median);
  const base = `최근 1년 ${name}은 연 ${pct0(mine)}`;
  if (dir === null || median === null) return { key, text: `${base}예요.` };
  const tail = dir === "similar" ? "수준이에요" : dir === "higher" ? "보다 높아요" : "보다 낮아요";
  return { key, text: `${base}로, 비교 단위 중앙값(${pct0(median)})${dir === "similar" ? " " : ""}${tail}.` };
}

export function buildSummary(input: SummaryInput): SummaryLine[] {
  const lines: SummaryLine[] = [];

  if (input.rank !== null && input.peerCount !== null && input.peerCount > 0 && input.rank >= 1) {
    const top = Math.max(1, Math.round((input.rank / input.peerCount) * 100));
    lines.push({ key: "sales", text: `점포당 월평균 추정매출은 ${input.peerLabel} ${input.peerCount}곳 중 ${input.rank}위(상위 ${top}%)예요.` });
  }

  if (input.perStoreYoyPct !== null && Number.isFinite(input.perStoreYoyPct)) {
    const y = input.perStoreYoyPct;
    const word = Math.abs(y) < YOY_FLAT_PCT ? "거의 같아요" : y > 0 ? "늘었어요" : "줄었어요";
    lines.push({ key: "yoy", text: `전년 같은 분기와 비교하면 점포당 매출이 ${signed(y)}로 ${word}.` });
  }

  const c = input.churn;
  if (c) {
    if (c.status === "ok" || c.status === "partial") {
      const close = rateLine("close", "폐업률", c.closeRate, c.peerMedianClose);
      const open = rateLine("open", "개업률", c.openRate, c.peerMedianOpen);
      if (close) lines.push(close);
      if (open) lines.push(open);
    } else if (c.message) {
      // 계산하지 못한 이유를 그대로 말한다 — 0건으로 읽히지 않게.
      lines.push({ key: "churn_missing", text: `개업·폐업: ${c.message}` });
    }
  }

  if (input.floating && input.floating.peerCount > 0) {
    lines.push({ key: "floating", text: `유동인구 1만 명당 매출은 ${input.floating.peerCount}곳 중 ${input.floating.rank}위예요.` });
  }

  const work = input.workplace ? popDirection(input.workplace.total, input.workplace.peerMedian) : null;
  const res = input.resident ? popDirection(input.resident.total, input.resident.peerMedian) : null;
  if (work && res) {
    const text = work === res ? `직장인구와 상주인구 모두 ${POP_END[work]}.` : `직장인구는 ${POP_MID[work]} 상주인구는 ${POP_END[res]}.`;
    lines.push({ key: "demand", text });
  } else if (work) lines.push({ key: "demand", text: `직장인구는 ${POP_END[work]}.` });
  else if (res) lines.push({ key: "demand", text: `상주인구는 ${POP_END[res]}.` });

  return lines;
}
