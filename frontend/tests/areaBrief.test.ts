import assert from "node:assert/strict";
import { test } from "node:test";
import { briefFact, buildAreaBrief, type BriefInput, type BriefRow } from "../src/lib/areaBrief.ts";

const r = (key: string, kind: string, value: number | null, extra: { note?: string; caution?: boolean } = {}): BriefRow => ({ key, kind, as_of: "2026년 2분기", cells: [{ value, ...extra }] });
const rows: BriefRow[] = [r("per_store_month", "money", 39_000_000), r("sales_yoy_pct", "growth", -5.6), r("close_rate_y", "rate", 19.7), r("open_rate_y", "rate", 13.1), r("stores_sbiz", "count", 23), r("stores_change_2y", "growth", -8.8)];
const base: BriefInput = { mode: "founder", unitWord: "상권", scope: "한식음식점 전체", rows, sampleStores: 31, basketHas: false };

test("예비 창업자: 매출·증감·폐업률을 먼저, 다음 확인은 후보 비교→비용 점검→현장 확인", () => {
  const b = buildAreaBrief(base);
  assert.deepEqual(b.facts.map((f) => f.key), ["per_store_month", "sales_yoy_pct", "close_rate_y"]);
  assert.deepEqual(b.next.map((n) => n.target), ["compare", "tab-cost", "tab-visit"]);
  assert.match(b.facts[2].note, /개업률 13\.1%/);
  assert.equal(b.scopeLine, "상권 단위 · 한식음식점 전체 기준");
});

test("자영업자: 총매출 증감·같은 업종 점포 수·폐업률을 먼저, 다음 확인은 내 매장 찾기→경쟁→수요", () => {
  const b = buildAreaBrief({ ...base, mode: "owner" });
  assert.deepEqual(b.facts.map((f) => f.key), ["sales_yoy_pct", "stores_sbiz", "close_rate_y"]);
  assert.deepEqual(b.next.map((n) => n.target), ["search", "tab-stability", "tab-demand"]);
  assert.match(b.facts[1].note, /약 2년 -8\.8%/);
});

test("해석은 값 사이의 직접 비교만 말하고 원인·유망 여부를 단정하지 않는다(최대 2문장)", () => {
  const b = buildAreaBrief(base);
  assert.equal(b.hold, null);
  assert.ok(b.reading.length >= 1 && b.reading.length <= 2);
  const t = b.reading.join(" ");
  assert.match(t, /총매출은 전년 동기보다 줄었습니다\(-5\.6%\)/);
  assert.match(t, /폐업률이 눈에 띄게 더 높습니다/);
  assert.match(t, /원인은 알 수 없고/);
  assert.doesNotMatch(t, /유망|위험|추천|좋|나쁜|때문/);
});

test("리포트(areaLens)와 같은 규칙: 증감은 부호대로 말하고, 개업·폐업률은 1.25배 이상 차이일 때만 방향을 말한다", () => {
  const small = buildAreaBrief({ ...base, rows: [r("sales_yoy_pct", "growth", 0.4), r("close_rate_y", "rate", 10), r("open_rate_y", "rate", 11.9)] });
  const t = small.reading.join(" ");
  assert.match(t, /전년 동기보다 늘었습니다\(\+0\.4%, 변화 폭이 작음\)/);   // 리포트도 0 초과면 '늘었습니다'
  assert.match(t, /큰 차이가 없습니다/);                                    // 11.9 < 10 × 1.25
  const clear = buildAreaBrief({ ...base, rows: [r("sales_yoy_pct", "growth", -2), r("close_rate_y", "rate", 10), r("open_rate_y", "rate", 12.5)] });
  assert.match(clear.reading.join(" "), /개업률이 눈에 띄게 더 높습니다/);
});

test("점포 10곳 미만이면 해석을 만들지 않고 분석 보류 이유를 말한다", () => {
  const b = buildAreaBrief({ ...base, sampleStores: 7 });
  assert.deepEqual(b.reading, []);
  assert.match(b.hold ?? "", /7곳뿐이라.*보류/);
  assert.equal(b.sample, "too_few");
});

test("점포 10~19곳이면 해석은 그대로(최대 2문장) 두고 소규모 주의를 숫자 근처 문구로 따로 준다", () => {
  const b = buildAreaBrief({ ...base, sampleStores: 15 });
  assert.equal(b.sample, "caution");
  assert.ok(b.reading.length >= 1 && b.reading.length <= 2);
  assert.match(b.caution ?? "", /소규모.*흔들릴 수/);
  assert.equal(buildAreaBrief(base).caution, null);
  assert.equal(buildAreaBrief({ ...base, sampleStores: 7 }).caution, null);       // 10곳 미만은 주의가 아니라 보류
});

test("근거 자료가 없으면 해석을 만들지 않고 '자료가 없는 것이지 0이 아님'이라고 말한다", () => {
  const b = buildAreaBrief({ ...base, rows: [r("per_store_month", "money", 1)] });
  assert.deepEqual(b.reading, []);
  assert.match(b.hold ?? "", /0이 아닙니다/);
});

test("0·자료 없음·분석 보류를 서로 다른 말로 구분한다", () => {
  const zero = briefFact([r("close_rate_y", "rate", 0)], "close_rate_y", "폐업률");
  assert.equal(zero.state, "value");
  assert.equal(zero.value, "0.0%");
  const hold = briefFact([r("sales_yoy_pct", "growth", null, { note: "점포가 너무 적어(표본 작음) 비율·증감률을 계산하지 않음" })], "sales_yoy_pct", "증감");
  assert.equal(hold.state, "hold");
  assert.equal(hold.value, "분석 보류");
  const missing = briefFact([r("sales_yoy_pct", "growth", null, { note: "이 조건의 매출 행이 원천에 없음" })], "sales_yoy_pct", "증감");
  assert.equal(missing.state, "missing");
  assert.equal(missing.value, "자료 없음");
  assert.equal(briefFact([], "x", "라벨").state, "missing");
});

test("소규모 상권 주의는 숫자 옆 메모에 남고 기간도 함께 보인다", () => {
  const f = briefFact([r("sales_yoy_pct", "growth", -3, { caution: true })], "sales_yoy_pct", "증감");
  assert.match(f.note, /2026년 2분기 · 소규모 상권: 변동성 주의/);
});

test("비교는 '내 관심 지역'으로 합쳐졌다 — 같은 행동 이름이고, 이미 저장한 지역이 있으면 설명만 달라진다", () => {
  assert.equal(buildAreaBrief({ ...base, basketHas: true }).next[0].label, "내 관심 지역에 담고 비교하기");
  assert.equal(buildAreaBrief(base).next[0].label, "내 관심 지역에 담고 비교하기");
  assert.match(buildAreaBrief({ ...base, basketHas: true }).next[0].why, /저장한 지역 중 2~4곳/);
  assert.match(buildAreaBrief(base).next[0].why, /보고서·비용·답사/);
});

test("개업·폐업률 문장은 최근 1년의 기준 기간을 밝히고 리포트의 분기 값과 직접 비교하지 말라고 말한다", () => {
  const b = buildAreaBrief({ ...base, rows: rows.map((x) => (x.key === "close_rate_y" ? { ...x, as_of: "2025년 3분기~2026년 2분기" } : x)) });
  const t = b.reading.join(" ");
  assert.match(t, /최근 1년\(2025년 3분기~2026년 2분기\) 개업률 13\.1%, 폐업률 19\.7%/);
  assert.match(t, /리포트의 '최근 분기' 값과는 기간이 달라 직접 견줄 수 없습니다/);
});
