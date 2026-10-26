/** Convert browser screen coordinates to the application's layout coordinates. */
export function displayScale(): number {
  const root = document.getElementById("root");
  return root ? Number.parseFloat(getComputedStyle(root).zoom) || 1 : 1;
}
export function layoutRect(rect: DOMRect) {
  const scale = displayScale();
  return { left: rect.left / scale, top: rect.top / scale, bottom: rect.bottom / scale,
    width: rect.width / scale, height: rect.height / scale };
}
export function layoutViewport() {
  const scale = displayScale();
  return { width: window.innerWidth / scale, height: window.innerHeight / scale };
}
