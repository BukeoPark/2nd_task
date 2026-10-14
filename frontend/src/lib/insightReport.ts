// 매장 '상권 인사이트 리포트' — 서비스가 이미 가진 값(동네 매출 비교·반경 인허가·입지 요인)을 4쪽짜리 읽을거리로 묶는다.
// 숫자는 API 값 그대로이고, 문장은 규칙으로만 만든다(데이터가 없으면 그 쪽·문장을 만들지 않는다). 원인을 단정하지 않고 '관측'과 '가능한 해석'만 쓴다.
// 점수·순위를 새로 만들지 않고, 리뷰·평점은 쓰지 않는다. 다른 모듈을 import 하지 않는 순수 함수(tests/insightReport.test.ts).

const fmt = (n: number) => Math.round(n).toLocaleString("ko-KR");
const man = (won: number) => won / 1e4;
const signed = (v: number, d = 1) => `${v > 0 ? "+" : ""}${v.toFixed(d)}%`;

// ── 입력: API 응답의 필요한 부분만(구조적으로 맞으면 그대로 넘길 수 있다) ──
interface Pct { value: number | null }
export interface BenchIn {
  status: string;
  svc_nm?: string;
  unit?: { label: string; name: string; type: string | null; peer_label: string };
  quarter_label?: string;
  per_store_month?: number | null;
  stores?: number;
  growth?: { yoy: { compare_label: string; total_sales: Pct; per_store: Pct }; qoq: { compare_label: string; per_store: Pct } };
  rank?: number;
  peer_count?: number;
  peers?: { name: string; per_store_month: number | null; stores: number }[];
  trend?: { quarter: string; label: string; per_store_month: number | null; stores: number | null }[];
  composition?: { group: string; items: { key: string; label: string; dong: number | null; pilot: number | null }[] }[];
  insights?: { group: string; label: string; gap_pctp: number }[];
  floating?: { flpop_yoy_pct: number | null; mix: { group: string; items: { key: string; label: string; flpop: number | null }[] }[] } | null;
  franchise_share?: { share: number | null; frc_stores: number; stores: number; peer_median: number | null } | null;
  churn?: { status: string; period: string; opened?: number; closed?: number; avg_stores?: number; open_rate?: number | null; close_rate?: number | null; peer_count?: number; peer_median_open?: number | null; peer_p75_open?: number | null; peer_median_close?: number | null; peer_p75_close?: number | null } | null;
  hinterland?: { workplace: { total: number; age_share: Record<string, number | null> } | null; peer_median: { workplace: number | null } } | null;
}
export interface NearbyIn {
  status: string;
  radius_m: number;
  trend?: { year: number; opened: number; closed: number | null; partial_year: boolean }[];
  closure_cohort?: { status: string; rate: number | null; numerator?: number; denominator?: number; horizon_years?: number };
  competitors?: { raw_count: number; open_confirmed_count: number; unconfirmed_count: number };
}
export interface LocIn {
  radius_metrics: { competitors: { same_category: { label: string; count: number; nearest_m: number | null } } };
  model: { status: string; useful?: boolean; cv?: { r2_full: number }; factors?: { key: string; label: string; pct: number; pct_lo: number; pct_hi: number; significant: boolean; binary: boolean }[] };
}
export interface ReportInput {
  store: { name: string; branch: string | null; category: string; dong: string; sigungu: string; areaName: string | null; areaKind: string | null };
  licenseAge: string | null;
  licenseState: string | null;
  anchors: { label: string; nearestM: number | null }[];
  bench: BenchIn | null;
  nearby: NearbyIn | null;
  loc: LocIn | null;
  /** 작성일 YYYY-MM-DD */
  today: string;
}

// ── 출력 ──
export interface Tile { label: string; value: string; note: string; tone: "plain" | "accent" | "neg" }
export interface Finding { title: string; body: string }
export interface LevelSection {
  me: number; median: number; ratio: number; hist: number[];
  rank: number | null; peerCount: number; bigRank: number | null; bigCount: number;
  trend: { q: string; v: number }[];
  yoyPerStore: number | null; yoyTotal: number | null; qoqPerStore: number | null; flpopYoy: number | null;
  storesFrom: number | null; storesNow: number | null;
  unitName: string; peerLabel: string; quarterLabel: string;
  text: string;
}
export interface SlotsSection {
  slots: { label: string; me: number; pilot: number; fl: number | null }[];
  hasFloating: boolean;
  text: string;
  workers: { total: number; median: number | null; ratio: number | null; age3040: number | null } | null;
  ages: { label: string; work: number | null; sales: number }[] | null;
  salesAge50: number | null; workAge50: number | null; salesAge3040: number | null;
  take: string;
}
export interface CompetitionSection {
  radiusM: number; sameCount: number | null; label: string; openConfirmed: number | null; unconfirmed: number | null; nearestM: number | null;
  franchise: { share: number; frc: number; stores: number; median: number | null } | null;
  churn: { opened: number; closed: number; avg: number; openRate: number | null; closeRate: number | null; medOpen: number | null; p75Open: number | null; medClose: number | null; p75Close: number | null; peers: number | null; period: string } | null;
  yearly: { y: number; o: number; c: number; partial: boolean }[] | null;
  cohort: { rate: number; num: number; den: number; years: number } | null;
  text: string;
  take: string;
}
export interface FactorsSection {
  factors: { label: string; pct: number; lo: number; hi: number; sig: boolean; binary: boolean }[];
  r2: number | null;
  text: string;
}
export interface InsightReport {
  headline: string;
  subtitle: string;
  tiles: Tile[];
  findings: Finding[];
  profile: { label: string; value: string }[];
  level: LevelSection | null;
  slots: SlotsSection | null;
  competition: CompetitionSection | null;
  factors: FactorsSection | null;
  checklist: string[];
  sources: string[];
  limits: string[];
}

const BIG_PEER_STORES = 20;
const TIME_GROUP = "시간대별";
const AGE_GROUP = "연령대별";

/** 상권 점포당 월매출 순위: 점포가 BIG_PEER_STORES 곳 이상인 비교 상권끼리만 센 순위(점포 3~5곳짜리의 들쭉날쭉한 값을 뺀다). */
export function bigPeerRank(me: number, meStores: number, peers: { per_store_month: number | null; stores: number }[]): { rank: number | null; count: number } {
  const big = peers.filter((p) => p.stores >= BIG_PEER_STORES && p.per_store_month !== null) as { per_store_month: number; stores: number }[];
  if (meStores < BIG_PEER_STORES || big.length === 0) return { rank: null, count: big.length };
  return { rank: 1 + big.filter((p) => p.per_store_month > me).length, count: big.length };
}

export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function levelSection(b: BenchIn): LevelSection | null {
  if (b.status !== "ok" || b.per_store_month == null || !b.unit || !b.peers || !b.trend) return null;
  const me = man(b.per_store_month);
  const hist = b.peers.filter((p) => p.per_store_month !== null).map((p) => man(p.per_store_month as number));
  if (hist.length === 0) return null;
  const med = median(hist);
  const ratio = med > 0 ? me / med : 0;
  const big = bigPeerRank(b.per_store_month, b.stores ?? 0, b.peers);
  const trend = b.trend.filter((t) => t.per_store_month !== null).map((t) => ({ q: `${t.label.slice(2, 4)}.${t.label.slice(6, 7)}Q`, v: man(t.per_store_month as number), label: t.label }));
  const last = trend.at(-1);
  const peak = trend.reduce((m, t) => (t.v > m.v ? t : m), trend[0]);
  const yoy = b.growth?.yoy.per_store.value ?? null;
  const yoyTotal = b.growth?.yoy.total_sales.value ?? null;
  const stores = b.trend.filter((t) => t.stores !== null);
  const q = b.quarter_label ?? "";
  let text = `${b.unit.name} ${b.svc_nm ?? "같은 업종"} 점포당 추정 월매출은 ${fmt(me)}만원으로 ${b.unit.peer_label} ${hist.length}곳 중앙값(${fmt(med)}만원)의 약 ${ratio.toFixed(1)}배입니다.`;
  if (big.rank !== null) text += ` 점포가 ${BIG_PEER_STORES}곳 이상인 ${big.count}곳만 비교하면 ${big.rank}위입니다.`;
  if (peak && last && peak.q !== last.q && peak.v > last.v * 1.03) {
    text += ` ${peak.label}(${fmt(peak.v)}만원)을 정점으로 내려와 ${q}은 정점보다 ${Math.round((1 - last.v / peak.v) * 100)}% 낮습니다.`;
  }
  if (yoy !== null) text += ` ${b.growth?.yoy.compare_label} 대비로는 점포당 ${signed(yoy)}${yoyTotal !== null ? `, 총매출 ${signed(yoyTotal)}` : ""}입니다.`;
  return {
    me, median: med, ratio, hist, rank: b.rank ?? null, peerCount: b.peer_count ?? hist.length, bigRank: big.rank, bigCount: big.count,
    trend: trend.map((t) => ({ q: t.q, v: t.v })), yoyPerStore: yoy, yoyTotal, qoqPerStore: b.growth?.qoq.per_store.value ?? null, flpopYoy: b.floating?.flpop_yoy_pct ?? null,
    storesFrom: stores.length ? (stores[0].stores as number) : null, storesNow: stores.length ? (stores.at(-1)?.stores as number) : null,
    unitName: b.unit.name, peerLabel: b.unit.peer_label, quarterLabel: q, text,
  };
}

function slotsSection(b: BenchIn): SlotsSection | null {
  const comp = b.composition?.find((g) => g.group === TIME_GROUP);
  if (!comp) return null;
  const fl = b.floating?.mix.find((g) => g.group === TIME_GROUP);
  const slots = comp.items.filter((i) => i.dong !== null && i.pilot !== null).map((i) => ({
    label: i.label, me: (i.dong as number) * 100, pilot: (i.pilot as number) * 100,
    fl: (() => { const v = fl?.items.find((x) => x.key === i.key)?.flpop; return v == null ? null : v * 100; })(),
  }));
  if (slots.length === 0) return null;
  const gaps = slots.map((s) => ({ ...s, gap: s.me - s.pilot }));
  const hi = gaps.reduce((m, s) => (s.gap > m.gap ? s : m), gaps[0]);
  const lo = gaps.reduce((m, s) => (s.gap < m.gap ? s : m), gaps[0]);
  const peerWord = b.unit?.peer_label ?? "비교 상권";
  const hiOn = hi.gap >= 5;
  const loOn = lo.gap <= -5;
  const hiText = `${hi.label} 매출 비중 ${hi.me.toFixed(1)}%는 ${peerWord} 평균(${hi.pilot.toFixed(1)}%)보다 ${hi.gap.toFixed(1)}%p 높`;
  const loText = `${lo.label} 비중 ${lo.me.toFixed(1)}%는 평균(${lo.pilot.toFixed(1)}%)보다 ${Math.abs(lo.gap).toFixed(1)}%p 낮`;
  let text = hiOn && loOn ? `${hiText}고, ${loText}습니다.` : hiOn ? `${hiText}습니다.` : loOn ? `${loText}습니다.` : "시간대별 매출 비중은 비교 상권 평균과 큰 차이가 없습니다.";

  const wp = b.hinterland?.workplace ?? null;
  const wMed = b.hinterland?.peer_median.workplace ?? null;
  const ageRows = b.composition?.find((g) => g.group === AGE_GROUP)?.items ?? [];
  const ages = wp ? ageRows.filter((i) => i.dong !== null && !["share_age10"].includes(i.key)).map((i) => ({ label: i.label, work: wp.age_share[i.key.replace("share_", "")] != null ? (wp.age_share[i.key.replace("share_", "")] as number) * 100 : null, sales: (i.dong as number) * 100 })) : null;
  const pick = (rows: { work: number | null; sales: number; label: string }[] | null, labels: string[], key: "work" | "sales") =>
    rows ? rows.filter((r) => labels.includes(r.label)).reduce<number | null>((s, r) => (r[key] === null ? s : (s ?? 0) + (r[key] as number)), null) : null;
  const age3040 = pick(ages, ["30대", "40대"], "work");
  const salesAge3040 = pick(ages, ["30대", "40대"], "sales");
  const age50w = pick(ages, ["50대", "60대 이상", "60대+"], "work");
  const age50s = pick(ages, ["50대", "60대 이상", "60대+"], "sales");
  const workers = wp ? { total: wp.total, median: wMed, ratio: wMed ? wp.total / wMed : null, age3040: age3040 } : null;
  if (workers && workers.ratio !== null) {
    text += ` 상권 안 직장인구는 ${fmt(workers.total)}명으로 ${b.unit?.peer_label ?? "비교 상권"} 중앙값(${fmt(workers.median as number)}명)의 ${workers.ratio.toFixed(1)}배${age3040 !== null ? `이고 30·40대가 ${age3040.toFixed(1)}%` : ""}입니다.`;
  }
  let take = "시간대별 비중은 손님이 언제 오는지를 보여 줄 뿐, 그 이유는 이 자료로 알 수 없습니다. 메뉴·영업시간·이웃 가게와의 관계를 함께 보고 판단하세요.";
  if (lo.gap <= -5) take = `${lo.label}의 매출 비중이 평균보다 낮다는 것은 그 시간대 수요를 덜 가져오고 있을 가능성을 보여 줍니다. ` + take;
  if (age50s !== null && age50w !== null && age50s - age50w >= 10) {
    take += ` 매출의 ${age50s.toFixed(0)}%가 50대 이상으로 직장인구의 연령 구성(${age50w.toFixed(0)}%)보다 높아, 직장인 외 손님이 있을 수 있습니다.`;
  }
  return { slots, hasFloating: slots.some((s) => s.fl !== null), text, workers, ages: ages && ages.length ? ages : null, salesAge50: age50s, workAge50: age50w, salesAge3040, take };
}

function competitionSection(b: BenchIn | null, n: NearbyIn | null, l: LocIn | null): CompetitionSection | null {
  const same = l?.radius_metrics.competitors.same_category ?? null;
  const comp = n?.status === "ok" ? n.competitors ?? null : null;
  const churn = b?.churn && (b.churn.status === "ok" || b.churn.status === "partial") && b.churn.opened !== undefined ? b.churn : null;
  const fr = b?.franchise_share && b.franchise_share.share !== null ? b.franchise_share : null;
  const yearly = n?.status === "ok" && n.trend ? n.trend.filter((t) => t.closed !== null).map((t) => ({ y: t.year, o: t.opened, c: t.closed as number, partial: t.partial_year })) : null;
  const cohort = n?.status === "ok" && n.closure_cohort?.status === "ok" && n.closure_cohort.rate !== null ? { rate: n.closure_cohort.rate, num: n.closure_cohort.numerator ?? 0, den: n.closure_cohort.denominator ?? 0, years: n.closure_cohort.horizon_years ?? 3 } : null;
  if (!same && !comp && !churn && !fr && !yearly) return null;
  const radiusM = n?.radius_m ?? 500;
  const parts: string[] = [];
  if (same) parts.push(`반경 ${radiusM}m에 같은 소분류(${same.label}) 점포가 ${same.count}곳${same.nearest_m !== null ? `이고 가장 가까운 곳은 ${same.nearest_m}m입니다` : "입니다"}.`);
  if (fr) parts.push(`프랜차이즈 점포 비중은 ${((fr.share as number) * 100).toFixed(1)}%(${fr.stores}곳 중 ${fr.frc_stores}곳)${fr.peer_median !== null ? `로 비교 상권 중앙값 ${(fr.peer_median * 100).toFixed(0)}%${(fr.share as number) > fr.peer_median ? "보다 높습니다" : "와 같거나 낮습니다"}` : "입니다"}.`);
  if (churn) {
    parts.push(`최근 1년(${churn.period}) 이 ${b?.unit?.label ?? "상권"} 같은 업종은 ${churn.opened}곳이 열고 ${churn.closed}곳이 닫았습니다${churn.close_rate != null ? `. 연 폐업률 ${(churn.close_rate * 100).toFixed(1)}%${churn.peer_median_close != null ? `(비교 상권 중앙값 ${(churn.peer_median_close * 100).toFixed(1)}%)` : ""}` : ""}.`);
  }
  const take = "경쟁이 많다는 사실만으로 매출이 낮아진다고 볼 수 없습니다. 같은 업종이 모이는 상권에서 점포당 매출이 높게 나타나는 경향도 있으므로, 그 안에서 내 가게가 무엇이 다른지가 중요합니다. 상관관계이며 내 매장의 매출을 예측하지 않습니다.";
  return {
    radiusM, sameCount: same?.count ?? comp?.raw_count ?? null, label: same?.label ?? "같은 소분류", openConfirmed: comp?.open_confirmed_count ?? null, unconfirmed: comp?.unconfirmed_count ?? null, nearestM: same?.nearest_m ?? null,
    franchise: fr ? { share: fr.share as number, frc: fr.frc_stores, stores: fr.stores, median: fr.peer_median } : null,
    churn: churn ? { opened: churn.opened ?? 0, closed: churn.closed ?? 0, avg: churn.avg_stores ?? 0, openRate: churn.open_rate ?? null, closeRate: churn.close_rate ?? null, medOpen: churn.peer_median_open ?? null, p75Open: churn.peer_p75_open ?? null, medClose: churn.peer_median_close ?? null, p75Close: churn.peer_p75_close ?? null, peers: churn.peer_count ?? null, period: churn.period } : null,
    yearly: yearly && yearly.length ? yearly : null, cohort, text: parts.join(" "), take,
  };
}

function factorsSection(l: LocIn | null): FactorsSection | null {
  const m = l?.model;
  if (!m || m.status !== "ok" || !m.factors || m.factors.length === 0) return null;
  const factors = m.factors.map((f) => ({ label: f.label, pct: f.pct, lo: f.pct_lo, hi: f.pct_hi, sig: f.significant, binary: f.binary }));
  const sig = factors.filter((f) => f.sig);
  const none = factors.filter((f) => !f.sig).map((f) => f.label);
  const r2 = m.cv?.r2_full ?? null;
  let text = sig.length
    ? `점포당 추정매출이 높은 상권에서 ${sig.map((f) => `${f.label}이(가) ${f.binary ? "있을 때" : "많을수록"}(${signed(f.pct)})`).join(", ")} 높은 경향이 있었습니다.`
    : "점포당 추정매출과 뚜렷한 관계를 보인 입지 요인이 없었습니다.";
  if (none.length) text += ` ${none.join("·")}은 뚜렷한 관계가 없었습니다.`;
  if (r2 !== null) text += ` 모델 설명력(R²)은 ${r2.toFixed(2)}${r2 < 0.3 ? "로 낮아 방향 참고용입니다" : "입니다"}.`;
  return { factors, r2, text };
}

/** 리포트 전체 — 값이 없는 쪽은 null 로 두고, 화면은 그 쪽을 건너뛴다. */
export function buildInsightReport(inp: ReportInput): InsightReport {
  const b = inp.bench;
  const level = b ? levelSection(b) : null;
  const slots = b ? slotsSection(b) : null;
  const competition = competitionSection(b, inp.nearby, inp.loc);
  const factors = factorsSection(inp.loc);
  const areaLabel = inp.store.areaName ?? `${inp.store.dong}`;
  const svcName = b?.svc_nm ?? inp.store.category;

  // 제목은 가장 큰 시간대 차이를 쓰고, 없으면 중립적인 문장을 쓴다
  const topGap = (b?.insights ?? []).filter((i) => i.group === TIME_GROUP).sort((x, y) => Math.abs(y.gap_pctp) - Math.abs(x.gap_pctp))[0];
  const headline = topGap && Math.abs(topGap.gap_pctp) >= 5
    ? `${areaLabel} ${svcName}은 ${topGap.label} 매출 비중이 평균보다 ${topGap.gap_pctp > 0 ? "높다" : "낮다"}`
    : `${areaLabel} ${svcName} 상권 읽기`;

  const tiles: Tile[] = [];
  if (level) {
    tiles.push({ label: `${level.unitName.length > 12 ? "상권" : level.unitName} 점포당 월평균 추정매출`, value: `${fmt(level.me)}만원`, note: `${level.peerLabel} 중앙값 ${fmt(level.median)}만원`, tone: "plain" });
    if (level.bigRank !== null) tiles.push({ label: `점포 ${BIG_PEER_STORES}곳 이상 ${level.bigCount}곳 중`, value: `${level.bigRank}위`, note: level.rank !== null ? `전체 ${level.peerCount}곳 중에서는 ${level.rank}위` : "", tone: "accent" });
    else if (level.rank !== null) tiles.push({ label: `${level.peerCount}곳 중`, value: `${level.rank}위`, note: "점포 수가 적은 상권이 섞여 있습니다", tone: "accent" });
    if (level.yoyPerStore !== null) tiles.push({ label: "점포당 매출 증감(전년 동기)", value: signed(level.yoyPerStore), note: level.yoyTotal !== null ? `총매출 ${signed(level.yoyTotal)}` : "", tone: level.yoyPerStore < 0 ? "neg" : "plain" });
  }
  if (competition?.churn?.closeRate != null) {
    const c = competition.churn;
    tiles.push({ label: "같은 업종 연 폐업률(최근 1년)", value: `${((c.closeRate as number) * 100).toFixed(1)}%`, note: c.medClose != null ? `비교 상권 중앙값 ${(c.medClose * 100).toFixed(1)}%` : "", tone: c.medClose != null && (c.closeRate as number) > c.medClose ? "neg" : "plain" });
  }

  const findings: Finding[] = [];
  if (level) {
    findings.push({
      title: `점포당 월매출은 비교 상권 중앙값의 ${level.ratio.toFixed(1)}배${level.yoyPerStore !== null ? `, 전년 동기 대비 ${signed(level.yoyPerStore)}` : ""}입니다`,
      body: `${level.unitName} 평균은 ${fmt(level.me)}만원입니다.${level.flpopYoy !== null ? ` 유동인구 지수는 전년 동기보다 ${signed(level.flpopYoy)}입니다.` : ""} → 2쪽`,
    });
  }
  if (slots) findings.push({ title: headline, body: `${slots.text} → 3쪽` });
  if (competition) findings.push({ title: competition.churn ? `최근 1년 ${competition.churn.opened}곳이 열고 ${competition.churn.closed}곳이 닫았습니다` : `반경 ${competition.radiusM}m 같은 업종 점포 ${competition.sameCount ?? "?"}곳`, body: `${competition.text} → 4쪽` });

  const profile: { label: string; value: string }[] = [];
  if (inp.licenseAge) profile.push({ label: "인허가 업력", value: inp.licenseAge });
  if (inp.licenseState) profile.push({ label: "인허가상 상태", value: inp.licenseState });
  if (competition?.sameCount != null) profile.push({ label: `반경 ${competition.radiusM}m 같은 소분류`, value: `${competition.sameCount}곳${competition.openConfirmed !== null ? ` (영업 확인 ${competition.openConfirmed} · 미확인 ${competition.unconfirmed})` : ""}` });
  const anchors = inp.anchors.filter((a) => a.nearestM !== null);
  if (anchors.length) profile.push({ label: "가까운 앵커 브랜드", value: anchors.map((a) => `${a.label} ${a.nearestM}m`).join(" · ") });

  const checklist: string[] = [];
  if (level?.yoyPerStore != null) checklist.push(`내 월 매출의 전년 동기 변화율을 상권 평균 ${signed(level.yoyPerStore)}와 견주기('내 가게 점검'에 월 매출을 기록하면 바로 비교됩니다)`);
  if (slots) {
    const lo = slots.slots.reduce((m, s) => (s.me - s.pilot < m.me - m.pilot ? s : m), slots.slots[0]);
    if (lo.me - lo.pilot <= -5) checklist.push(`${lo.label} 매출 비중이 상권 평균(${lo.pilot.toFixed(1)}%)보다 낮은지 내 가게 기록으로 확인하고, 그 시간대 메뉴·운영을 시험할지 정하기`);
  }
  if (competition?.churn && competition.churn.closed > competition.churn.opened) checklist.push("최근 문을 닫은 이웃 가게의 이유를 이웃 상인·부동산에 물어보기");
  if (competition?.franchise && competition.franchise.median !== null && competition.franchise.share > competition.franchise.median) checklist.push(`프랜차이즈 점포(상권의 ${(competition.franchise.share * 100).toFixed(0)}%)와 메뉴·가격대가 겹치는지 점검하기`);

  const sources = [
    "소상공인 상가(상권)정보",
    "서울시 상권분석서비스(추정매출·점포·인구·집객시설)",
    "서울시 자치구별 인허가(LOCALDATA)",
  ];
  const limits = [
    "매출은 이 매장의 실제 매출이 아니라 같은 상권·업종 점포의 카드 결제 기반 추정 평균입니다.",
    "분석 지역이 양천구·영등포구 상권뿐이라 표본이 작습니다.",
    "고객평가(Google)는 매장 화면에서 공식 구성요소로만 확인하며 이 리포트에는 쓰지 않았습니다.",
    "원인을 단정하지 않으며, 점포당 추정매출이 높다고 수익성이 좋다는 뜻이 아닙니다(임대료·인건비·원가 자료 없음).",
  ];
  const subtitle = `${inp.store.name}${inp.store.branch ? ` ${inp.store.branch}` : ""} · ${inp.store.category} · ${inp.store.sigungu} ${inp.store.dong}${inp.store.areaName ? ` · 소속 ${inp.store.areaName}${inp.store.areaKind ? `(${inp.store.areaKind})` : ""}` : ""}`;
  return { headline, subtitle, tiles, findings, profile, level, slots, competition, factors, checklist, sources, limits };
}
