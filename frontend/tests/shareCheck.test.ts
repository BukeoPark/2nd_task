import assert from "node:assert/strict";
import { test } from "node:test";
import { checkShare, shareIssueText } from "../src/lib/shareCheck.ts";

const groups = [{ svc_cd: "CS100001", details: [{ code: "Q01A01" }] }, { svc_cd: "CS100010", details: [] }];
const ok = { svc: null, scls: null, groups, pending: null, unitCodes: null };

test("문제가 없으면 안내가 없다", () => {
  assert.equal(shareIssueText(checkShare({ ...ok, svc: "CS100001", scls: "Q01A01", pending: { code: "1" }, unitCodes: ["1", "2"] })), null);
});

test("목록이 아직 도착하지 않았으면 문제로 보지 않는다(무한 안내 방지)", () => {
  const r = checkShare({ svc: "CS999999", scls: "X", groups: null, pending: { code: "9" }, unitCodes: null });
  assert.deepEqual(r, { svcInvalid: false, sclsInvalid: false, unitMissing: false });
});

test("지원하지 않는 업종 코드와 없는 지역 코드를 알린다", () => {
  const r = checkShare({ ...ok, svc: "CS999999", pending: { code: "9" }, unitCodes: ["1"] });
  assert.equal(r.svcInvalid, true);
  assert.equal(r.unitMissing, true);
  const t = shareIssueText(r) ?? "";
  assert.match(t, /지역을 이 지도에서 찾지 못했어요/);
  assert.match(t, /'외식 전체'로 열었어요/);
});

test("세부 업종만 틀리면 업종 전체로 연다고 알린다(업종 코드가 틀린 경우와 겹쳐 말하지 않는다)", () => {
  const r = checkShare({ ...ok, svc: "CS100001", scls: "ZZZ" });
  assert.deepEqual(r, { svcInvalid: false, sclsInvalid: true, unitMissing: false });
  assert.match(shareIssueText(r) ?? "", /세부 업종/);
  assert.equal(checkShare({ ...ok, svc: "CS999999", scls: "ZZZ" }).sclsInvalid, false);
});
