// 상권·행정동 '인사이트 리포트'(예비 창업자용) — 매장 한 곳이 아니라 상권(또는 행정동) × 업종 하나를 4쪽으로 읽는다.
// 값은 종합분석·입지 비교가 이미 쓰는 API 값 그대로이고, 문장은 규칙으로만 만든다(자료가 없는 쪽은 만들지 않는다).
// 원인을 단정하지 않고 '관측'과 '가능한 해석'만 쓴다. 점수·'창업 적합도'를 만들지 않으며 리뷰·평점은 쓰지 않는다.
// 같은 폴더의 순수 함수(insightReport)만 가져온다(tests/areaReport.test.ts).
import { bigPeerRank, median, type Finding, type LevelSection, type Tile } from "./insightReport.ts";

const fmt = (n: number) => Math.round(n).toLocaleString("ko-KR");
const man = (won: number) => won / 1e4;
const signed = (v: number, d = 1) => `${v > 0 ? "+" : ""}${v.toFixed(d)}%`;

// ── 입력 ──
export interface PeerPoint { code: string; value: number | null; size: number | null }
export interface CompareRowIn { key: string; label: string; as_of: string | null; cells: { value: number | null; note?: string }[] }
export interface OverviewIn {
  latest_quarter: string;
  trend: { quarter: string; label: string; per_store_month: number | null; stores: number | null }[];
  hours: { slots: { label: string; pct: number | null }[]; pilot?: { label: string; units: number; slots: { label: string; pct: number | null }[] } };
  floating: { label: string; flpop: number | null; yoy_pct: number | null; weekend_pct: number | null; slots: { label: string; pct: number | null }[] } | null;
  area_m2?: number | null;
}
export interface CharacterIn {
  type: { headline: string };
  strengths: string[];
  cautions: string[];
  sections?: { transit?: { rail?: { count: number; boardings_observed: number | null; alightings_observed: number | null; year: number; usage_state: string }; bus?: { count: number; boardings_observed: number | null; alightings_observed: number | null; usage_state: string } } };
}
export interface AreaReportInput {
  unit: { level: "dong" | "trdar"; code: string; name: string; type: string | null };
  /** 업종 범위('한식음식점 전체') — 숫자 옆에 항상 밝힌다 */
  scope: string;
  rows: CompareRowIn[];
  overview: OverviewIn | null;
  character: CharacterIn | null;
  peers: { perStore: PeerPoint[]; close: PeerPoint[]; open: PeerPoint[]; frc: PeerPoint[] };
  /** 작성일 YYYY-MM-DD */
  today: string;
}

// ── 출력 ──
export interface AreaSlots { rows: { label: string; sales: number; pilot: number | null; flpop: number | null }[]; hasPilot: boolean; pilotLabel: string; hasFloating: boolean; text: string; facts: { label: string; value: string; note: string }[]; take: string }
export interface AreaStability {
  churn: { openRate: number | null; closeRate: number | null; medOpen: number | null; p75Open: number | null; medClose: number | null; p75Close: number | null; peers: number | null } | null;
  frc: { share: number; median: number | null } | null;
  facts: { label: string; value: string; note: string }[];
  text: string;
  take: string;
}
export interface AreaLocation {
  facts: { label: string; value: string; note: string }[];
  strengths: string[];
  cautions: string[];
  text: string;
}
export interface AreaReport {
  headline: string;
  subtitle: string;
  tiles: Tile[];
  findings: Finding[];
  profile: { label: string; value: string }[];
  level: LevelSection | null;
  slots: AreaSlots | null;
  stability: AreaStability | null;
  location: AreaLocation | null;
  checklist: string[];
  sources: string[];
  limits: string[];
}

const BIG_PEER_STORES = 20;

const val = (rows: CompareRowIn[], key: string): number | null => rows.find((r) => r.key === key)?.cells[0]?.value ?? null;
const asOf = (rows: CompareRowIn[], key: string): string => rows.find((r) => r.key === key)?.as_of ?? "";
const note = (rows: CompareRowIn[], key: string): string | undefined => rows.find((r) => r.key === key)?.cells[0]?.note;

function nums(p: PeerPoint[]): number[] { return p.filter((x) => x.value !== null).map((x) => x.value as number); }
/** 위쪽 25% 경계 — 값을 작은 순으로 세웠을 때 75% 위치(가까운 순위 방식). */
export function p75(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(0.75 * (s.length - 1))];
}

function levelSection(inp: AreaReportInput): LevelSection | null {
  const me = val(inp.rows, "per_store_month");
  const ov = inp.overview;
  const peers = nums(inp.peers.perStore);
  if (me === null || !ov || peers.length === 0) return null;
  const med = median(peers.map(man));
  const meMan = man(me);
  const meSize = inp.peers.perStore.find((p) => p.value !== null && Math.abs((p.value as number) - me) < 1)?.size ?? val(inp.rows, "stores_sbiz") ?? 0;
  const big = bigPeerRank(me, meSize, inp.peers.perStore.map((p) => ({ per_store_month: p.value, stores: p.size ?? 0 })));
  const rank = 1 + peers.filter((v) => v > me).length;
  const trend = ov.trend.filter((t) => t.per_store_month !== null).map((t) => ({ q: `${t.label.slice(2, 4)}.${t.label.slice(6, 7)}Q`, v: man(t.per_store_month as number), label: t.label }));
  const peak = trend.length ? trend.reduce((m, t) => (t.v > m.v ? t : m), trend[0]) : null;
  const last = trend.at(-1);
  const yoyTotal = val(inp.rows, "sales_yoy_pct");
  const stores = ov.trend.filter((t) => t.stores !== null);
  const ratio = med > 0 ? meMan / med : 0;
  const label = inp.unit.level === "trdar" ? "상권" : "행정동";
  let text = `${inp.unit.name} ${inp.scope.replace(/ 전체$/, "")} 점포당 월평균 추정매출은 ${fmt(meMan)}만원으로 비교 ${label} ${peers.length}곳 중앙값(${fmt(med)}만원)의 약 ${ratio.toFixed(1)}배입니다.`;
  if (big.rank !== null) text += ` 점포가 ${BIG_PEER_STORES}곳 이상인 ${big.count}곳만 비교하면 ${big.rank}위입니다.`;
  if (peak && last && peak.q !== last.q && peak.v > last.v * 1.03) text += ` ${peak.label}(${fmt(peak.v)}만원)을 정점으로 내려와 ${inp.overview?.latest_quarter ? "최근 분기는" : "지금은"} 정점보다 ${Math.round((1 - last.v / peak.v) * 100)}% 낮습니다.`;
  if (yoyTotal !== null) text += ` 총매출은 전년 동기 대비 ${signed(yoyTotal)}입니다.`;
  return {
    me: meMan, median: med, ratio, hist: peers.map(man), rank, peerCount: peers.length, bigRank: big.rank, bigCount: big.count,
    trend: trend.map((t) => ({ q: t.q, v: t.v })), yoyPerStore: null, yoyTotal, qoqPerStore: null, flpopYoy: ov.floating?.yoy_pct ?? null,
    storesFrom: stores.length ? (stores[0].stores as number) : null, storesNow: stores.length ? (stores.at(-1)?.stores as number) : null,
    unitName: inp.unit.name, peerLabel: `파일럿 구 ${label}`, quarterLabel: asOf(inp.rows, "per_store_month") || ov.latest_quarter, text,
  };
}

function slotsSection(inp: AreaReportInput): AreaSlots | null {
  const sales = inp.overview?.hours.slots ?? [];
  if (sales.length === 0 || sales.every((s) => s.pct === null)) return null;
  const fl = inp.overview?.floating?.slots ?? [];
  const pilot = inp.overview?.hours.pilot ?? null;
  const rows = sales.filter((s) => s.pct !== null).map((s) => ({
    label: s.label, sales: s.pct as number, pilot: pilot?.slots.find((p) => p.label === s.label)?.pct ?? null, flpop: fl.find((f) => f.label === s.label)?.pct ?? null,
  }));
  const hasFloating = rows.some((r) => r.flpop !== null);
  const hasPilot = rows.some((r) => r.pilot !== null);
  const pilotLabel = pilot?.label ?? "비교 지역";
  const top = rows.reduce((m, r) => (r.sales > m.sales ? r : m), rows[0]);
  const scopeWord = inp.scope.replace(/ 전체$/, "");
  let text: string;
  if (hasPilot) {
    // 평균과 견준 차이가 큰 시간대를 먼저 말한다(매장 리포트와 같은 기준: 5%p 이상)
    const gaps = rows.filter((r) => r.pilot !== null).map((r) => ({ ...r, gap: r.sales - (r.pilot as number) }));
    const hi = gaps.reduce((m, r) => (r.gap > m.gap ? r : m), gaps[0]);
    const lo = gaps.reduce((m, r) => (r.gap < m.gap ? r : m), gaps[0]);
    const hiOn = hi.gap >= 5, loOn = lo.gap <= -5;
    const hiText = `${hi.label} 매출 비중 ${hi.sales.toFixed(1)}%는 ${pilotLabel} 평균(${(hi.pilot as number).toFixed(1)}%)보다 ${hi.gap.toFixed(1)}%p 높`;
    const loText = `${lo.label} 비중 ${lo.sales.toFixed(1)}%는 평균(${(lo.pilot as number).toFixed(1)}%)보다 ${Math.abs(lo.gap).toFixed(1)}%p 낮`;
    text = hiOn && loOn ? `${hiText}고, ${loText}습니다.` : hiOn ? `${hiText}습니다.` : loOn ? `${loText}습니다.` : `시간대별 매출 비중은 ${pilotLabel} 평균과 큰 차이가 없습니다.`;
    text = `이 ${inp.unit.level === "trdar" ? "상권" : "행정동"}의 ${scopeWord} ` + text;
  } else {
    text = `이 ${inp.unit.level === "trdar" ? "상권" : "행정동"}의 ${scopeWord} 매출은 ${top.label}에 ${top.sales.toFixed(1)}%가 몰려 있습니다.`;
  }
  if (hasFloating && top.flpop !== null) text += ` 가장 매출이 몰린 ${top.label}의 유동인구 비중은 ${top.flpop.toFixed(1)}%입니다.`;
  const gapRow = hasFloating ? rows.filter((r) => r.flpop !== null).reduce((m, r) => ((r.sales - (r.flpop as number)) > (m.sales - (m.flpop as number)) ? r : m)) : null;
  if (gapRow && gapRow.label !== top.label) text += ` ${gapRow.label}은 매출 비중이 유동인구 비중보다 ${(gapRow.sales - (gapRow.flpop as number)).toFixed(1)}%p 큽니다.`;

  const fo = inp.overview?.floating ?? null;
  const facts: AreaSlots["facts"] = [];
  if (fo?.flpop != null) facts.push({ label: "유동인구 지수(분기 합)", value: `${fmt(fo.flpop)}명`, note: fo.yoy_pct != null ? `전년 동기 ${signed(fo.yoy_pct)}` : "서울시·KT 생활인구를 길 단위로 배분한 추정" });
  if (fo?.weekend_pct != null) facts.push({ label: "주말 비중", value: `${fo.weekend_pct.toFixed(1)}%`, note: "유동인구 기준" });
  const workers = val(inp.rows, "wrc_total");
  facts.push({ label: "직장인구", value: workers !== null ? `${fmt(workers)}명` : "자료 없음", note: workers !== null ? "상권 영역 안" : "원천에 값이 없음(0이 아님)" });
  const residents = val(inp.rows, "repop_total");
  facts.push({ label: "상주인구", value: residents !== null ? `${fmt(residents)}명` : "자료 없음", note: residents !== null ? "상권 영역 안" : "원천에 값이 없음(0이 아님)" });
  const fac = val(inp.rows, "fac_total");
  if (fac !== null) facts.push({ label: "집객시설", value: `${fmt(fac)}곳`, note: "서울시 시설 수" });

  let take = "이 비중은 이 상권 같은 업종 점포 전체가 만든 평균 소비 패턴이며, 내 가게의 매출을 예측하지 않습니다. 영업시간과 메뉴를 어느 시간대 수요에 맞출지 정할 때 참고하고, 현장에서 시간대별 손님 흐름을 직접 확인하세요.";
  const lowRow = hasPilot ? rows.filter((r) => r.pilot !== null).reduce((m, r) => ((r.sales - (r.pilot as number)) < (m.sales - (m.pilot as number)) ? r : m)) : null;
  if (lowRow && lowRow.sales - (lowRow.pilot as number) <= -5) take = `${lowRow.label}의 매출 비중이 ${pilotLabel} 평균보다 낮다는 것은 그 시간대 수요를 덜 가져오고 있을 가능성을 보여 줍니다. 원인은 이 자료로 알 수 없습니다. ` + take;
  if (top.sales >= 45) take = `${top.label}에 매출이 크게 쏠린 상권입니다. 그 시간대 수요를 노린 영업이라면 잘 맞고, 다른 시간대(예: 점심) 수요를 기대한다면 현장 유동을 먼저 확인해 보세요. ` + take;
  return { rows, hasPilot, pilotLabel, hasFloating, text, facts, take };
}

function stabilitySection(inp: AreaReportInput): AreaStability | null {
  // 지도 지표의 개업률·폐업률은 '분기' 값이라, 같은 분기 값끼리(이 지역 vs 비교 지역)만 견준다. 연 값(최근 1년)은 비교 없이 따로 보인다.
  const self = (p: PeerPoint[]) => p.find((x) => x.code === inp.unit.code)?.value ?? null;
  const qClose = self(inp.peers.close);
  const qOpen = self(inp.peers.open);
  const pc = nums(inp.peers.close);
  const po = nums(inp.peers.open);
  const churn = qClose !== null || qOpen !== null
    ? {
        openRate: qOpen !== null ? qOpen / 100 : null, closeRate: qClose !== null ? qClose / 100 : null,
        medOpen: po.length ? median(po) / 100 : null, p75Open: po.length ? p75(po) / 100 : null,
        medClose: pc.length ? median(pc) / 100 : null, p75Close: pc.length ? p75(pc) / 100 : null,
        peers: pc.length || po.length || null,
      }
    : null;
  const frcShare = val(inp.rows, "frc_share");
  const pf = nums(inp.peers.frc);
  const frc = frcShare !== null ? { share: frcShare / 100, median: pf.length ? median(pf) / 100 : null } : null;
  const facts: AreaStability["facts"] = [];
  const yClose = val(inp.rows, "close_rate_y");
  if (yClose !== null) facts.push({ label: "연 폐업률(최근 1년)", value: `${yClose.toFixed(1)}%`, note: asOf(inp.rows, "close_rate_y") });
  const yOpen = val(inp.rows, "open_rate_y");
  if (yOpen !== null) facts.push({ label: "연 개업률(최근 1년)", value: `${yOpen.toFixed(1)}%`, note: asOf(inp.rows, "open_rate_y") });
  const vol = val(inp.rows, "stores_volatility");
  if (vol !== null) facts.push({ label: "점포 수 변동성", value: `${vol.toFixed(1)}%`, note: "분기 평균 변동폭" });
  const chg = val(inp.rows, "stores_change_2y");
  if (chg !== null) facts.push({ label: "점포 수 증감(약 2년)", value: signed(chg), note: asOf(inp.rows, "stores_change_2y") });
  const stores = val(inp.rows, "stores_sbiz");
  if (stores !== null) facts.push({ label: "같은 업종 점포 수", value: `${fmt(stores)}곳`, note: "소상공인 상가정보 기준" });
  if (!churn && !frc && facts.length === 0) return null;
  const parts: string[] = [];
  if (churn?.closeRate != null) parts.push(`최근 분기 폐업률은 ${(churn.closeRate * 100).toFixed(1)}%${churn.medClose != null ? `(비교 지역 중앙값 ${(churn.medClose * 100).toFixed(1)}%${churn.p75Close != null ? `, 상위 25% 경계 ${(churn.p75Close * 100).toFixed(1)}%` : ""})` : ""}`);
  if (churn?.openRate != null) parts.push(`개업률은 ${(churn.openRate * 100).toFixed(1)}%${churn.medOpen != null ? `(중앙값 ${(churn.medOpen * 100).toFixed(1)}%)` : ""}`);
  let text = parts.length ? parts.join(", ") + "입니다." : "";
  if (yClose !== null) text += ` 최근 1년 연 폐업률은 ${yClose.toFixed(1)}%입니다.`;
  if (frc) text += ` 프랜차이즈 점포 비중은 ${(frc.share * 100).toFixed(1)}%${frc.median !== null ? `로 비교 중앙값 ${(frc.median * 100).toFixed(0)}%${frc.share > frc.median ? "보다 높습니다" : "와 같거나 낮습니다"}` : "입니다"}.`;
  const higher = churn?.closeRate != null && churn.medClose != null && churn.closeRate > churn.medClose;
  const take = (higher ? "최근 분기 폐업률이 비교 지역 중앙값보다 높습니다. 수요가 부족했을 수도, 고정비 부담이 컸을 수도 있어 원인은 이 자료로 알 수 없으니, 최근 문을 닫은 가게의 사정을 현장에서 확인해 보세요. " : "") + "개폐업에는 업종 변경·이전도 섞여 있어 실제 영업 중단 수와 다를 수 있습니다. 상관관계이며 창업 성공 가능성을 뜻하지 않습니다.";
  return { churn, frc, facts, text: text.trim(), take };
}

function locationSection(inp: AreaReportInput): AreaLocation | null {
  const facts: AreaLocation["facts"] = [];
  const tr = inp.character?.sections?.transit;
  if (tr?.rail && tr.rail.count > 0) {
    facts.push({ label: "지하철 역", value: `${tr.rail.count}곳`, note: tr.rail.boardings_observed != null ? `승차 하루 평균 ${fmt(tr.rail.boardings_observed)}명(${tr.rail.year}년, 연결된 역만)` : "이용량 연결 안 됨" });
  } else if (tr?.rail) facts.push({ label: "지하철 역", value: "경계 안·250m 이내 없음", note: "이용 기록이 없는 것이 아니라 가까운 역이 없다는 뜻" });
  if (tr?.bus) facts.push({ label: "버스 정류장", value: `${tr.bus.count}곳`, note: tr.bus.boardings_observed != null ? `승차 하루 평균 ${fmt(tr.bus.boardings_observed)}명(연결된 정류장만)` : tr.bus.count === 0 ? "경계 안 정류장 없음" : "이용량 연결 안 됨" });
  const rent = val(inp.rows, "rent_small_shop");
  const vac = val(inp.rows, "vacancy_small_shop_pct");
  facts.push({ label: "소규모상가 임대료(R-ONE 참고)", value: rent !== null ? `${rent.toFixed(1)}천원/㎡` : "자료 없음", note: rent !== null ? "가까운 조사상권의 참고값" : (note(inp.rows, "rent_small_shop") ?? "가까운 R-ONE 조사상권이 없음") });
  facts.push({ label: "소규모상가 공실률(R-ONE 참고)", value: vac !== null ? `${vac.toFixed(1)}%` : "자료 없음", note: vac !== null ? "가까운 조사상권의 참고값" : (note(inp.rows, "vacancy_small_shop_pct") ?? "가까운 R-ONE 조사상권이 없음") });
  const sb = val(inp.rows, "starbucks_zone_share");
  const ds = val(inp.rows, "daiso_zone_share");
  if (sb !== null) facts.push({ label: "스세권 매장 비율", value: `${sb.toFixed(0)}%`, note: "스타벅스 도보 250m 이내 매장 비율" });
  if (ds !== null) facts.push({ label: "다세권 매장 비율", value: `${ds.toFixed(0)}%`, note: "다이소 도보 250m 이내 매장 비율" });
  const strengths = inp.character?.strengths ?? [];
  const cautions = inp.character?.cautions ?? [];
  if (facts.length === 0 && strengths.length === 0 && cautions.length === 0) return null;
  const text = inp.character ? `상권 유형은 '${inp.character.type.headline}'(참고용 규칙 분류)입니다. 임대료·공실률은 이 상권의 실제 값이 아니라 가까운 R-ONE 조사상권의 참고값이고, 이 자료에 없는 경우가 많으니 실제 임대료는 현장에서 확인하세요.` : "임대료·공실률은 이 상권의 실제 값이 아니라 가까운 R-ONE 조사상권의 참고값입니다.";
  return { facts, strengths, cautions, text };
}

export function buildAreaReport(inp: AreaReportInput): AreaReport {
  const level = levelSection(inp);
  const slots = slotsSection(inp);
  const stability = stabilitySection(inp);
  const location = locationSection(inp);
  const scopeShort = inp.scope.replace(/ 전체$/, "");
  const unitWord = inp.unit.level === "trdar" ? "상권" : "행정동";

  const top = slots ? slots.rows.reduce((m, r) => (r.sales > m.sales ? r : m), slots.rows[0]) : null;
  const pgap = slots && slots.hasPilot ? slots.rows.filter((r) => r.pilot !== null).map((r) => ({ label: r.label, gap: r.sales - (r.pilot as number) })).sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))[0] : null;
  const headline = pgap && Math.abs(pgap.gap) >= 8
    ? `${inp.unit.name} ${scopeShort}, ${pgap.label} 매출 비중이 평균보다 ${Math.abs(pgap.gap).toFixed(1)}%p ${pgap.gap > 0 ? "높습니다" : "낮습니다"}`
    : top && top.sales >= 40
    ? `${inp.unit.name} ${scopeShort}, 매출의 ${Math.round(top.sales)}%가 ${top.label}에 몰립니다`
    : level
      ? `${inp.unit.name}, ${scopeShort} 점포당 추정매출은 비교 ${unitWord} 중앙값의 ${level.ratio.toFixed(1)}배입니다`
      : `${inp.unit.name} ${scopeShort} ${unitWord} 읽기`;
  const subtitle = `${inp.unit.name}${inp.unit.type ? `(${inp.unit.type})` : ""} · ${inp.scope} 기준 · ${unitWord} 단위`;

  const tiles: Tile[] = [];
  if (level) {
    tiles.push({ label: `${unitWord} 점포당 월평균 추정매출`, value: `${fmt(level.me)}만원`, note: `${level.peerLabel} 중앙값 ${fmt(level.median)}만원`, tone: "plain" });
    if (level.bigRank !== null) tiles.push({ label: `점포 ${BIG_PEER_STORES}곳 이상 ${level.bigCount}곳 중`, value: `${level.bigRank}위`, note: `전체 ${level.peerCount}곳 중 ${level.rank}위`, tone: "accent" });
    else if (level.rank !== null) tiles.push({ label: `${level.peerCount}곳 중`, value: `${level.rank}위`, note: "점포 수가 적은 곳이 섞여 있습니다", tone: "accent" });
    if (level.yoyTotal !== null) tiles.push({ label: "총매출 증감(전년 동기)", value: signed(level.yoyTotal), note: level.storesFrom !== null && level.storesNow !== null ? `점포 수 ${level.storesFrom}→${level.storesNow}곳(서울시 집계)` : "", tone: level.yoyTotal < 0 ? "neg" : "plain" });
  }
  if (stability?.churn?.closeRate != null) {
    const c = stability.churn;
    tiles.push({ label: "같은 업종 분기 폐업률(최근 분기)", value: `${((c.closeRate as number) * 100).toFixed(1)}%`, note: c.medClose != null ? `비교 중앙값 ${(c.medClose * 100).toFixed(1)}%` : "", tone: c.medClose != null && (c.closeRate as number) > c.medClose ? "neg" : "plain" });
  }

  const findings: Finding[] = [];
  if (level) findings.push({ title: `점포당 월평균 추정매출은 비교 ${unitWord} 중앙값의 ${level.ratio.toFixed(1)}배${level.yoyTotal !== null ? `, 총매출은 전년 동기 ${signed(level.yoyTotal)}` : ""}입니다`, body: `${inp.unit.name} 평균은 ${fmt(level.me)}만원입니다.${level.flpopYoy !== null ? ` 유동인구 지수는 전년 동기 ${signed(level.flpopYoy)}입니다.` : ""} → 2쪽` });
  if (slots) findings.push({ title: headline, body: `${slots.text} → 3쪽` });
  if (stability) findings.push({ title: stability.churn?.closeRate != null ? `같은 업종 최근 분기 폐업률은 ${(stability.churn.closeRate * 100).toFixed(1)}%입니다` : "경쟁과 안정성", body: `${stability.text || "점포 수 변화와 프랜차이즈 비중을 봅니다."} → 4쪽` });

  const profile: { label: string; value: string }[] = [];
  if (inp.character) profile.push({ label: "유형(참고용 분류)", value: `${inp.character.type.headline}${inp.unit.type ? ` · ${inp.unit.type}` : ""}` });
  const area = inp.overview?.area_m2;
  if (area) profile.push({ label: "면적", value: `${(area / 1e6).toFixed(2)}㎢` });
  const stores = val(inp.rows, "stores_sbiz");
  if (stores !== null) profile.push({ label: `${scopeShort} 점포 수`, value: `${fmt(stores)}곳(상가정보)` });
  if (stability?.frc) profile.push({ label: "프랜차이즈 비중", value: `${(stability.frc.share * 100).toFixed(1)}%` });
  const workers = val(inp.rows, "wrc_total");
  if (workers !== null) profile.push({ label: "직장인구", value: `${fmt(workers)}명` });

  const checklist: string[] = [
    `후보 ${unitWord}을 '입지 비교'에 담아 점포당 월평균 추정매출·폐업률·점포 수를 나란히 견주기`,
  ];
  if (top && top.sales >= 45) checklist.push(`${top.label} 외 시간대(특히 내 메뉴가 노리는 시간대)의 실제 유동·손님을 현장에서 시간대별로 확인하기`);
  if (stability?.churn?.closeRate != null && stability.churn.medClose != null && stability.churn.closeRate > stability.churn.medClose) checklist.push("최근 문을 닫은 가게의 이유를 이웃 상인·부동산에 물어보기");
  checklist.push("실제 임대료·보증금·권리금은 이 자료에 없으니 부동산에서 직접 확인하기");
  if (stability?.frc && stability.frc.median !== null && stability.frc.share > stability.frc.median) checklist.push(`프랜차이즈 점포(${(stability.frc.share * 100).toFixed(0)}%)와 메뉴·가격대가 겹치는지 점검하기`);

  const sources = [
    "서울시 상권분석서비스(추정매출·점포·유동인구·직장인구·집객시설)",
    "소상공인시장진흥공단 상가(상권)정보",
    "한국부동산원 R-ONE 임대동향(참고값)",
    "역·버스 정류장 이용 기록(공공데이터포털, 서울 열린데이터광장)",
  ];
  const limits = [
    "매출은 카드 결제 기반 추정 평균이며 개별 가게의 실제 매출이 아닙니다. 점포당 추정매출이 높다고 수익성이 좋다는 뜻도 아닙니다(임대료·인건비·원가 자료 없음).",
    "점포 수는 소상공인 상가정보(현재)와 서울시 상권분석서비스(분기)의 집계 기준이 달라 같은 수로 비교하지 않습니다.",
    "분석 지역이 양천구·영등포구 상권뿐이라 표본이 작고, 비교 기준은 이 안의 상대 위치입니다.",
    "유형 분류와 임대료·공실률은 참고용이며, 원인을 단정하지 않습니다.",
  ];
  return { headline, subtitle, tiles, findings, profile, level, slots, stability, location, checklist, sources, limits };
}
