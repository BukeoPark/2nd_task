import assert from "node:assert/strict";
import { test } from "node:test";
import { NOTE_MAX, buildReviewRows, loadNotes, saveNote } from "../src/lib/candidateReview.ts";
import { clearDraft, emptyDraft, loadDraft, saveDraft } from "../src/lib/costCheck.ts";
import type { FavoriteArea } from "../src/lib/favorites.ts";
import { installFakeStorage } from "./_fakeStorage.ts";

const fav = (code: string, name = code): FavoriteArea => ({ level: "dong", code, name, type: null, lon: null, lat: null, svc: null, scls: null });
const draft = (revenue: string) => ({ ...emptyDraft(), revenue, rent: "250", labor: "500", otherFixed: "80", cogsPct: "35", feePct: "3" });

test("후보 지역마다 비용 입력이 따로 저장되고, 전역(가장 최근) 값은 새 지역의 기본값이 된다", () => {
  installFakeStorage();
  saveDraft(draft("3000"), "dong:A");
  saveDraft(draft("1000"), "dong:B");
  assert.equal(loadDraft("dong:A").revenue, "3000");
  assert.equal(loadDraft("dong:B").revenue, "1000");
  assert.equal(loadDraft("dong:C").revenue, "1000");   // 저장 없는 지역은 가장 최근 입력(전역)을 기본값으로
  assert.equal(loadDraft().revenue, "1000");           // 지역 키 없이 읽으면 기존처럼 전역
});

test("지역 입력을 지워도 다른 지역·전역 값은 그대로이고, 지운 지역은 기본값으로 되돌아오지 않는다", () => {
  installFakeStorage();
  saveDraft(draft("3000"), "dong:A");
  saveDraft(draft("2000"), "dong:B");
  clearDraft("dong:A");
  assert.equal(loadDraft("dong:A").revenue, "");
  assert.equal(loadDraft("dong:B").revenue, "2000");
  assert.equal(loadDraft().revenue, "2000");
});

test("검토함 한 줄: 저장된 비용 요약·메모만 읽고, 없으면 null·빈 문자열", () => {
  installFakeStorage();
  saveDraft(draft("3000"), "dong:A");
  assert.ok(saveNote("dong:A", "역에서 가깝다"));
  const [a, b] = buildReviewRows([fav("A"), fav("B")]);
  assert.ok(a.cost && Math.round(a.cost.bepMan as number) === 1339 && Math.round(a.cost.profitMan as number) === 1030);
  assert.equal(a.note, "역에서 가깝다");
  assert.equal(b.cost, null);              // 저장한 적 없는 후보에는 계산을 지어내지 않는다
  assert.equal(b.note, "");
});

test("후보 순서는 담은 순서 그대로(점수·순위로 정렬하지 않는다)", () => {
  installFakeStorage();
  saveDraft(draft("5000"), "dong:Z");
  saveDraft(draft("100"), "dong:A");
  assert.deepEqual(buildReviewRows([fav("Z"), fav("A")]).map((r) => r.key), ["dong:Z", "dong:A"]);
});

test("메모는 길이 제한과 빈 값 삭제, 잘못된 키는 버린다", () => {
  const { data } = installFakeStorage();
  saveNote("dong:A", "x".repeat(NOTE_MAX + 50));
  assert.equal(loadNotes()["dong:A"].length, NOTE_MAX);
  saveNote("dong:A", "   ");
  assert.equal(loadNotes()["dong:A"], undefined);
  data.set("candidateNotes:v1", JSON.stringify({ "bad key": "x", "trdar:12": "ok" }));
  assert.deepEqual(loadNotes(), { "trdar:12": "ok" });
});
