import type { CSSProperties } from "react";
import { C } from "./reportColors";

// 리포트(매장·상권)가 함께 쓰는 스타일 — 인쇄할 때도 같게 보이도록 앱 테마와 무관한 고정 색을 쓴다.
export const reportCss = `
.irp-overlay{position:fixed;inset:0;z-index:1000;background:#E9ECEA;overflow:auto;color:${C.ink};font-size:14px;line-height:1.65;word-break:keep-all}
.irp-bar{position:sticky;top:0;z-index:2;display:flex;gap:8px;align-items:center;justify-content:space-between;padding:10px 16px;background:${C.ink};color:#fff}
.irp-bar button{border:0;border-radius:6px;padding:7px 14px;font-weight:700;cursor:pointer;font-size:13px}
.irp-sheet{max-width:860px;margin:0 auto;padding:24px 16px 48px;display:flex;flex-direction:column;gap:24px}
.irp-page{background:${C.paper};border:1px solid ${C.line};padding:clamp(20px,4vw,44px);display:flex;flex-direction:column;gap:22px;min-width:0}
.irp-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:22px;align-items:start}
.irp-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}
@media print{
  #root{display:none!important}
  .irp-overlay{position:static!important;overflow:visible!important;background:#fff!important}
  .irp-bar{display:none!important}
  .irp-sheet{padding:0;gap:0;max-width:none}
  .irp-page{border:0;break-after:page;min-height:96vh}
}`;

export const h2: CSSProperties = { fontSize: "clamp(20px,3.4vw,26px)", lineHeight: 1.35, fontWeight: 900, margin: 0, letterSpacing: "-.015em", textWrap: "balance" };
export const eyebrow: CSSProperties = { fontFamily: "ui-monospace,Menlo,Consolas,monospace", fontSize: 11, letterSpacing: ".08em", color: C.accent, fontWeight: 600 };
export const boxS: CSSProperties = { background: C.soft, padding: "14px 16px", fontSize: 13, color: C.mute };
export const takeS: CSSProperties = { background: "#FDEBDD", padding: "14px 16px", fontSize: 13.5 };
export const footS: CSSProperties = { fontSize: 11.5, color: C.mute, lineHeight: 1.55, borderTop: `1px solid ${C.line}`, paddingTop: 10 };
export const capS: CSSProperties = { fontSize: 12, color: C.mute, lineHeight: 1.5 };

