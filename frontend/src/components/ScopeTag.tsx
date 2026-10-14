import { SCOPE_STYLE, type ScopeKind } from "../lib/scope";

/** 블록 제목 옆 범위 라벨 — 이 정보가 이 매장·주변 반경·소속 상권·내 입력 중 어느 범위인지. 색만으로 구분하지 않도록 글자를 항상 쓴다. */
export function ScopeTag({ kind, label }: { kind: ScopeKind; label: string }) {
  const s = SCOPE_STYLE[kind];
  return (
    <span
      aria-label={`범위: ${label}`}
      style={{ background: s.bg, color: s.fg, borderRadius: 4, padding: "1px 6px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", lineHeight: 1.5 }}
    >
      {label}
    </span>
  );
}
