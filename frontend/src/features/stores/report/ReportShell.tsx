import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { C } from "./reportColors";
import { capS, eyebrow, h2, reportCss, takeS } from "./reportStyles";

export function Page({ n, total, children }: { n: number; total: number; children: ReactNode }) {
  return (
    <section className="irp-page">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", fontSize: 11, letterSpacing: ".04em", color: C.mute, borderBottom: `1px solid ${C.line}`, paddingBottom: 10 }}>
        <span>상권 인사이트 리포트 · 공개 통계 기반</span><span>{n} / {total}</span>
      </div>
      {children}
    </section>
  );
}
export const Head = ({ eyebrowText, title, text }: { eyebrowText: string; title: string; text?: string }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
    <div style={eyebrow}>{eyebrowText}</div>
    <h2 style={h2}>{title}</h2>
    {text && <p style={{ margin: 0 }}>{text}</p>}
  </div>
);
export const Fig = ({ title, note, children, legend }: { title: string; note: string; children: ReactNode; legend?: [string, string][] }) => (
  <figure style={{ margin: 0, display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
    {children}
    {legend && (
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", fontSize: 12, color: C.mute }}>
        {legend.map(([c, l]) => (<span key={l}><i style={{ display: "inline-block", width: 10, height: 10, background: c, marginRight: 5 }} />{l}</span>))}
      </div>
    )}
    <figcaption style={capS}><b style={{ display: "block", color: C.ink, fontSize: 13 }}>{title}</b>{note}</figcaption>
  </figure>
);
export const TileBox = ({ label, value, note, tone = "plain" }: { label: string; value: string; note: string; tone?: "plain" | "accent" | "neg" }) => (
  <div style={{ background: C.soft, padding: "14px 14px 12px", display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
    <span style={{ fontSize: 12, color: C.mute, lineHeight: 1.45 }}>{label}</span>
    <b style={{ fontSize: 28, lineHeight: 1.15, fontWeight: 900, color: tone === "neg" ? C.bad : tone === "accent" ? C.accent : C.ink }}>{value}</b>
    {note && <span style={{ fontSize: 12, color: C.mute, lineHeight: 1.45 }}>{note}</span>}
  </div>
);
export const Take = ({ text, label = "사장님께 의미" }: { text: string; label?: string }) => (
  <div style={takeS}><div style={{ ...eyebrow, marginBottom: 2 }}>{label}</div><p style={{ margin: 0 }}>{text}</p></div>
);

/** 전체 화면 리포트 틀 — 위쪽 도구줄(인쇄·닫기), Esc 로 닫기, 인쇄할 때는 리포트만 나오게 한다. */
export function ReportFrame({ title, canPrint, onClose, children }: { title: string; canPrint: boolean; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", key); };
  }, [onClose]);
  return createPortal(
    <div className="irp-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <style>{reportCss}</style>
      <div className="irp-bar">
        <strong style={{ fontSize: 14 }}>{title}</strong>
        <span style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={() => window.print()} disabled={!canPrint} style={{ background: "#fff", color: C.ink }}>인쇄 / PDF로 저장</button>
          <button type="button" onClick={onClose} style={{ background: "#3A4656", color: "#fff" }}>닫기</button>
        </span>
      </div>
      <div className="irp-sheet">{children}</div>
    </div>,
    document.body,
  );
}
