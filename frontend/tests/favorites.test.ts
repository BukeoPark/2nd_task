import assert from "node:assert/strict";
import { test } from "node:test";
import { FAVORITES_KEY, MAX_FAVORITES, addFavorite, favKey, isFavorite, loadFavorites, parseShare, removeFavorite, sanitizeFavorites, saveFavorites, shareSearch, type FavoriteArea } from "../src/lib/favorites.ts";
import { installFakeStorage } from "./_fakeStorage.ts";

const fav = (i: number, over: Partial<FavoriteArea> = {}): FavoriteArea => ({ level: "trdar", code: `31${i}`, name: `상권${i}`, type: "골목상권", lon: 126.9, lat: 37.5, svc: null, scls: null, ...over });

test("같은 지역은 한 번만 담고, 10곳을 넘으면 막는다", () => {
  let list: FavoriteArea[] = [];
  const first = addFavorite(list, fav(1));
  assert.equal(first.status, "added");
  list = first.list;
  assert.equal(addFavorite(list, fav(1, { svc: "CS100001" })).status, "duplicate");        // 업종이 달라도 같은 지역이면 중복
  assert.equal(addFavorite(list, fav(1, { level: "dong" })).status, "added");               // 단위가 다르면 다른 지역
  for (let i = 2; i <= MAX_FAVORITES; i++) list = addFavorite(list, fav(i)).list;
  assert.equal(list.length, MAX_FAVORITES);
  const over = addFavorite(list, fav(99));
  assert.equal(over.status, "full");
  assert.equal(over.list.length, MAX_FAVORITES);
});

test("제거와 포함 여부", () => {
  const list = addFavorite(addFavorite([], fav(1)).list, fav(2)).list;
  assert.equal(isFavorite(list, { level: "trdar", code: "311" }), true);
  assert.deepEqual(removeFavorite(list, favKey(fav(1))).map((f) => f.code), ["312"]);
  assert.equal(removeFavorite(list, "trdar:없음").length, 2);
});

test("저장 값은 믿지 않고 다시 검사한다(모양·코드·중복·초과)", () => {
  const dirty = [fav(1), fav(1), { level: "gu", code: "x", name: "n" }, { level: "dong", code: "<script>", name: "n" }, { level: "dong", code: "ok", name: "  " }, null, "s", fav(2, { svc: "bad", scls: "x y" })];
  const clean = sanitizeFavorites(dirty);
  assert.deepEqual(clean.map((f) => f.code), ["311", "312"]);
  assert.equal(clean[1].svc, null);
  assert.equal(clean[1].scls, null);
  assert.equal(sanitizeFavorites(Array.from({ length: 30 }, (_, i) => fav(i))).length, MAX_FAVORITES);
  assert.deepEqual(sanitizeFavorites("not array"), []);
});

test("브라우저에만 저장하고 막히면 실패를 알린다", () => {
  const { data } = installFakeStorage();
  assert.equal(saveFavorites([fav(1)]), true);
  assert.deepEqual([...data.keys()], [FAVORITES_KEY]);
  assert.equal(loadFavorites()[0].name, "상권1");
  installFakeStorage({ failWrite: true, failRead: true });
  assert.equal(saveFavorites([fav(1)]), false);
  assert.deepEqual(loadFavorites(), []);
});

test("공유 주소에는 모드·단위:코드·업종 코드만 담고 개인정보·매출·비용 값은 담지 않는다", () => {
  const s = shareSearch("founder", { level: "trdar", code: "3130205", svc: "CS100001", scls: "I56111" });
  assert.equal(s, "?mode=founder&unit=trdar%3A3130205&svc=CS100001&scls=I56111");
  assert.deepEqual([...new URLSearchParams(s).keys()].sort(), ["mode", "scls", "svc", "unit"]);
  assert.equal(shareSearch("weird", { level: "dong", code: "1", svc: null, scls: null }), "?mode=owner&unit=dong%3A1");
});

test("공유 주소를 읽을 때 모양이 틀린 값은 무시한다", () => {
  assert.deepEqual(parseShare("?mode=owner&unit=trdar:3130205&svc=CS100001&scls=I56111"), { level: "trdar", code: "3130205", svc: "CS100001", scls: "I56111" });
  assert.deepEqual(parseShare("?unit=dong:11560"), { level: "dong", code: "11560", svc: null, scls: null });
  assert.equal(parseShare("?unit=gu:1"), null);
  assert.equal(parseShare("?unit=trdar:<x>"), null);
  assert.equal(parseShare(""), null);
  assert.equal(parseShare("?unit=dong:1&svc=evil&scls=a b")!.svc, null);
});
