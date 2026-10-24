import { shortReportLabel, shortReportNote } from "./reportCopy";
import { RF } from "./reportTypography";
import { ReportFitLine } from "./ReportFitLine";
import { AppIcon } from "../../../components/DataVisuals";
import { useContext, useEffect, type ReactNode } from "react";
import { ReportDateContext } from "./reportDate";
import { createPortal } from "react-dom";
import { AppLink } from "../../../components/AppLink";
import { HOME_PATH } from "../../../lib/route";
import { useOverlayBack } from "../../nav/useOverlayBack";
import { C } from "./reportColors";
import { capS, eyebrow, h2, reportCss, takeS } from "./reportStyles";

export function Page({ n, total, children, className = "" }: { n: number; total: number; children: ReactNode; className?: string }) {
  const date = useContext(ReportDateContext);
  return (
    <section className={`irp-page ${className}`}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", fontSize: RF.caption, letterSpacing: ".04em", color: C.mute, borderBottom: `1px solid ${C.line}`, paddingBottom: 10 }}>
        <span>상권분석 보고서 · 공개 통계 기반</span><span>{date ? `리포트 작성 ${date} · ` : ""}{n} / {total}</span>
      </div>
      {children}
    </section>
  );
}
export const Head = ({ eyebrowText, title, text }: { eyebrowText: string; title: string; text?: string }) => (
  <div className="irp-section-head" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
    <div className="irp-section-category" style={{fontSize:RF.section,fontWeight:800,lineHeight:1.4,color:C.accent,borderLeft:`3px solid ${C.accent}`,paddingLeft:9}}>{eyebrowText}</div>
    <h2 style={h2}>{title}</h2>
    {text && <p style={{ margin: 0 }}>{text}</p>}
  </div>
);
export const Fig = ({ title, note, children, legend }: { title: string; note: string; children: ReactNode; legend?: [string, string][] }) => (
  <figure style={{ margin: 0, display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
    {children}
    {legend && (
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", fontSize: RF.caption, color: C.mute }}>
        {legend.map(([c, l]) => (<span key={l}><i style={{ display: "inline-block", width: 10, height: 10, background: c, marginRight: 5 }} />{l}</span>))}
      </div>
    )}
    <figcaption style={capS}><b style={{ display: "block", color: C.ink, fontSize: RF.section }}>{title}</b>{note}</figcaption>
  </figure>
);
export const TileBox = ({ label, value, note, tone = "plain" }: { label: string; value: string; note: string; tone?: "plain" | "accent" | "neg" }) => (
  <div className="irp-tile" style={{ background: C.soft, padding: "14px 14px 12px", display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
    <span title={label} style={{fontSize:RF.label,color:C.mute,lineHeight:1.45,whiteSpace:"nowrap",}}>{shortReportLabel(label)}</span>
    <b style={{ fontSize: RF.metric, lineHeight: 1.15, fontWeight: 900, color: tone === "neg" ? C.bad : tone === "accent" ? C.accent : C.ink }}><ReportFitLine>{value}</ReportFitLine></b>
    {note && <span style={{ fontSize: RF.caption, color: C.mute, lineHeight: 1.45,whiteSpace:"nowrap", }} title={note}>{shortReportNote(note)}</span>}
  </div>
);
export const Take = ({ text, label = "사장님께 의미" }: { text: string; label?: string }) => (
  <div style={takeS}><div style={{ ...eyebrow, marginBottom: 2, display: "flex", alignItems: "center", gap: 6 }}>{label === "꿀팁" && <AppIcon name="bulb" />}{label}</div><p style={{ margin: 0 }}>{text}</p></div>
);

/** 전체 화면 리포트 틀 — 위쪽 도구줄(인쇄·닫기), Esc 로 닫기, 인쇄할 때는 리포트만 나오게 한다. */
export function ReportFrame({ title, downloadTitle, canPrint, onClose, children }: { title: string; downloadTitle?: string; canPrint: boolean; onClose: () => void; children: ReactNode }) {
  const requestClose = useOverlayBack(onClose);   // 브라우저 뒤로·'← 뒤로'·Esc 가 같은 길로 닫는다
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  useEffect(() => {
    if (!downloadTitle) return;
    const previousTitle = document.title;
    document.title = downloadTitle;
    return () => { document.title = previousTitle; };
  }, [downloadTitle]);
  return createPortal(
    <div className="irp-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <style>{reportCss}</style>
      <div className="irp-bar">
        <span style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0, flexWrap: "wrap" }}>
          <button type="button" onClick={requestClose} style={{ background: "#fff", color: C.ink }}>← 뒤로</button>
          <AppLink to={HOME_PATH} aria-label="홈(랜딩페이지)으로" style={{ background: "#3A4656", color: "#fff", borderRadius: 6, padding: "7px 14px", fontWeight: 700, fontSize: 13, textDecoration: "none" }}>홈</AppLink>
          <strong style={{ fontSize: 14 }}>{title}</strong>
        </span>
        <button type="button" onClick={() => window.print()} disabled={!canPrint} style={{ background: "#fff", color: C.ink }}>인쇄 / PDF로 저장</button>
      </div>
      <div className="irp-sheet">{children}</div>
    </div>,
    document.body,
  );
}
