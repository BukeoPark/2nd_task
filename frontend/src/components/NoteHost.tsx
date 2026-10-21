import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface NoteCtx {
  target: HTMLElement | null;
  attach: (el: HTMLDivElement | null) => void;
  count: number;
}

/** undefined = NoteHost 밖, target null = NoteHost 안이지만 접이식이 아직 그려지기 전 */
const Ctx = createContext<NoteCtx | undefined>(undefined);

/** 한 화면(탭)의 해석상 유의사항을 한 곳에 모아 '읽는 법·유의사항' 접이식으로 보인다. 처음에는 접혀 있어 숫자와 그래프가 먼저 보인다.
 * 안에 둔 `Caveat` 는 제자리에 그리지 않고 이 접이식으로 모인다. 값이 0 이거나 자료가 없는 이유, 실패 같은 상태 안내(Notice)는 모으지 않고 제자리에 둔다.
 * 접이식은 기본으로 맨 위에 두고, `manual` 이면 안쪽에 둔 `NoteSlot` 자리에 그린다(요약처럼 카드·버튼 뒤에 두고 싶을 때). */
export function NoteHost({ children, label = "읽는 법·유의사항", manual = false }: { children: ReactNode; label?: string; manual?: boolean }) {
  const [target, attach] = useState<HTMLDivElement | null>(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!target) return;
    const sync = () => setCount(target.childElementCount);
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(target, { childList: true });
    return () => obs.disconnect();
  }, [target]);

  return (
    <Ctx.Provider value={{ target, attach, count }}>
      {!manual && <NoteSlot label={label} />}
      {children}
    </Ctx.Provider>
  );
}

/** 접이식이 그려질 자리 — `NoteHost manual` 안에서 한 번만 쓴다. `children` 을 주면 그 내용(기준 안내·지표 카드 등)을 같은 접이식 맨 앞에 함께 담아 접이식이 하나로 보이게 한다. */
export function NoteSlot({ label = "읽는 법·유의사항", children }: { label?: string; children?: ReactNode }) {
  const ctx = useContext(Ctx);
  if (!ctx) return null;
  const { count, attach } = ctx;
  const hasExtra = children !== undefined && children !== null && children !== false;
  return (
    <details data-notes style={{ display: count > 0 || hasExtra ? "block" : "none", marginTop: 8, fontSize: 12, color: "#4B5563", background: "#F3F4F6", borderRadius: 8, padding: "6px 10px" }}>
      <summary style={{ cursor: "pointer", fontWeight: 600, minHeight: 28, display: "flex", alignItems: "center" }}>{label}{count > 0 ? ` (${count})` : ""}</summary>
      {hasExtra && <div style={{ marginTop: 6 }}>{children}</div>}
      <div ref={attach} style={{ display: "grid", gap: 6, marginTop: 6, lineHeight: 1.55 }} />
    </details>
  );
}

/** 해석상 유의사항 한 줄 — 가장 가까운 `NoteHost` 의 접이식으로 모인다(없으면 제자리에 작은 글씨로 그린다). 숫자 바로 옆에 있어야 하는 핵심 경고는 여기 말고 눈에 보이는 문구로 둔다. */
export function Caveat({ children }: { children: ReactNode }) {
  const ctx = useContext(Ctx);
  const line = <div style={{ fontSize: 11.5, lineHeight: 1.55, color: "#4B5563" }}>{children}</div>;
  if (ctx === undefined) return line;
  return ctx.target ? createPortal(line, ctx.target) : null;
}
