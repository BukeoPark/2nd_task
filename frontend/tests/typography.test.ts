import assert from "node:assert/strict";
import { test } from "node:test";
import { BTN_MIN_HEIGHT, FS } from "../src/lib/typography.ts";

test("글자 크기 단계는 중요도 순서를 지키고 각 범위 안에 있다", () => {
  assert.ok(FS.screenTitle >= 22 && FS.screenTitle <= 24);
  assert.ok(FS.cardTitle >= 16 && FS.cardTitle <= 18);
  assert.ok(FS.metric >= 24 && FS.metric <= 28);
  assert.ok(FS.body >= 15 && FS.body <= 16);
  assert.ok(FS.ui >= 14 && FS.ui <= 16);
  assert.ok(FS.warn >= 13 && FS.warn <= 14);
  assert.ok(FS.caption >= 12 && FS.caption <= 13);
  // 화면 제목·핵심 숫자 > 카드 제목 > 본문 > 메뉴·버튼 > 경고 > 보조 설명
  assert.ok(FS.metric > FS.screenTitle || FS.metric >= FS.screenTitle);
  assert.ok(FS.screenTitle > FS.cardTitle && FS.cardTitle > FS.body && FS.body >= FS.ui && FS.ui > FS.warn && FS.warn > FS.caption);
});

test("입력칸은 16px 이상(휴대폰 자동 확대 방지)이고 버튼 최소 높이가 있다", () => {
  assert.ok(FS.input >= 16);
  assert.ok(BTN_MIN_HEIGHT >= 36);
});

test("화면 코드는 숫자 글자 크기를 직접 쓰지 않고 FS 단계를 쓴다(지도 마커·인쇄 보고서·랜딩·글리프 단추 제외)", async () => {
  const { readdirSync, readFileSync, statSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const root = fileURLToPath(new URL("../src", import.meta.url));
  const walk = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : n.endsWith(".tsx") ? [join(d, n)] : []));
  const EXCLUDE = ["features/landing/", "features/stores/report/", "features/area/AreaReportModal", "AnchorLayer", "AreaBubbleLayer", "SearchMarker", "SearchStoresLayer", "SelectedStoreMarker", "FacilityLayer", "RailStationLayer", "features/map/"];
  const bad: string[] = [];
  for (const f of walk(root)) {
    const rel = f.slice(root.length + 1);
    if (EXCLUDE.some((e) => rel.includes(e))) continue;
    readFileSync(f, "utf8").split("\n").forEach((line, i) => {
      if (/fontSize:\s*[\d.]+/.test(line) && !/aria-label="(닫기|비교에서 삭제|검색어 지우기|이전 화면으로)"/.test(line)) bad.push(`${rel}:${i + 1}`);
    });
  }
  assert.deepEqual(bad, [], `숫자 글자 크기를 직접 쓴 곳: ${bad.join(", ")}`);
});
