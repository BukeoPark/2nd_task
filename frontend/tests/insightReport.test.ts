import assert from "node:assert/strict";
import { test } from "node:test";
import { bigPeerRank, buildInsightReport, median, type BenchIn, type ReportInput } from "../src/lib/insightReport.ts";
import { pickDefaultDong } from "../src/lib/searchTarget.ts";

const slotItems = (me: number[], pilot: number[]) =>
  ["0~6시", "6~11시", "11~14시", "14~17시", "17~21시", "21~24시"].map((label, i) => ({ key: `t${i}`, label, dong: me[i], pilot: pilot[i] }));

const bench: BenchIn = {
  status: "ok", svc_nm: "한식음식점", quarter_label: "2026년 2분기",
  unit: { label: "상권", name: "문래역", type: "발달상권", peer_label: "파일럿 구 상권" },
  per_store_month: 39_000_000, stores: 31, rank: 10, peer_count: 5,
  growth: { yoy: { compare_label: "2025년 2분기", total_sales: { value: -5.6 }, per_store: { value: -2.6 } }, qoq: { compare_label: "2026년 1분기", per_store: { value: -2.9 } } },
  peers: [
    { name: "a", per_store_month: 120_000_000, stores: 3 },
    { name: "b", per_store_month: 45_000_000, stores: 80 },
    { name: "me", per_store_month: 39_000_000, stores: 31 },
    { name: "c", per_store_month: 20_000_000, stores: 50 },
    { name: "d", per_store_month: 5_000_000, stores: 6 },
  ],
  trend: [
    { quarter: "20244", label: "2024년 4분기", per_store_month: 45_000_000, stores: 33 },
    { quarter: "20262", label: "2026년 2분기", per_store_month: 39_000_000, stores: 31 },
  ],
  composition: [{ group: "시간대별", items: slotItems([0.01, 0.002, 0.195, 0.055, 0.553, 0.185], [0.025, 0.016, 0.326, 0.085, 0.407, 0.142]) }],
  insights: [{ group: "시간대별", label: "17~21시", gap_pctp: 14.5 }, { group: "시간대별", label: "11~14시", gap_pctp: -13 }],
  floating: { flpop_yoy_pct: -15.5, mix: [] },
  franchise_share: { share: 0.29, frc_stores: 9, stores: 31, peer_median: 0.08 },
  churn: { status: "ok", period: "2025년 3분기~2026년 2분기", opened: 4, closed: 6, avg_stores: 30.5, open_rate: 0.131, close_rate: 0.197, peer_count: 116, peer_median_open: 0.128, peer_p75_open: 0.203, peer_median_close: 0.127, peer_p75_close: 0.193 },
  hinterland: { workplace: { total: 2644, age_share: { age30: 0.327, age40: 0.309 } }, peer_median: { workplace: 475 } },
};
const input: ReportInput = {
  store: { name: "예시닭갈비", branch: "본점", category: "돼지고기 구이/찜", dong: "문래동", sigungu: "영등포구", areaName: "문래역", areaKind: "발달상권" },
  licenseAge: "7년 1개월", licenseState: "일반음식점 영업/정상", anchors: [{ label: "다이소", nearestM: 39 }, { label: "스타벅스", nearestM: null }],
  bench, nearby: null, loc: null, today: "2026-10-14",
};

test("점포 20곳 이상인 비교 상권끼리만 순위를 센다", () => {
  assert.deepEqual(bigPeerRank(39e6, 31, bench.peers!), { rank: 2, count: 3 });
  assert.deepEqual(bigPeerRank(39e6, 12, bench.peers!), { rank: null, count: 3 }); // 이 상권 점포가 적으면 순위를 만들지 않는다
  assert.equal(median([3, 1, 2]), 2);
});

test("값은 API 그대로, 문장은 규칙으로 만든다", () => {
  const r = buildInsightReport(input);
  assert.equal(r.level?.me, 3900);
  assert.match(r.level!.text, /3,900만원/);
  assert.match(r.level!.text, /정점보다 13% 낮습니다/);
  assert.match(r.level!.text, /점포당 -2\.6%, 총매출 -5\.6%/);
  assert.equal(r.headline, "문래역 한식음식점은 17~21시 매출 비중이 평균보다 높다");
  assert.match(r.slots!.text, /17~21시 매출 비중 55\.3%는 파일럿 구 상권 평균\(40\.7%\)보다 14\.6%p 높고, 11~14시 비중 19\.5%는 평균\(32\.6%\)보다 13\.1%p 낮습니다\./);
  assert.match(r.slots!.text, /직장인구는 2,644명으로 .*중앙값\(475명\)의 5\.6배입니다/);
});

test("자료가 없는 쪽은 만들지 않고, 값이 모르는 앵커는 프로필에 넣지 않는다", () => {
  const r = buildInsightReport(input);
  assert.equal(r.competition?.churn?.closed, 6);
  assert.equal(r.factors, null);
  assert.deepEqual(r.profile.find((p) => p.label === "가까운 앵커 브랜드")?.value, "다이소 39m");
  const none = buildInsightReport({ ...input, bench: { status: "no_match" }, nearby: null, loc: null });
  assert.equal(none.level, null);
  assert.equal(none.slots, null);
  assert.equal(none.competition, null);
  assert.deepEqual(none.tiles, []);
});

test("체크리스트는 데이터가 근거일 때만 항목을 만든다", () => {
  const r = buildInsightReport(input);
  assert.ok(r.checklist.some((c) => c.includes("-2.6%")));
  assert.ok(r.checklist.some((c) => c.includes("11~14시")));
  assert.ok(r.checklist.some((c) => c.includes("이웃 가게")));
  assert.ok(r.checklist.some((c) => c.includes("프랜차이즈")));
});

test("기본 행정동은 이름이 정확히 같은 행정동만 고른다", () => {
  const res = [
    { kind: "trdar", name: "영등포동성당" },
    { kind: "address", name: "서울특별시 영등포구 경인로 827-1" },
    { kind: "dong", name: "영등포구 영등포동" },
  ];
  assert.equal(pickDefaultDong(res, "영등포동")?.name, "영등포구 영등포동");
  assert.equal(pickDefaultDong(res.slice(0, 2), "영등포동"), null);
  assert.equal(pickDefaultDong([{ kind: "dong", name: "양천구 신영등포동" }], "영등포동"), null);
});
