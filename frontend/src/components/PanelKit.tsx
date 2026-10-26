import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { BLOCK_GAP, PK } from "../lib/panelStyle";
import { FS } from "../lib/typography";

// 분석 패널(종합분석 항목·매장 상세 묶음) 안의 내용을 이루는 공통 조각 — 항목마다 제각기이던 카드·소제목·숫자 칸·값 행·설명 줄을 한 벌로 맞춘다.
// 글자 크기는 FS 단계, 색은 아래 PK 한 벌만 쓴다. 새 항목을 만들 때는 이 조각으로 조립하고 따로 스타일을 만들지 않는다.
//   Block(카드: 번호·제목·설명) > SubHead(소제목) · Stat(숫자 칸) · StatRow(값 행) · ListRow(눌러서 이동하는 행) · Caption(설명 한 줄)

/** 설명·출처·기준 한 줄 — 보조 크기, 한 가지 회색. tone="warn" 이면 주의 색. */
export function Caption({ children, tone, style }: { children: ReactNode; tone?: "warn"; style?: CSSProperties }) {
  return <div style={{ fontSize: FS.caption, lineHeight: 1.5, color: tone === "warn" ? PK.warn : PK.mute, marginTop: 4, ...style }}>{children}</div>;
}

/** 블록 안의 소제목 — 표·차트·숫자 묶음 위에 붙인다. aside 는 같은 줄 오른쪽(안내 말풍선 등). */
export function SubHead({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize: FS.ui, fontWeight: 700, color: PK.ink, lineHeight: 1.4, margin: "14px 0 6px" }}>
      <span>{children}</span>
      {aside}
    </div>
  );
}

/** 카드 — 항목 안의 주제 하나. no 는 '①' 같은 번호(제목이 '① 제목' 꼴이면 자동으로 나눈다), hint 는 제목 아래 한 줄 설명, accent 는 왼쪽 띠 색.
 * surface="card" 는 회색 작업 화면(모달) 위의 흰 카드, 기본은 흰 패널 위의 회색 카드. */
export function Block({ no, title, hint, accent, surface = "soft", children }: { no?: string; title: ReactNode; hint?: ReactNode; accent?: string; surface?: "soft" | "card"; children?: ReactNode }) {
  const m = no === undefined && typeof title === "string" ? /^([①②③④⑤⑥⑦⑧⑨⑩])\s*(.*)$/.exec(title) : null;
  const number = m ? m[1] : no;
  const text = m ? m[2] : title;
  const card = surface === "card";
  return (
    <section style={{ background: card ? "#fff" : PK.soft, boxShadow: card ? "0 1px 4px rgba(0,0,0,0.08)" : undefined, border: accent ? `1px solid ${PK.line}` : undefined, borderLeft: accent ? `3px solid ${accent}` : undefined, borderRadius: 12, padding: "14px 16px", marginTop: card ? 0 : BLOCK_GAP }}>
      <div style={{ fontSize: FS.cardTitle, fontWeight: 800, lineHeight: 1.4, color: accent ?? PK.ink }}>{number ? `${number} ` : ""}{text}</div>
      {hint && <Caption>{hint}</Caption>}
      {children !== undefined && <div style={{ marginTop: 10 }}>{children}</div>}
    </section>
  );
}

/** 숫자 칸 — 이름(경고 크기)·값(카드 제목 크기, big 이면 핵심 숫자 크기)·부연(보조). onGray 는 회색 블록 안에서 흰 바탕으로. */
export function Stat({ label, value, sub, subTone, big, missing, onGray, valueColor }: { label: ReactNode; value: ReactNode; sub?: ReactNode; subTone?: "warn"; big?: boolean; missing?: boolean; onGray?: boolean; valueColor?: string }) {
  return (
    <div style={{ background: onGray ? "#fff" : PK.soft, border: onGray ? `1px solid ${PK.line}` : "1px solid transparent", borderRadius: 10, padding: "10px 12px", minWidth: 0 }}>
      <div style={{ fontSize: FS.warn, lineHeight: 1.4, color: PK.sub }}>{label}</div>
      <div style={{ fontSize: big ? FS.metric : FS.cardTitle, fontWeight: 800, lineHeight: 1.3, marginTop: 4, color: missing ? PK.missing : valueColor ?? PK.ink, wordBreak: "keep-all" }}>{value}</div>
      {sub && <Caption tone={subTone} style={{ marginTop: 4 }}>{sub}</Caption>}
    </div>
  );
}

/** 값 행 — 왼쪽 이름(본문), 오른쪽 값(카드 제목 크기·굵게). note 는 이름 아래 보조 줄. */
export function StatRow({ label, value, note, noteTone, missing }: { label: ReactNode; value: ReactNode; note?: ReactNode; noteTone?: "warn"; missing?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, padding: "10px 0", borderBottom: `1px solid ${PK.faint}` }}>
      <div style={{ minWidth: 0, fontSize: FS.body, color: PK.ink }}>
        {label}
        {note && <Caption tone={noteTone}>{note}</Caption>}
      </div>
      <div style={{ fontSize: FS.cardTitle, fontWeight: 700, whiteSpace: "nowrap", color: missing ? PK.missing : PK.ink }}>{value}</div>
    </div>
  );
}

/** 눌러서 다른 화면으로 가는 행 — 이름(본문·굵게)+종류(보조), 오른쪽 보조 문구와 ›. */
export function ListRow({ name, kind, meta, onClick }: { name: ReactNode; kind?: ReactNode; meta?: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center", gap: 10, minHeight: 44, padding: "10px 12px", marginBottom: 6, border: `1px solid ${PK.line}`, borderRadius: 10, background: "#fff", cursor: "pointer", textAlign: "left", fontSize: FS.body, color: PK.ink }}>
      <span style={{ minWidth: 0 }}><strong style={{ fontWeight: 700 }}>{name}</strong>{kind && <span style={{ fontSize: FS.caption, color: PK.mute }}> {kind}</span>}</span>
      <span style={{ fontSize: FS.caption, color: PK.mute, whiteSpace: "nowrap" }}>{meta}{meta ? " " : ""}›</span>
    </button>
  );
}

/** 접기·펼치기 아이콘 단추(가운데 ⌄/⌃) — 설명 글자 없이 아이콘만 쓴다. 상권 페이지의 '어떤 시설이 있나요?' 접힘과 매장 페이지의 시설 이름 접힘이 같은 모양이다. label 은 화면낭독기용 이름. */
export function ChevronToggle({ open, onClick, label }: { open: boolean; onClick: () => void; label: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", marginTop: 10 }}>
      <button type="button" onClick={onClick} aria-expanded={open} aria-label={`${label} ${open ? "접기" : "펼치기"}`} title={open ? "접기" : "펼치기"}
        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 40, height: 36, padding: 0, border: "none", borderRadius: 8, background: "transparent", color: PK.mute, cursor: "pointer" }}>
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={open ? "m6 15 6-6 6 6" : "m6 9 6 6 6-6"} /></svg>
      </button>
    </div>
  );
}

/** 누르는 단추 — primary(파랑 꽉 찬)·secondary(파랑 옅은)·ghost(테두리)·danger(빨강 테두리). 글자는 단추 크기(ui), 설명 한 줄(sub)은 보조 크기. */
export function ActionButton({ variant = "secondary", full, sub, children, ...rest }: { variant?: "primary" | "secondary" | "ghost" | "danger"; full?: boolean; sub?: ReactNode; children: ReactNode } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "style" | "children">) {
  const V: Record<string, CSSProperties> = {
    primary: { background: "#1D4ED8", color: "#fff", border: "1px solid #1D4ED8" },
    secondary: { background: "#EFF6FF", color: "#1E3A8A", border: "1px solid #BFDBFE" },
    ghost: { background: "#fff", color: PK.sub, border: "1px solid #D1D5DB" },
    danger: { background: "#fff", color: "#991B1B", border: "1px solid #FCA5A5" },
  };
  return (
    <button type="button" {...rest} style={{ ...V[variant], width: full ? "100%" : undefined, minHeight: 40, padding: "8px 14px", borderRadius: 10, fontSize: FS.ui, fontWeight: 700, textAlign: "left", cursor: "pointer" }}>
      {children}
      {sub && <span style={{ display: "block", fontSize: FS.caption, fontWeight: 500, opacity: 0.9, marginTop: 2 }}>{sub}</span>}
    </button>
  );
}
