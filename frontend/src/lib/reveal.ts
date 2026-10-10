// 선택한 매장이 왼쪽 패널·상단 바에 가려지거나 화면 밖이면, 보이는 지도 영역의 가운데로 오도록 옮길 양(px)을 구한다.
// 이미 잘 보이면 null — 잘 보이는 점을 눌렀을 때 지도가 움직이지 않게 한다. 다른 모듈을 import 하지 않는 순수 함수(tests/reveal.test.ts).

export interface Insets {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** pt: 지도 컨테이너 안 점의 위치(px), view: 컨테이너 크기, safe: 가장자리에서 이만큼 안쪽이 '잘 보이는 영역'.
 * 반환값은 카카오 map.panBy(dx, dy) 에 그대로 넣는 지도 중심 이동량이다(점을 영역 가운데로 가져오려면 중심이 점 쪽으로 움직인다). */
export function revealDelta(pt: { x: number; y: number }, view: { w: number; h: number }, safe: Insets): { dx: number; dy: number } | null {
  const left = safe.left;
  const right = view.w - safe.right;
  const top = safe.top;
  const bottom = view.h - safe.bottom;
  if (right <= left || bottom <= top) return null; // 보이는 영역이 없을 만큼 좁은 화면 — 옮기지 않는다
  if (pt.x >= left && pt.x <= right && pt.y >= top && pt.y <= bottom) return null;
  return { dx: Math.round(pt.x - (left + right) / 2), dy: Math.round(pt.y - (top + bottom) / 2) };
}
