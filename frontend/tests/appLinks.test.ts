import assert from "node:assert/strict";
import { test } from "node:test";
import { DEV_LANDING_URL, landingHref } from "../src/lib/appLinks.ts";

test("환경에 랜딩 주소가 있으면 끝 슬래시를 정리해 그대로 쓴다", () => {
  assert.equal(landingHref("https://home.example.com/", false), "https://home.example.com");
  assert.equal(landingHref(" http://localhost:3000 ", true), "http://localhost:3000");
});

test("없으면 개발은 기본 랜딩 개발 주소, 운영은 같은 도메인 맨 위", () => {
  assert.equal(landingHref(undefined, true), DEV_LANDING_URL);
  assert.equal(landingHref("", true), DEV_LANDING_URL);
  assert.equal(landingHref(undefined, false), "/");
});

test("http(s) 가 아닌 값(javascript: 등)은 믿지 않고 기본값으로", () => {
  assert.equal(landingHref("javascript:alert(1)", false), "/");
  assert.equal(landingHref("javascript:alert(1)", true), DEV_LANDING_URL);
});
