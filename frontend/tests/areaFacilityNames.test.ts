import assert from "node:assert/strict";
import { test } from "node:test";
import { displayCategory, namedCounts, namedFacilities } from "../src/lib/areaFacilityNames.ts";

test("대표 시설만 종류 순서대로 이름을 보인다(의원·약국·은행·앵커 브랜드는 뺀다)", () => {
  const pts = [
    { name: "아무의원", category: "병원" }, { name: "스타벅스 여의도점", category: "스타벅스" }, { name: "올리브영 신정점", category: "올리브영" },
    { name: "영산아트홀", category: "문화시설" }, { name: "CGV여의도", category: "영화관" }, { name: "KBS홀", category: "문화시설" },
    { name: "THE HYUNDAI SEOUL", category: "백화점" }, { name: "아이에프씨몰(IFC Mall)", category: "복합쇼핑몰" },
    { name: "가톨릭대학교 여의도성모병원", category: "종합병원" }, { name: "명지성모병원", category: "병원" }, { name: "경희한의원", category: "병원" }, { name: "국민은행", category: "은행" }, { name: "온누리약국", category: "약국" },
  ];
  assert.deepEqual(namedFacilities(pts).map((p) => `${p.shown}:${p.name}`), [
    "백화점:THE HYUNDAI SEOUL", "복합쇼핑몰:아이에프씨몰(IFC Mall)", "영화관:CGV여의도", "문화시설:KBS홀", "문화시설:영산아트홀", "대형병원:가톨릭대학교 여의도성모병원", "중형병원:명지성모병원",
  ]);
});

test("종합병원은 대형병원, 이름이 '병원'으로 끝나는 병원급은 중형병원, 의원은 뺀다", () => {
  assert.equal(displayCategory({ name: "서울성모병원", category: "종합병원" }), "대형병원");
  for (const n of ["명지성모병원", "OO한방병원", "OO치과병원", "OO요양병원"]) assert.equal(displayCategory({ name: n, category: "병원" }), "중형병원", n);
  for (const n of ["권내과의원", "경희한의원", "갤러리치과의원"]) assert.equal(displayCategory({ name: n, category: "병원" }), null, n);
});

test("종류별 개수와 빈 입력", () => {
  assert.deepEqual(namedCounts([{ name: "A병원", category: "병원" }, { name: "B병원", category: "병원" }, { name: "C의원", category: "병원" }, { name: "D", category: "백화점" }]), { 중형병원: 2, 백화점: 1 });
  assert.deepEqual(namedFacilities(null), []);
  assert.deepEqual(namedCounts(undefined), {});
});
