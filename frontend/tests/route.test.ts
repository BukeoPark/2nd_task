import assert from "node:assert/strict";
import { test } from "node:test";
import { HOME_PATH, MAP_PATH, isInternalPath, mapHref, resolveRoute } from "../src/lib/route.ts";

test("'/' 는 랜딩, '/map' 은 지도", () => {
  assert.deepEqual(resolveRoute("/", ""), { page: "landing", canonical: null });
  assert.deepEqual(resolveRoute("/map", "?mode=founder"), { page: "map", canonical: null });
});

test("예전 주소('/' 에 지도용 검색값)는 같은 검색값 그대로 /map 으로 — 모드·공유 링크 모두", () => {
  assert.deepEqual(resolveRoute("/", "?mode=owner"), { page: "map", canonical: "/map?mode=owner" });
  assert.deepEqual(resolveRoute("/", "?mode=founder&unit=dong:1156054000&svc=CS100001"), { page: "map", canonical: "/map?mode=founder&unit=dong:1156054000&svc=CS100001" });
  assert.deepEqual(resolveRoute("/", "?unit=trdar:3110001"), { page: "map", canonical: "/map?unit=trdar:3110001" });
  assert.deepEqual(resolveRoute("/index.html", "?scls=CS100001"), { page: "map", canonical: "/map?scls=CS100001" });
});

test("지도와 상관없는 검색값만 있으면 랜딩 그대로(유입 태그 등)", () => {
  assert.deepEqual(resolveRoute("/", "?utm_source=blog"), { page: "landing", canonical: null });
});

test("끝 슬래시·모르는 경로는 안전한 주소로 바꾼다", () => {
  assert.deepEqual(resolveRoute("/map/", "?mode=owner"), { page: "map", canonical: "/map?mode=owner" });
  assert.deepEqual(resolveRoute("/index.html", ""), { page: "landing", canonical: "/" });
  assert.deepEqual(resolveRoute("/nowhere", "?mode=owner"), { page: "landing", canonical: "/" });
});

test("랜딩의 모드 버튼 주소와 홈 주소", () => {
  assert.equal(mapHref("owner"), "/map?mode=owner");
  assert.equal(mapHref("founder"), "/map?mode=founder");
  assert.equal(HOME_PATH, "/");
  assert.equal(MAP_PATH, "/map");
  // 버튼 주소는 다시 풀어도 같은 화면(바꿔 쓸 일 없음)
  assert.deepEqual(resolveRoute("/map", "?mode=owner"), { page: "map", canonical: null });
});

test("앱 안 이동은 같은 사이트의 경로만 — 외부 주소·프로토콜 상대 주소·javascript: 는 막는다", () => {
  assert.equal(isInternalPath("/map?mode=owner"), true);
  assert.equal(isInternalPath("/"), true);
  assert.equal(isInternalPath("//evil.example"), false);
  assert.equal(isInternalPath("https://evil.example"), false);
  assert.equal(isInternalPath("javascript:alert(1)"), false);
});
