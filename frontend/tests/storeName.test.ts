import test from "node:test";
import assert from "node:assert/strict";
import { splitStoreName } from "../src/lib/storeName.ts";

test("붙어 있는 역·동 지점명을 표시용으로 분리한다", () => {
  assert.deepEqual(splitStoreName("금돈정영등포역점", ""), { name: "금돈정", branch: "영등포역점" });
  assert.deepEqual(splitStoreName("금동정영등포역점", null), { name: "금동정", branch: "영등포역점" });
  assert.deepEqual(splitStoreName("브랜드신정네거리역점", null), { name: "브랜드", branch: "신정네거리역점" });
});
test("원본 지점명은 우선하고 불확실한 상호는 그대로 둔다", () => {
  assert.deepEqual(splitStoreName("제비파스타&리조또", "영등포점"), { name: "제비파스타&리조또", branch: "영등포점" });
  for (const name of ["역전할머니맥주", "영등포역점", "금점", "아일럼", "금돈정미확인지역점"]) {
    assert.deepEqual(splitStoreName(name, null), { name, branch: null });
  }
});

test("브랜드 근거로 공원·건물 지점명도 통째로 분리한다", () => {
  for (const [full, name, branch] of [
    ["푸디스트CCMM빌딩점", "푸디스트", "CCMM빌딩점"],
    ["커피사피엔스여의도시그니티점", "커피사피엔스", "여의도시그니티점"],
    ["매머드익스프레스여의도공원점", "매머드익스프레스", "여의도공원점"],
  ]) assert.deepEqual(splitStoreName(full, null), { name, branch });
  assert.deepEqual(splitStoreName("여의도뚝배기", null), { name: "여의도뚝배기", branch: null });
});

test("원본 지점명이 이름 중간에서 잘렸어도 전체 이름으로 다시 분리한다", () => {
  for (const [name, branch, expectedName, expectedBranch] of [
    ["이디야영등포아크로", "타워점", "이디야", "영등포아크로타워점"],
    ["아워홈한림성심병원", "한강점", "아워홈", "한림성심병원한강점"],
    ["생활맥주영등포시장역점", "", "생활맥주", "영등포시장역점"],
    ["낭만치맥영등포아크로", "타워점", "낭만치맥", "영등포아크로타워점"],
    ["네모오징어대방역점", "", "네모오징어", "대방역점"],
  ]) assert.deepEqual(splitStoreName(name, branch), { name: expectedName, branch: expectedBranch });
  assert.deepEqual(splitStoreName("스타벅스", "여의도공원R"), { name: "스타벅스", branch: "여의도공원R" });
});

test("추가 브랜드와 지점 뒤 법인 표기를 분리한다", () => {
  for (const [name, branch, expectedName, expectedBranch] of [
    ["퀴즈노스트윈점", "", "퀴즈노스", "트윈점"],
    ["아워홈트윈점주", "", "아워홈", "트윈점"],
    ["삼육공여의도케이", "타워점", "삼육공", "여의도케이타워점"],
    ["나이스카페인클럽여의도한강공원점", "", "나이스카페인클럽", "여의도한강공원점"],
  ]) assert.deepEqual(splitStoreName(name, branch), { name: expectedName, branch: expectedBranch });
  assert.deepEqual(splitStoreName("생활맥주", null), { name: "생활맥주", branch: null });
});

test("상호 일부를 지점명으로 잘못 넘기지 않는다", () => {
  for (const [name, branch, expectedName, expectedBranch] of [
    ["60계치킨", "여의도점", "60계치킨", "여의도점"],
    ["노브랜드버거", "신정네거리점", "노브랜드버거", "신정네거리점"],
    ["피크닉영등포", "1호점", "피크닉", "영등포1호점"],
    ["우리동네대통령", "오목교점", "우리동네대통령", "오목교점"],
    ["메가엠지씨커피여의도KBS점", null, "메가엠지씨커피", "여의도KBS점"],
    ["컴포즈커피국회의", "사당역점", "컴포즈커피", "국회의사당역점"],
  ]) assert.deepEqual(splitStoreName(name, branch), { name: expectedName, branch: expectedBranch });
});

test("점으로 끝나는 일반 상호를 지점으로 오인하지 않는다", () => {
  for (const name of ["홍콩반점", "나폴레옹과자점", "스카이노래주점", "달상점", "프로젝트너굴상점"]) {
    assert.deepEqual(splitStoreName(name, null), { name, branch: null });
  }
});
