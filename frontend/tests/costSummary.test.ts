import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyDraft } from "../src/lib/costCheck.ts";
import { BASE_COST_FIELDS, costFill, orderHint, rentVsReference, salesBenchmark } from "../src/lib/costSummary.ts";
import { installFakeStorage } from "./_fakeStorage.ts";

installFakeStorage();
const d = (o: Partial<ReturnType<typeof emptyDraft>>) => ({ ...emptyDraft(), ...o });

test("비용 칸 채움 — 비어 있는 칸 이름을 순서대로 돌려준다", () => {
  const f = costFill(d({ rent: "250", labor: "500", cogsPct: "35" }));
  assert.equal(f.total, BASE_COST_FIELDS.length);
  assert.equal(f.filled, 3);
  assert.deepEqual(f.missing, ["관리비", "내 월급", "기타 고정비", "수수료율"]);
});

test("0 은 입력한 값이고, 공백·숫자가 아닌 글자는 입력하지 않은 것으로 센다", () => {
  assert.equal(costFill(d({ rent: "0", labor: " ", otherFixed: "abc" })).filled, 1);
});

test("월세·관리비 합계로 저장된 옛 기록은 관리비를 채운 것으로 본다", () => {
  const f = costFill(d({ rent: "280", legacyRentCombined: "1" }));
  assert.ok(!f.missing.includes("관리비"));
  assert.equal(f.filled, 2);
});

test("모두 채우면 비어 있는 칸이 없다", () => {
  const all = d({ rent: "1", maintenance: "1", labor: "1", ownerPay: "1", otherFixed: "1", cogsPct: "1", feePct: "1" });
  assert.deepEqual(costFill(all), { filled: 7, total: 7, missing: [] });
});

test("필요 매출을 지역 점포당 평균과 견준다 — 만원 단위, ±10% 는 비슷함", () => {
  const hi = salesBenchmark(1210, 6_691_108.16);
  assert.ok(hi);
  assert.equal(hi.pct, 181);
  assert.equal(hi.level, "high");
  assert.ok(Math.abs(hi.benchManwon - 669.110816) < 1e-9);
  assert.equal(salesBenchmark(600, 6_000_000)?.level, "similar");
  assert.equal(salesBenchmark(540, 6_000_000)?.level, "similar"); // 정확히 90% 는 경계라 비슷함
  assert.equal(salesBenchmark(530, 6_000_000)?.level, "low");
});

test("지역 평균이 없거나 0 이하면 비교하지 않는다", () => {
  assert.equal(salesBenchmark(1000, null), null);
  assert.equal(salesBenchmark(1000, 0), null);
  assert.equal(salesBenchmark(null, 5_000_000), null);
});

test("내 ㎡당 월세(원)와 참고값(천원/㎡)을 견준다 — ±5% 는 비슷함", () => {
  const r = rentVsReference(47_000, 41.9);
  assert.ok(r);
  assert.equal(r.mine, 47);
  assert.equal(r.diffPct, 12);
  assert.equal(r.level, "high");
  assert.equal(rentVsReference(42_000, 41.9)?.level, "similar");
  assert.equal(rentVsReference(30_000, 41.9)?.level, "low");
  assert.ok((rentVsReference(30_000, 41.9)?.diffPct ?? 0) < 0);
});

test("월세 단가나 참고값이 없으면 월세를 비교하지 않는다", () => {
  assert.equal(rentVsReference(null, 41.9), null);
  assert.equal(rentVsReference(40_000, null), null);
  assert.equal(rentVsReference(40_000, 0), null);
});

test("하루 필요 주문이 빈 이유를 알려준다", () => {
  assert.equal(orderHint("", "", false, null), "월 영업일과 주문 1건당 결제액을 넣으면 계산돼요.");
  assert.equal(orderHint("26", "", false, null), "주문 1건당 결제액을 넣으면 계산돼요.");
  assert.equal(orderHint("", "12000", false, null), "월 영업일을 넣으면 계산돼요.");
  assert.equal(orderHint("40", "12000", true, null), "영업일은 1~31일, 주문 금액은 0원 초과로 입력해 주세요.");
  assert.equal(orderHint("26", "12000", false, 5), null);
});
