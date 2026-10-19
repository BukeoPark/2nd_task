import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** undefined = NoteHost 밖, null = NoteHost 안이지만 접이식이 아직 그려지기 전 */
const HostContext = createContext<HTMLElement | null | undefined>(undefined);

/** 한 화면(탭)의 해석상 유의사항을 한 곳에 모아 '읽는 법·유의사항' 접이식으로 보인다. 처음에는 접혀 있어 숫자와 그래프가 먼저 보인다.
 * 안에 둔 `Caveat` 는 제자리에 그리지 않고 이 접이식으로 모인다. 값이 0 이거나 자료가 없는 이유, 실패 같은 상태 안내(Notice)는 모으지 않고 제자리에 둔다. */
export function NoteHost({ children, label = "읽는 법·유의사항" }: { children: ReactNode; label?: string }) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!host) return;
    const sync = () => setCount(host.childElementCount);
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(host, { childList: true });
    return () => obs.disconnect();
  }, [host]);

  return (
    <HostContext.Provider value={host}>
      <details data-notes style={{ display: count > 0 ? "block" : "none", marginTop: 8, fontSize: 12, color: "#4B5563", background: "#F3F4F6", borderRadius: 8, padding: "6px 10px" }}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>{label} ({count})</summary>
        <div ref={setHost} style={{ display: "grid", gap: 6, marginTop: 6, lineHeight: 1.55 }} />
      </details>
      {children}
    </HostContext.Provider>
  );
}

/** 해석상 유의사항 한 줄 — 가장 가까운 `NoteHost` 의 접이식으로 모인다(없으면 제자리에 작은 글씨로 그린다). 숫자 바로 옆에 있어야 하는 핵심 경고는 여기 말고 눈에 보이는 문구로 둔다. */
export function Caveat({ children }: { children: ReactNode }) {
  const host = useContext(HostContext);
  const line = <div style={{ fontSize: 11.5, lineHeight: 1.55, color: "#4B5563" }}>{children}</div>;
  if (host === undefined) return line;
  return host ? createPortal(line, host) : null;
}
