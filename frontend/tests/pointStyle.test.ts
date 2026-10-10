import assert from "node:assert/strict";
import { test } from "node:test";
import { pointLook, pointRole, type PointContext } from "../src/lib/pointStyle.ts";

const colors = { selectedRing: "#111", peerRing: "#00f" };
const peers = new Set(["a", "b"]);
const ctx = (over: Partial<PointContext> = {}): PointContext => ({ selectedId: "s", hoveredId: null, peerIds: peers, ...over });

test("선택·마우스 올림이 최우선이고, 선택한 점은 올려도 선택 모양", () => {
  assert.equal(pointRole("s", ctx()), "selected");
  assert.equal(pointRole("s", ctx({ hoveredId: "s" })), "selected");
  assert.equal(pointRole("a", ctx({ hoveredId: "a" })), "hovered");
});

test("선택 매장이 있고 비교 대상을 알면 같은 단위·업종은 peer, 나머지는 other", () => {
  assert.equal(pointRole("a", ctx()), "peer");
  assert.equal(pointRole("z", ctx()), "other");
});

test("선택이 없거나 비교 대상을 아직 모르면 모두 plain — 모르는 걸 흐리게 하지 않는다", () => {
  assert.equal(pointRole("z", ctx({ selectedId: null })), "plain");
  assert.equal(pointRole("a", ctx({ peerIds: null })), "plain");
});

test("모양: 선택 > 올림 > peer = plain > other 순으로 크고, other 만 흐리며, 링은 선택·올림·peer 에만", () => {
  const l = (r: Parameters<typeof pointLook>[0]) => pointLook(r, colors);
  assert.ok(l("selected").size > l("hovered").size && l("hovered").size > l("peer").size);
  assert.equal(l("peer").size, l("plain").size);
  assert.ok(l("other").size < l("plain").size);
  assert.ok(l("other").opacity < 1 && ["selected", "hovered", "peer", "plain"].every((r) => l(r as never).opacity === 1));
  assert.equal(l("plain").ring, null);
  assert.equal(l("other").ring, null);
  assert.equal(l("peer").ring, "#00f");
  assert.equal(l("selected").ring, "#111");
  assert.ok(l("selected").zIndex > l("hovered").zIndex && l("hovered").zIndex > l("peer").zIndex && l("peer").zIndex > l("other").zIndex - 1);
});
