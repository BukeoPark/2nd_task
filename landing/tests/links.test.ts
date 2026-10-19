import assert from "node:assert/strict";
import { test } from "node:test";
import { appLink, DEFAULT_APP_URL, normalizeAppUrl } from "../lib/links.ts";

test("지도 앱 주소는 끝 슬래시·공백을 정리하고, 비어 있으면 로컬 개발 주소를 쓴다", () => {
  assert.equal(normalizeAppUrl("https://app.example.com/"), "https://app.example.com");
  assert.equal(normalizeAppUrl("  https://app.example.com//  "), "https://app.example.com");
  assert.equal(normalizeAppUrl(undefined), DEFAULT_APP_URL);
  assert.equal(normalizeAppUrl(""), DEFAULT_APP_URL);
});

test("시작 버튼은 모드를 주소에 붙여 지도 앱으로 보낸다", () => {
  assert.equal(appLink("https://app.example.com/", "owner"), "https://app.example.com/?mode=owner");
  assert.equal(appLink("", "founder"), `${DEFAULT_APP_URL}/?mode=founder`);
});
