import { RF } from "./reportTypography";
import type { CSSProperties } from "react";
import { C } from "./reportColors";

// 리포트(매장·상권)가 함께 쓰는 스타일 — 인쇄할 때도 같게 보이도록 앱 테마와 무관한 고정 색을 쓴다.
export const reportCss = `
.irp-overlay{position:fixed;inset:0;z-index:1000;background:#E9ECEA;overflow:auto;color:${C.ink};font-size:14px;line-height:1.65;word-break:keep-all}
.irp-bar{position:sticky;top:0;z-index:2;display:flex;gap:8px;align-items:center;justify-content:space-between;padding:10px 16px;background:${C.ink};color:#fff}
.irp-bar button{border:0;border-radius:6px;padding:7px 14px;font-weight:700;cursor:pointer;font-size:13px}
.irp-page h3,.irp-page h4{font-size:16px;line-height:1.45}.irp-sheet{max-width:860px;margin:0 auto;padding:24px 16px 48px;display:flex;flex-direction:column;gap:24px}
.irp-page{background:${C.paper};border:1px solid ${C.line};padding:clamp(20px,4vw,44px);display:flex;flex-direction:column;gap:22px;min-width:0}
.irp-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:22px;align-items:start}
.irp-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
.irp-appendix{padding:24px 28px;gap:12px;font-size:12px;line-height:1.5}
.irp-appendix table{font-size:11.5px!important;line-height:1.45;table-layout:fixed}
.irp-appendix th:first-child,.irp-appendix td:first-child{width:24%}
.irp-appendix th:nth-child(2),.irp-appendix td:nth-child(2){width:18%}
.irp-appendix td,.irp-appendix th{padding:4px 6px!important;overflow-wrap:anywhere}
.irp-tip-page{gap:14px}
.irp-summary-page{gap:22px}.irp-result-section,.irp-strategy-section{display:grid;gap:10px}.irp-strategy-section{border-top:1px solid ${C.line};padding-top:18px}.irp-summary-finding{padding:10px 12px!important;font-size:14px!important}.irp-summary-page .irp-tip{padding:9px 12px;line-height:1.45}.irp-summary-page .irp-tip h4{font-size:16px!important}.irp-summary-page .irp-tip p{font-size:14px!important}
.irp-strategy-section>section{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));align-items:start;gap:10px!important}.irp-summary-page .irp-summary-finding h3{margin:0!important}@media screen and (max-width:600px){.irp-strategy-section>section{grid-template-columns:1fr}}
.irp-tip{padding:12px 14px;border-left:3px solid ${C.teal};background:${C.soft};break-inside:avoid;line-height:1.55}
.irp-methods{font-size:11.5px;line-height:1.5}
.irp-methods p{margin:0 0 5px}
.irp-appendix>div:last-child{font-size:10.5px!important;padding-top:8px!important;line-height:1.5!important}
@media(max-width:600px){.irp-appendix{padding:16px}.irp-appendix table{table-layout:auto}}
.irp-share-list{display:grid;grid-template-columns:max-content minmax(0,1fr) 65px;gap:12px 8px;align-items:center}.irp-share-row{display:grid;grid-template-columns:subgrid;grid-column:1 / -1;align-items:center}.irp-location-facilities{grid-column:1 / -1}.irp-location-facilities .irp-facility-list{grid-template-columns:repeat(2,minmax(0,1fr));column-gap:24px}.irp-location-visuals{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.irp-location-visuals>section{background:${C.soft};padding:14px;min-width:0}.irp-station-list{display:grid;gap:10px}.irp-station-item small{display:block;font-size:12px;color:${C.mute};margin-top:4px}.irp-station-name{min-width:0;display:flex;align-items:center;gap:6px;white-space:nowrap;font-size:16px}.irp-station-name .rail-line-badge{width:26px;height:26px;font-size:12px}.irp-facility-list{display:grid;gap:8px;font-size:13px}.irp-facility-list>div{display:flex;justify-content:space-between;gap:12px}.irp-facility-list b{white-space:nowrap}
@page{size:A4;margin:0}
@media print{
  html,body{margin:0!important;padding:0!important;height:auto!important;overflow:visible!important}
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  #root{display:none!important}
  .irp-overlay{position:static!important;overflow:visible!important;background:#fff!important}
  .irp-bar,.irp-screen-only{display:none!important}
  .irp-sheet{padding:0;gap:0;max-width:none}
  .irp-page{border:0;box-sizing:border-box;padding:12mm;gap:14px;break-after:page;min-height:0;font-size:12px;line-height:1.5}
  .irp-page:last-child{break-after:auto}
  .irp-appendix{padding:10mm;gap:10px}
  .irp-appendix h2{font-size:18px!important}
  .irp-cols{grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
  .irp-tiles{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
  .irp-tiles:has(>:nth-child(4):last-child){grid-template-columns:repeat(2,minmax(0,1fr))}
  .irp-tile,figure,figcaption,.irp-page>div,.irp-page>p{break-inside:avoid}
  .irp-tile{padding:10px!important}
  .irp-page h1{font-size:28px!important}
  .irp-page h2{font-size:22px!important}
  .irp-page svg{max-width:100%;height:auto}
  .irp-page svg text{font-size:13px}

}`;

export const h2: CSSProperties = { fontSize: RF.title, lineHeight: 1.35, fontWeight: 900, margin: 0, letterSpacing: "-.015em", textWrap: "balance" };
export const eyebrow: CSSProperties = { fontFamily: "ui-monospace,Menlo,Consolas,monospace", fontSize: RF.caption, letterSpacing: ".08em", color: C.accent, fontWeight: 600 };
export const boxS: CSSProperties = { background: C.soft, padding: "14px 16px", fontSize: RF.body, color: C.mute };
export const takeS: CSSProperties = { background: "#FDEBDD", padding: "14px 16px", fontSize: RF.body };
export const footS: CSSProperties = { fontSize: RF.caption, color: C.mute, lineHeight: 1.55, borderTop: `1px solid ${C.line}`, paddingTop: 10 };
export const capS: CSSProperties = { fontSize: RF.caption, color: C.mute, lineHeight: 1.5 };

