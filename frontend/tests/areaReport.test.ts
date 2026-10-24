import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAreaReport, p75, type AreaReportInput } from "../src/lib/areaReport.ts";

const row = (key: string, value: number | null, as_of = "2026년 2분기", note?: string) => ({ key, label: key, as_of, cells: [{ value, ...(note ? { note } : {}) }] });

const input: AreaReportInput = {
  unit: { level: "trdar", code: "u", name: "문래역(문래로데오거리)", type: "발달상권" },
  scope: "한식음식점 전체",
  rows: [
    row("per_store_month", 39_341_113.63), row("sales_yoy_pct", -5.61), row("stores_sbiz", 23, "2026-06"), row("stores_change_2y", -8.82),
    row("stores_volatility", 3.16), row("open_rate_y", 13.11), row("close_rate_y", 19.67), row("frc_share", 29.03),
    row("wrc_total", 2644), row("repop_total", null), row("fac_total", 14), row("rent_small_shop", null, "2026년 2분기", "1,000m 안에 R-ONE 조사 상권 없음"),
    row("vacancy_small_shop_pct", null), row("starbucks_zone_share", 100), row("daiso_zone_share", 100),
  ],
  overview: {
    latest_quarter: "20262",
    area_m2: 43658,
    trend: [
      { quarter: "20244", label: "2024년 4분기", per_store_month: 45_118_608, stores: 33 },
      { quarter: "20262", label: "2026년 2분기", per_store_month: 39_341_113, stores: 31 },
    ],
    hours: {
      slots: [{ label: "00~06시", pct: 1 }, { label: "06~11시", pct: 0.2 }, { label: "11~14시", pct: 19.5 }, { label: "14~17시", pct: 5.5 }, { label: "17~21시", pct: 55.3 }, { label: "21~24시", pct: 18.5 }],
      pilot: { label: "양천·영등포 상권", units: 127, slots: [{ label: "00~06시", pct: 2.5 }, { label: "06~11시", pct: 1.6 }, { label: "11~14시", pct: 32.6 }, { label: "14~17시", pct: 8.5 }, { label: "17~21시", pct: 40.7 }, { label: "21~24시", pct: 14.2 }] },
    },
    floating: { label: "2026년 2분기", flpop: 30639, yoy_pct: -15.51, weekend_pct: 25.7, slots: [{ label: "00~06시", pct: 20.3 }, { label: "06~11시", pct: 21.1 }, { label: "11~14시", pct: 15.3 }, { label: "14~17시", pct: 14.7 }, { label: "17~21시", pct: 17.5 }, { label: "21~24시", pct: 11.1 }] },
  },
  character: { type: { headline: "상업 집중형" }, strengths: ["경계 안에 역 1곳이 있습니다."], cautions: ["직장·상주 인구 자료가 없습니다."], sections: { transit: { rail: { count: 1, boardings_observed: 21816, alightings_observed: 22550, year: 2025, usage_state: "all_linked" }, bus: { count: 0, boardings_observed: null, alightings_observed: null, usage_state: "no_stops" } } } },
  peers: {
    perStore: [
      { code: "a", value: 125_000_000, size: 3 }, { code: "b", value: 45_000_000, size: 80 }, { code: "me", value: 39_341_113.63, size: 23 },
      { code: "c", value: 20_000_000, size: 50 }, { code: "d", value: 5_000_000, size: 6 }, { code: "e", value: null, size: 9 },
    ],
    close: [10, 12, 12.7, 19.67, 25, 8].map((v, i) => ({ code: i === 3 ? "u" : String(i), value: v, size: 30 })),
    open: [10, 12.8, 14, 13.11, 20, 9].map((v, i) => ({ code: i === 3 ? "u" : String(i), value: v, size: 30 })),
    frc: [5, 8, 10, 29.03].map((v, i) => ({ code: String(i), value: v, size: 30 })),
  },
  mode: "founder",
  today: "2026-10-20",
};

test("75% 경계는 작은 순으로 세운 값의 위쪽 25% 위치다", () => {
  assert.equal(p75([1, 2, 3, 4, 5]), 4);
  assert.equal(p75([10]), 10);
});

test("상권 단위 리포트: 값은 API 그대로, 순위는 점포 20곳 이상 비교 상권끼리, 문장은 규칙으로", () => {
  const r = buildAreaReport(input);
  assert.equal(Math.round(r.level!.me), 3934);
  assert.equal(r.level!.peerCount, 5); // 값이 없는 상권은 비교에서 뺀다
  assert.equal(r.level!.rank, 3);
  assert.equal(r.level!.bigRank, 2); // 점포 3·6곳짜리는 순위 기준에서 뺌
  assert.match(r.level!.text, /3,934만원으로 비교 상권 5곳 중앙값\(3,934만원\)의 약 1\.0배/);
  assert.match(r.level!.text, /정점보다 13% 낮습니다/);
  assert.match(r.level!.text, /총매출은 전년 동기 대비 -5\.6%/);
  assert.equal(r.headline, "문래역(문래로데오거리) 한식음식점, 17~21시 매출 비중이 평균보다 14.6%p 높습니다");
});

test("시간대: 매출과 유동인구 비중을 나란히 말하고, 한 시간대에 쏠리면 다른 시간대 확인을 권한다", () => {
  const s = buildAreaReport(input).slots!;
  assert.equal(s.hasFloating, true);
  assert.match(s.text, /17~21시 매출 비중 55\.3%는 양천·영등포 상권 평균\(40\.7%\)보다 14\.6%p 높고, 11~14시 비중 19\.5%는 평균\(32\.6%\)보다 13\.1%p 낮습니다\./);
  assert.match(s.text, /가장 매출이 몰린 17~21시의 유동인구 비중은 17\.5%/);
  assert.equal(s.hasPilot, true);
  assert.match(s.take, /11~14시의 매출 비중이 양천·영등포 상권 평균보다 낮다는 것은/);
  assert.match(s.take, /다른 시간대/);
  assert.deepEqual(s.facts.find((f) => f.label === "상주인구"), { label: "상주인구", value: "자료 없음", note: "원천에 값이 없음(0이 아님)" });
});

test("안정성·입지: 폐업률은 비교 중앙값과 함께, 임대료가 없으면 0이 아니라 '자료 없음'과 사유를 말한다", () => {
  const r = buildAreaReport(input);
  const c = r.stability!.churn!;
  assert.equal(c.closeRate, 0.1967);
  assert.equal(c.medClose, 0.127);
  assert.match(r.stability!.text, /최근 분기 폐업률은 19\.7%\(비교 지역 중앙값 12\.7%/);
  assert.match(r.stability!.text, /최근 1년\(.+\) 연 폐업률은 19\.7%입니다/);
  assert.match(r.stability!.take, /폐업률이 비교 지역 중앙값보다 높습니다/);
  const rent = r.location!.facts.find((f) => f.label === "임대료·공실률");
  assert.equal(rent?.value, "자료 미확보");
  assert.match(rent!.note, /R-ONE 조사 상권 없음/);
  assert.ok(r.location!.facts.some((f) => f.label === "지하철 역" && f.value === "1곳"));
  assert.ok(r.checklist.some((c2) => c2.includes("임대료")));
  assert.ok(r.checklist.some((c2) => c2.includes("이웃 상인")));
});

test("자료가 없는 쪽은 만들지 않는다", () => {
  const empty = buildAreaReport({ ...input, rows: [], overview: null, character: null, peers: { perStore: [], close: [], open: [], frc: [] } });
  assert.equal(empty.level, null);
  assert.equal(empty.slots, null);
  assert.equal(empty.stability, null);
  assert.deepEqual(empty.tiles, []);
  assert.equal(empty.headline, "문래역(문래로데오거리) 한식음식점 상권 읽기");
  // 시간대 쏠림이 없으면 매출 수준으로 제목을 만든다
  const flat = buildAreaReport({ ...input, overview: { ...input.overview!, hours: { slots: input.overview!.hours.slots.map((x) => ({ ...x, pct: 16.6 })) } /* 평균 자료 없음 */ } });
  assert.equal(flat.headline, "문래역(문래로데오거리), 한식음식점 점포당 추정매출은 비교 상권 중앙값의 1.0배입니다");
});

test("관점: 예비 창업자는 긍정·주의 신호를 값 그대로 나열하고 점수·적합도는 만들지 않는다", () => {
  const r = buildAreaReport(input);
  assert.equal(r.lens.mode, "founder");
  assert.equal(r.lens.eyebrow, "예비 창업자용 · 창업 전 점검");
  const pos = r.lens.positive.map((s) => s.title), cau = r.lens.caution.map((s) => s.title);
  assert.ok(cau.some((t) => t.includes("총매출이 전년 동기보다 줄었습니다")), cau.join("|"));
  assert.ok(cau.some((t) => t.includes("문 닫는 비율")));
  assert.ok(cau.some((t) => t.includes("프랜차이즈 점포 비중이 높습니다")));
  assert.ok(r.lens.neutral.some((s) => s.title.includes("매출이 한 시간대에 쏠려")));
  assert.ok(!cau.some((t) => t.includes("매출이 한 시간대에 쏠려")));
  assert.ok(r.lens.missing.some((s) => s.title.includes("임대료·공실률을 이 자료로 알 수 없습니다")));
  assert.ok(!cau.some((t) => t.includes("임대료·공실률")));
  assert.ok(pos.some((t) => t.includes("점포당 추정매출이 비교 지역 중앙값보다 높")) === false); // 중앙값과 같은 수준이면 긍정으로 세지 않는다
  assert.match(r.lens.ruleNote, /점수나 '창업 적합도'가 아니고/);
  const text = JSON.stringify(r.lens);
  assert.doesNotMatch(text, /적합도\s*\d|점수\s*\d|\d+점/); // 점수 표현 없음
  assert.equal(r.lens.checklistTitle, "창업 전에 확인해 볼 것");
});

test("관점: 자영업자는 매출 증대 기회(비는 시간대·유동 대비 매출·차별화)와 내 가게와 견주기를 짚는다", () => {
  const r = buildAreaReport({ ...input, mode: "owner" });
  assert.equal(r.lens.mode, "owner");
  assert.equal(r.lens.eyebrow, "자영업자용 · 매출 증대·기회 포착");
  const pos = r.lens.positive.map((s) => s.title);
  assert.ok(pos.some((t) => t.startsWith("11~14시의 매출 비중이 비교 평균보다 낮습니다")), pos.join("|")); // 평균보다 13%p 낮은 점심
  assert.ok(pos.some((t) => t.includes("17~21시가 이 상권 매출의 중심입니다")), pos.join("|"));
  assert.ok(pos.some((t) => t.includes("개인 가게의 차별화")));
  assert.match(r.headline, /11~14시 매출 비중이 평균보다 .*%p 낮습니다/);
  assert.ok(r.checklist.some((c) => c.includes("'내 가게 점검'에 월 매출을 기록")));
  assert.ok(r.checklist.some((c) => c.includes("11~14시 시간대에 한 가지")));
  assert.equal(r.lens.checklistTitle, "이번 달 해볼 것");
  assert.match(r.slots!.take, /^11~14시는 비교 지역 평균보다 매출 비중이 낮습니다/);
  assert.match(r.lens.levelTake, /내 가게의 매출이 아닙니다/);
});

test("관점이 달라도 같은 숫자를 쓴다(제목·해석·확인할 일만 다르다)", () => {
  const a = buildAreaReport(input), b = buildAreaReport({ ...input, mode: "owner" });
  assert.deepEqual(a.tiles, b.tiles);
  assert.equal(a.level!.me, b.level!.me);
  assert.notEqual(a.lens.levelTake, b.lens.levelTake);
});

test("조사는 받침에 맞게 고른다(은/는, 이/가)", async () => {
  const { eunNeun, iGa } = await import("../src/lib/areaLens.ts");
  assert.equal(eunNeun("17~21시"), "는");
  assert.equal(eunNeun("점심"), "은");
  assert.equal(iGa("17~21시"), "가");
  assert.equal(iGa("저녁"), "이");
});

// ── 표본 기준(서버 증감률 기준과 같다: 10곳 미만 제외·10~19곳 주의) ──
const withStores = (n: number, mode: "owner" | "founder" = "founder", yoyCaution = false): AreaReportInput => ({
  ...input, mode,
  rows: input.rows.map((r) => (r.key === "sales_yoy_pct" && yoyCaution ? { ...r, cells: [{ ...r.cells[0], caution: true, note: "소규모 상권: 변동성 주의" }] } : r)),
  overview: input.overview && { ...input.overview, trend: input.overview.trend.map((t, i, a) => (i === a.length - 1 ? { ...t, stores: n } : t)) },
});

test("표본 상태: 10곳 미만 제외, 10~19곳 주의, 20곳 이상 일반", async () => {
  const { sampleStatus, sampleNote } = await import("../src/lib/areaReport.ts");
  assert.equal(sampleStatus(9), "too_few");
  assert.equal(sampleStatus(10), "caution");
  assert.equal(sampleStatus(19), "caution");
  assert.equal(sampleStatus(20), "ok");
  assert.equal(sampleStatus(null), "unknown");
  assert.equal(sampleNote(31, "상권"), "");
  assert.match(sampleNote(7, "상권"), /7곳뿐이라.*10곳 미만.*참고만/);
  assert.match(sampleNote(15, "상권"), /소규모 상권.*흔들릴 수/);
});

test("점포 10곳 미만 상권은 매출 비교·폐업률 신호를 만들지 않고 참고용이라고 말한다(두 관점 모두)", () => {
  for (const mode of ["founder", "owner"] as const) {
    const r = buildAreaReport(withStores(7, mode));
    assert.equal(r.level?.sampleStatus, "too_few");
    const sig = [...r.lens.positive, ...r.lens.caution].map((s) => s.title).join("|");
    assert.doesNotMatch(sig, /중앙값|총매출|문 닫는|폐업/);
    assert.match(r.findings[0].title, /점포가 7곳뿐이라 매출 비교는 참고용/);
    assert.doesNotMatch(r.headline, /중앙값의/);
    assert.match(r.level?.text ?? "", /참고만 하세요/);
  }
});

test("점포 10~19곳은 신호를 만들되 '소규모 상권' 주의를 붙이고, 서버가 증감에 주의를 달았으면 그 말을 그대로 따른다", () => {
  const r = buildAreaReport(withStores(15, "founder", true));
  assert.equal(r.level?.sampleStatus, "caution");
  const sig = [...r.lens.positive, ...r.lens.caution];
  const cmp = sig.filter((s) => /중앙값|총매출|문 닫는/.test(s.title));
  assert.ok(cmp.length >= 2 && cmp.every((s) => s.body.includes("소규모 상권")));
  assert.ok(r.tiles.some((t) => t.label.startsWith("총매출 증감") && t.note.includes("소규모 상권: 변동성 주의")));
  assert.match(r.findings[0].title, /소규모 상권: 변동성 주의/);
});

test("점포 20곳 이상이면 주의 문구를 붙이지 않는다", () => {
  const r = buildAreaReport(withStores(31));
  assert.equal(r.level?.sampleStatus, "ok");
  assert.ok(![...r.lens.positive, ...r.lens.caution].some((s) => s.body.includes("소규모 상권")));
  assert.doesNotMatch(r.level?.text ?? "", /소규모|참고만 하세요/);
});

test("자영업자 '문 닫는 비율 중앙값 이하'는 오래 버틴다고 단정하지 않는다", () => {
  const low = { ...input, mode: "owner" as const, peers: { ...input.peers, close: [30, 28, 26, 19.67, 40, 35].map((v, i) => ({ code: i === 3 ? "u" : String(i), value: v, size: 30 })) } };
  const t = buildAreaReport(low).lens.positive.find((s) => s.title.includes("문 닫는"));
  assert.ok(t);
  assert.doesNotMatch(t.title, /오래 버/);
  assert.match(t.body, /오래 버틴다는 뜻은 아닙니다/);
});

test("점포 10곳 미만이면 프랜차이즈 비중·점포 수 증감·폐업률 기반 확인 항목도 만들지 않는다", () => {
  for (const mode of ["founder", "owner"] as const) {
    const r = buildAreaReport(withStores(7, mode));
    const text = [...r.lens.positive, ...r.lens.caution].map((s) => s.title).concat(r.lens.checklist).join("|");
    assert.doesNotMatch(text, /프랜차이즈|점포 수가 약 2년|점포 수가 안정|문 닫|최근 문을 닫은|상권 전체 매출/);
    assert.match(r.lens.checklist.join("|"), /내 가게 점검|내 관심 지역/);   // 현장 확인·내 가게 점검 같은 일반 항목은 남는다
  }
});

test("폐업률이 중앙값을 조금 넘는 정도로는 '높다'고 하지 않고, 1.25배 이상일 때만 눈에 띄게 높다고 한다", () => {
  const mk = (self: number, mode: "owner" | "founder") => ({ ...input, mode, peers: { ...input.peers, close: [4, 4.2, 4.3, self, 6, 3.9].map((v, i) => ({ code: i === 3 ? "u" : String(i), value: v, size: 30 })) } });
  for (const mode of ["owner", "founder"] as const) {
    const near = buildAreaReport(mk(4.9, mode));
    const sigNear = [...near.lens.positive, ...near.lens.caution].map((s) => s.title).join("|");
    assert.doesNotMatch(sigNear, /문 닫는|문을 닫는/);                       // 4.9% vs 중앙값 약 4.25% — 신호 없음
    const far = buildAreaReport(mk(9, mode));
    assert.match([...far.lens.caution].map((s) => s.title).join("|"), /눈에 띄게 높습니다|상위 25%/);
  }
});

test("자영업자: 제목이 말한 비는 시간대를 핵심 발견에서 다시 반복하지 않는다", () => {
  const r = buildAreaReport({ ...input, mode: "owner" });
  assert.ok(r.lens.positive.some((s) => s.title.includes("매출 비중이 비교 평균보다 낮습니다")));
  assert.ok(!r.findings.some((f) => f.title === r.headline));
});

test("직장인구 신호: 절대 인원이 아니라 업무형 판정 비중으로 말하고, 판정 불가·자료 없음이면 만들지 않는다", () => {
  const ch = (demand: unknown) => ({ ...input, mode: "owner" as const, character: { ...input.character!, sections: { ...input.character!.sections, demand } as never } });
  const has = (r: ReturnType<typeof buildAreaReport>) => r.lens.positive.some((s) => s.title.includes("직장인구"));
  assert.ok(has(buildAreaReport(ch({ workers: { value: 14034 }, worker_share_pct: 72.4, demand_type: "업무형", base_ok: true }))));
  assert.ok(!has(buildAreaReport(ch({ workers: { value: 14034 }, worker_share_pct: 40, demand_type: "혼합형", base_ok: true }))));       // 인원이 커도 비중이 낮으면 만들지 않는다
  assert.ok(!has(buildAreaReport(ch({ workers: { value: 245 }, worker_share_pct: 63.6, demand_type: "업무형", base_ok: false }))));       // 판정 가능 최소 인구 미만
  assert.ok(!has(buildAreaReport({ ...input, mode: "owner", character: null })));                                                           // 유형 자료 없음 — 1,500명 같은 고정 기준으로 대신하지 않는다
  const r = buildAreaReport(ch({ workers: { value: 3000 }, worker_share_pct: 66.2, demand_type: "업무형", base_ok: true }));
  assert.match(r.lens.positive.find((s) => s.title.includes("직장인구"))!.body, /66\.2%.*60% 이상/);
});

test("신호가 없을 때 이유를 구분한다: 자료 없음 / 표본 부족 / 평균 수준(중립) — 일부러 신호를 만들지 않는다", () => {
  const none = buildAreaReport({ ...input, rows: input.rows.filter((r) => r.key === "stores_sbiz"), overview: null, character: null, mode: "owner", peers: { perStore: [], close: [], open: [], frc: [] } });
  assert.equal(none.lens.positive.length + none.lens.caution.length, 0);
  assert.match(none.lens.emptyNote, /추정매출 자료가 없어.*0이 아니라 자료 없음/);
  const small = buildAreaReport({ ...withStores(6, "owner"), overview: { ...withStores(6).overview!, hours: { slots: [], pilot: undefined }, floating: null }, character: null });
  assert.match(small.lens.emptyNote, /6곳뿐이라.*표본이 작아 해석을 보류/);
  // 평균 수준: 신호 기준을 넘는 값이 하나도 없는 자료
  const flat = buildAreaReport({
    ...input, mode: "founder", character: null,
    rows: input.rows.map((r) => (r.key === "sales_yoy_pct" ? { ...r, cells: [{ value: 0 }] } : ["stores_change_2y", "stores_volatility", "frc_share", "wrc_total"].includes(r.key) ? { ...r, cells: [{ value: r.key === "wrc_total" ? 100 : 5 }] } : r)),
    overview: { ...input.overview!, hours: { slots: input.overview!.hours.slots.map((s) => ({ ...s, pct: 16.6 })), pilot: { ...input.overview!.hours.pilot!, slots: input.overview!.hours.pilot!.slots.map((s) => ({ ...s, pct: 16.6 })) } }, floating: null },
    peers: { ...input.peers, perStore: [{ code: "u", value: 39_000_000, size: 31 }, { code: "x", value: 40_000_000, size: 30 }, { code: "y", value: 38_000_000, size: 30 }], close: [4, 5, 4.5].map((v, i) => ({ code: i === 0 ? "u" : String(i), value: v, size: 30 })), open: [] },
  });
  if (flat.lens.positive.length + flat.lens.caution.length === 0) assert.match(flat.lens.emptyNote, /평균 수준.*일부러 만들지 않았습니다/);
  else assert.equal(flat.lens.emptyNote, "");
});

test("점포 10곳 미만 상권 리포트: 순위·증감·폐업률 타일을 만들지 않고, 시간대 신호에는 참고용 문구를 붙인다", () => {
  for (const mode of ["owner", "founder"] as const) {
    const r = buildAreaReport(withStores(7, mode));
    assert.ok(!r.tiles.some((t) => /위$/.test(t.value) || t.label.includes("증감") || t.label.includes("폐업률")));
    assert.match(r.tiles[0].note, /참고용\(10곳 미만\)/);
    const slotSignals = [...r.lens.positive, ...r.lens.caution, ...r.lens.neutral].filter((s) => /시간대|중심|쏠려/.test(s.title));
    assert.ok(slotSignals.length > 0 && slotSignals.every((s) => s.body.includes("참고용")));
  }
});

test("점포 10곳 미만 상권: 안정성 문장·프로필에서도 폐업률·개업률·프랜차이즈 비율을 빼고 이유를 밝힌다", () => {
  const r = buildAreaReport(withStores(7, "owner"));
  assert.equal(r.stability?.churn, null);
  assert.equal(r.stability?.frc, null);
  assert.match(r.stability!.text, /7곳뿐이라.*비교하지 않았습니다/);
  assert.ok(!r.profile.some((p) => p.label.includes("프랜차이즈")));
  assert.ok(!r.stability!.facts.some((f) => f.label.includes("폐업률") || f.label.includes("개업률")));
  assert.ok(!r.findings.some((f) => /폐업률은 \d/.test(f.title)));
  const ok = buildAreaReport(withStores(25, "owner"));            // 25곳이면 그대로 비교한다
  assert.ok(ok.stability?.churn && ok.stability.frc);
});

test("지나가는 사람 대비 매출 비교에서 0~6시(대부분 집에 있는 주민)는 뺀다", () => {
  const base = withStores(31, "owner");
  const slots = ["00~06시", "06~11시", "11~14시", "14~17시", "17~21시", "21~24시"];
  const r = buildAreaReport({ ...base, overview: { ...base.overview!, hours: { slots: slots.map((label, i) => ({ label, pct: [0, 10, 30, 10, 40, 10][i] })), pilot: undefined }, floating: { label: "x", flpop: 1000, yoy_pct: 0, weekend_pct: 25, slots: slots.map((label, i) => ({ label, pct: [40, 20, 10, 10, 10, 10][i] })) } } });
  const t = [...r.lens.positive].map((s) => s.title).join("|");
  assert.doesNotMatch(t, /00~06시는 지나가는 사람/);
  assert.match(t, /06~11시.*유동인구와 매출의 구성비 차이/);
  assert.ok(!r.lens.checklist.some((c) => c.includes("00~06시 시간대에 내 가게가 열려")));
});

test("핵심 발견 제목은 서로 되풀이하지 않는다 — 제목이 점포당 매출 문장이면 시간대 발견은 자기 제목을 쓴다", () => {
  const base = withStores(31, "founder");
  const flat = (v: number) => ({ ...base, overview: { ...base.overview!, hours: { slots: base.overview!.hours.slots.map((s) => ({ ...s, pct: v })), pilot: { ...base.overview!.hours.pilot!, slots: base.overview!.hours.pilot!.slots.map((s) => ({ ...s, pct: v })) } } } });
  const r = buildAreaReport(flat(16.6));
  assert.match(r.headline, /중앙값의/);
  assert.equal(new Set(r.findings.map((f) => f.title)).size, r.findings.length);
  assert.match(r.findings.find((f) => f.title.includes("시간대별 매출 비중"))!.title, /시간대별 매출 비중은 평균과 큰 차이가 없습니다/);
  for (const m of ["owner", "founder"] as const) {
    const t = buildAreaReport({ ...base, mode: m }).findings.map((f) => f.title);
    assert.equal(new Set(t).size, t.length);
  }
});

test("분기 폐업률 문구는 기준 분기를 밝히고, 연 폐업률은 기간이 다른 값이라 직접 견주지 않는다고 말한다", () => {
  const rep = buildAreaReport({ ...input, peerQuarter: "20262" });
  assert.match(rep.stability!.text, /최근 분기\(2026년 2분기\) 폐업률은/);
  assert.match(rep.stability!.text, /최근 1년.*연 폐업률은 .*한 분기 값과는 기간이 달라 직접 견주지 않습니다/);
  assert.ok(rep.tiles.some((t) => t.label.includes("최근 분기 2026년 2분기")));
  const none = buildAreaReport({ ...input });   // 기준 분기를 모르면 '최근 분기'로만 쓴다(없는 기간을 지어내지 않음)
  assert.match(none.stability!.text, /최근 분기 폐업률은/);
});


test("시간대 구성비를 미충족 수요로 해석하지 않고 자료 기준을 제공한다", () => {
  const r = buildAreaReport(input);
  assert.doesNotMatch(r.slots!.take, /수요를 덜 가져오고|잘 맞고/);
  assert.match(r.slots!.take, /다른 시간대의 매출이 커도 비중은 낮아질/);
  assert.ok(r.dataBasis.some((d) => d.label === "분기 개폐업률" && d.basis.includes("동일 업종")));
  assert.ok(!r.location!.facts.some((d) => /스세권|다세권/.test(d.label)));
});

test("점포당 매출 전년 동기 변화는 같은 분기 유효값으로만 계산한다", () => {
  const r = buildAreaReport({ ...input, overview: { ...input.overview!, trend: [
    { quarter: "20252", label: "2025년 2분기", per_store_month: 10000000, stores: 30 },
    { quarter: "20262", label: "2026년 2분기", per_store_month: 8000000, stores: 30 },
  ] } });
  assert.ok(Math.abs(r.level!.yoyPerStore! + 20) < 0.00001);
  const missing = buildAreaReport({ ...input, overview: { ...input.overview!, trend: [
    { quarter: "20262", label: "2026년 2분기", per_store_month: 8000000, stores: 30 },
  ] } });
  assert.equal(missing.level!.yoyPerStore, null);
});
