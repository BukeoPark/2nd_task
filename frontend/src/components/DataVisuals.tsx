import type { ReactNode } from "react";
import { populationShares, breakevenScale } from "../lib/dataVisuals";
import "./dataVisuals.css";

export type AppIconName = "home" | "work" | "train" | "bus" | "store" | "trend" | "calculator" | "clock" | "pin" | "hospital" | "building" | "users" | "wallet" | "bulb";
const paths: Record<AppIconName, ReactNode> = {
  home: <><path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-7h6v7" /></>,
  work: <><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V3h8v4M3 12c6 4 12 4 18 0M10 14h4"/></>,
  train: <><rect x="5" y="3" width="14" height="16" rx="3"/><path d="M5 10h14M9 19l-3 3M15 19l3 3M9 15h.01M15 15h.01"/></>,
  bus: <><rect x="4" y="3" width="16" height="17" rx="3"/><path d="M4 11h16M8 15h.01M16 15h.01M7 20v2M17 20v2M8 6h8"/></>,
  store: <><path d="M3 9h18l-2-6H5l-2 6ZM4 9v12h16V9M9 21v-7h6v7M3 9c0 4 5 4 5 0 0 4 8 4 8 0 0 4 5 4 5 0"/></>,
  trend: <><path d="M3 18 9 12l4 3 8-11M15 4h6v6"/></>,
  calculator: <><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M8 6h8M8 11h2M14 11h2M8 15h2M14 15h2M8 19h2M14 19h2"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/></>,
  pin: <><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/></>,
  hospital: <><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M12 6v6M9 9h6M9 21v-5h6v5"/></>,
  building: <><path d="M4 21V3h11v18M15 9h5v12M8 7h3M8 11h3M8 15h3M8 19h3M2 21h20"/></>,
  users: <><circle cx="9" cy="7" r="4"/><path d="M2 21v-3a7 7 0 0 1 14 0v3M16 3a4 4 0 0 1 0 8M18 14a6 6 0 0 1 4 7"/></>,
  wallet: <><path d="M3 7V5a2 2 0 0 1 2-2h13v4M3 7h18v14H3V7Z"/><path d="M21 12h-6v5h6M17 14.5h.01"/></>,
  bulb: <><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5M9 18h6M10 22h4"/></>,
};
export function AppIcon({ name }: { name: AppIconName }) {
  return <svg className="data-line-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export function PopulationMix({ residents, workers, period }: { residents: number | null | undefined; workers: number | null | undefined; period?: string }) {
  const shares = populationShares(residents, workers);
  return <div className="population-mix">
    <div className="population-labels"><div><span><AppIcon name="home"/>상주인구</span><b>{residents == null ? "자료 없음" : `${residents.toLocaleString()}명`}</b>{shares && <small>{shares.residentPct.toFixed(1)}%</small>}</div><div><span><AppIcon name="work"/>직장인구</span><b>{workers == null ? "자료 없음" : `${workers.toLocaleString()}명`}</b>{shares && <small>{shares.workerPct.toFixed(1)}%</small>}</div></div>
    {shares && <div className="population-track" role="img" aria-label={`상주·직장인구 합계 중 상주 ${shares.residentPct.toFixed(1)}%, 직장 ${shares.workerPct.toFixed(1)}%`}><span style={{ width: `${shares.residentPct}%` }}/><span style={{ width: `${shares.workerPct}%` }}/></div>}
    {period && <div className="data-period">{period}</div>}
  </div>;
}

const man = (v: number) => `${Math.round(v).toLocaleString()}만원`;
export function BreakevenMeter({ bep, revenue, revenueLabel = "입력 매출" }: { bep: number; revenue: number | null; revenueLabel?: string }) {
  const scale = breakevenScale(bep, revenue);
  if (!scale) return null;
  const result = scale.gap == null ? "매출을 입력하면 손익분기와 비교합니다" : scale.gap === 0 ? "입력 매출이 손익분기와 같습니다" : scale.gap > 0 ? `손익분기보다 ${man(scale.gap)} 높음` : `손익분기까지 ${man(-scale.gap)} 부족`;
  return <figure className="breakeven-meter" aria-label={`${revenueLabel} ${revenue == null ? "없음" : man(revenue)}, 손익분기 ${man(bep)}. ${result}`}>
    <figcaption><AppIcon name="calculator"/><strong>{result}</strong></figcaption>
    <div className="break-values"><span><i/>{revenueLabel} <b>{revenue == null ? "미입력" : man(revenue)}</b></span><span><i/>손익분기 <b>{man(bep)}</b></span></div>
    <div className="break-track">{scale.revenuePct != null && <div className="break-fill" style={{ width: `${scale.revenuePct}%` }}/>}<div className="break-target" style={{ left: `${scale.targetPct}%` }}><span/></div></div>
    <div className="data-period">월 매출 기준 · 입력한 비용으로 계산</div>
  </figure>;
}

export function MetricBars({ items, format, rate = false }: { items: { label: string; value: number | null; color: string }[]; format: (n: number) => string; rate?: boolean }) {
  const maximum = rate ? Math.max(100, ...items.map(i => i.value ?? 0)) : Math.max(1, ...items.map(i => i.value ?? 0));
  return <div className="data-metric-bars">{items.map(item => <div key={item.label}><div><span><i style={{ background: item.color }}/>{item.label}</span><b>{item.value == null ? "자료 없음" : format(item.value)}</b></div>{item.value != null && <div className="data-metric-track" role="img" aria-label={`${item.label} ${format(item.value)}`}><span style={{ width: `${Math.max(0, item.value / maximum * 100)}%`, background: item.color }}/></div>}</div>)}</div>;
}
