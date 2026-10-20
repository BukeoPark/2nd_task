import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_RECENT, loadRecent, pushRecent, sanitizeRecent, saveRecent, suggestForCompare, type RecentUnit } from "../src/lib/recentUnits.ts";
import { installFakeStorage } from "./_fakeStorage.ts";

const u = (level: "dong" | "trdar", code: string): RecentUnit => ({ level, code, name: `이름${code}`, type: null });

test("가장 최근 것이 앞에 오고 같은 지역은 한 번만 남는다", () => {
  let l: RecentUnit[] = [];
  l = pushRecent(l, u("trdar", "1"));
  l = pushRecent(l, u("trdar", "2"));
  l = pushRecent(l, u("trdar", "1"));
  assert.deepEqual(l.map((x) => x.code), ["1", "2"]);
});

test("최대 8곳만 둔다", () => {
  let l: RecentUnit[] = [];
  for (let i = 0; i < 12; i++) l = pushRecent(l, u("dong", String(i)));
  assert.equal(l.length, MAX_RECENT);
  assert.equal(l[0].code, "11");
});

test("비교 후보 제안: 같은 단위·아직 담지 않은 지역만 최근 순으로 최대 4곳", () => {
  const l = [u("trdar", "a"), u("dong", "b"), u("trdar", "c"), u("trdar", "d"), u("trdar", "e"), u("trdar", "f")];
  assert.deepEqual(suggestForCompare(l, "trdar", ["c"]).map((x) => x.code), ["a", "d", "e", "f"]);
  assert.deepEqual(suggestForCompare(l, "dong", []).map((x) => x.code), ["b"]);
  assert.deepEqual(suggestForCompare(l, "gu", []), []);
  assert.equal(suggestForCompare(l, "trdar", [], 2).length, 2);
});

test("저장 값을 다시 검사하고, 저장소가 막혀도 동작한다", () => {
  assert.deepEqual(sanitizeRecent([u("trdar", "1"), { level: "gu", code: "1", name: "n" }, u("trdar", "1"), "x"]).map((x) => x.code), ["1"]);
  const { data } = installFakeStorage();
  assert.equal(saveRecent([u("dong", "9")]), true);
  assert.equal(loadRecent()[0].code, "9");
  assert.equal(data.size, 1);
  installFakeStorage({ failWrite: true, failRead: true });
  assert.equal(saveRecent([u("dong", "9")]), false);
  assert.deepEqual(loadRecent(), []);
});
