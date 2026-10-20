import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_SITE_URL, isProductionSite, normalizeSiteUrl } from "../lib/site.ts";

test("사이트 주소는 끝 슬래시·공백을 정리하고, 잘못된 값은 로컬 개발 주소로 돌린다", () => {
  assert.equal(normalizeSiteUrl(" https://sanggwon.example.com// "), "https://sanggwon.example.com");
  assert.equal(normalizeSiteUrl(undefined), DEFAULT_SITE_URL);
  assert.equal(normalizeSiteUrl(""), DEFAULT_SITE_URL);
  assert.equal(normalizeSiteUrl("sanggwon.example.com"), DEFAULT_SITE_URL); // 프로토콜이 없으면 인정하지 않는다
  assert.equal(normalizeSiteUrl("javascript:alert(1)"), DEFAULT_SITE_URL);
});

test("로컬 개발 주소는 배포가 아니므로 색인을 막는다", () => {
  assert.equal(isProductionSite("http://localhost:3000"), false);
  assert.equal(isProductionSite("http://127.0.0.1:3000"), false);
  assert.equal(isProductionSite("https://sanggwon.example.com"), true);
  assert.equal(isProductionSite("https://localhost.example.com"), true); // 이름이 비슷해도 로컬이 아님
});
