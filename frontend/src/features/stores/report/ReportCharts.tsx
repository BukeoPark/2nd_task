import type { ReactNode } from "react";
import type { AreaSlots } from "../../../lib/areaReport";
import type { CompetitionSection, FactorsSection, LevelSection, SlotsSection } from "../../../lib/insightReport";

import { C } from "./reportColors";
const fmt = (n: number) => Math.round(n).toLocaleString("ko-KR");

type TProps = { x: number; y: number; children: ReactNode; anchor?: "start" | "middle" | "end"; bold?: boolean; color?: string; mid?: boolean };
function T({ x, y, children, anchor = "start", bold, color, mid }: TProps) {
  return (
    <text x={x} y={y} textAnchor={anchor} dominantBaseline={mid ? "middle" : "auto"} fill={color ?? C.mute} fontSize={11.5} fontWeight={bold ? 700 : 400} style={{ fontVariantNumeric: "tabular-nums" }}>
      {children}
    </text>
  );
}
const Svg = ({ w, h, label, children }: { w: number; h: number; label: string; children: ReactNode }) => (
  <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} style={{ width: "100%", height: "auto", display: "block", overflow: "visible" }}>{children}</svg>
);

/** 비교 상권 분포에서 이 상권의 위치 */
export function HistogramChart({ level }: { level: LevelSection }) {
  const step = 500, nb = 13;
  const bins = Array<number>(nb).fill(0);
  level.hist.forEach((v) => { bins[Math.min(nb - 1, Math.floor(v / step))]++; });
  const meBin = Math.min(nb - 1, Math.floor(level.me / step));
  const L = 28, R = 452, B = 205, Tp = 40, w = (R - L) / nb, max = Math.max(...bins, 1);
  const y = (c: number) => B - (c / max) * (B - Tp);
  const mx = L + (level.median / step) * w, ax = L + (level.me / step) * w;
  return (
    <Svg w={460} h={250} label={`${level.peerCount}개 비교 상권의 점포당 월평균 추정매출 분포. 이 상권은 ${fmt(level.me)}만원`}>
      {[0, 0.5, 1].map((f) => (<g key={f}><line x1={L} x2={R} y1={B - f * (B - Tp)} y2={B - f * (B - Tp)} stroke={C.line} /><T x={L - 6} y={B - f * (B - Tp)} anchor="end" mid>{fmt(max * f)}</T></g>))}
      {bins.map((c, i) => (
        <g key={i}>
          <rect x={L + i * w + 2} y={y(c)} width={w - 4} height={B - y(c)} fill={i === meBin ? C.accent : C.slate} opacity={i === meBin ? 1 : 0.55} />
          {c > 0 && <T x={L + i * w + w / 2} y={y(c) - 4} anchor="middle" bold={i === meBin} color={i === meBin ? C.accent : undefined}>{c}</T>}
        </g>
      ))}
      {Array.from({ length: Math.ceil(nb / 2) }, (_, k) => k * 2).map((i) => (<T key={i} x={L + i * w} y={B + 15} anchor="middle">{fmt(i * step)}</T>))}
      <T x={R} y={B + 32} anchor="end">점포당 월 추정매출(만원) · 맨 오른쪽 칸은 6,000 이상</T>
      <T x={L} y={14}>상권 수</T>
      <line x1={mx} x2={mx} y1={Tp - 8} y2={B} stroke={C.ink} strokeDasharray="3 3" />
      <T x={mx + 4} y={Tp - 12}>중앙값 {fmt(level.median)}</T>
      <line x1={ax} x2={ax} y1={20} y2={B} stroke={C.accent} strokeWidth={1.5} />
      <T x={Math.min(ax, R - 60)} y={14} anchor="middle" bold color={C.accent}>이 상권 {fmt(level.me)}만원</T>
    </Svg>
  );
}

/** 분기별 점포당 월평균 추정매출 추이 */
export function TrendChart({ level }: { level: LevelSection }) {
  const tr = level.trend;
  const vs = tr.map((t) => t.v);
  const lo = Math.floor((Math.min(...vs) * 0.92) / 500) * 500, hi = Math.ceil((Math.max(...vs) * 1.06) / 500) * 500;
  const L = 40, R = 446, B = 205, Tp = 28;
  const x = (i: number) => L + 14 + i * ((R - L - 28) / Math.max(1, tr.length - 1));
  const y = (v: number) => B - ((v - lo) / (hi - lo)) * (B - Tp);
  const peak = Math.max(...vs);
  const grid: number[] = [];
  for (let g = lo; g < hi; g += 500) grid.push(g);
  return (
    <Svg w={460} h={250} label="최근 분기별 점포당 월평균 추정매출 추이">
      {grid.map((g) => (<g key={g}><line x1={L} x2={R} y1={y(g)} y2={y(g)} stroke={C.line} /><T x={L - 6} y={y(g)} anchor="end" mid>{fmt(g)}</T></g>))}
      <polyline points={tr.map((t, i) => `${x(i)},${y(t.v)}`).join(" ")} fill="none" stroke={C.accent} strokeWidth={2.5} strokeLinejoin="round" />
      {tr.map((t, i) => {
        const end = i === tr.length - 1 || t.v === peak;
        return (
          <g key={t.q}>
            <circle cx={x(i)} cy={y(t.v)} r={end ? 5 : 3} fill={end ? C.accent : C.paper} stroke={C.accent} strokeWidth={2} />
            {end && <T x={x(i)} y={y(t.v) - 10} anchor="middle" bold color={C.accent}>{fmt(t.v)}</T>}
            <T x={x(i)} y={B + 16} anchor="middle">{t.q}</T>
          </g>
        );
      })}
      <T x={L} y={12}>만원 / 월 · 점포당 (세로축은 {fmt(lo)}만원부터)</T>
    </Svg>
  );
}

/** 시간대별 매출 비중 · 비교 상권 평균 · 유동인구 비중 */
export function SlotsChart({ s }: { s: SlotsSection }) {
  const L = 34, R = 692, B = 215, Tp = 22;
  const max = Math.max(20, Math.ceil(Math.max(...s.slots.flatMap((d) => [d.me, d.pilot, d.fl ?? 0])) / 20) * 20);
  const n = s.hasFloating ? 3 : 2;
  const gw = (R - L) / s.slots.length, bw = 22, gap = 4;
  const y = (v: number) => B - (v / max) * (B - Tp);
  const ticks: number[] = [];
  for (let g = 0; g <= max; g += 20) ticks.push(g);
  return (
    <Svg w={700} h={260} label="시간대별 매출 비중, 비교 상권 평균, 유동인구 비중 비교">
      {ticks.map((g) => (<g key={g}><line x1={L} x2={R} y1={y(g)} y2={y(g)} stroke={C.line} /><T x={L - 6} y={y(g)} anchor="end" mid>{g}</T></g>))}
      {s.slots.map((d, i) => {
        const cx = L + i * gw + gw / 2, x0 = cx - (n * bw + (n - 1) * gap) / 2;
        const bars: [number, string, boolean][] = [[d.me, C.accent, true], [d.pilot, C.slate, false]];
        if (s.hasFloating) bars.push([d.fl ?? 0, C.teal, false]);
        return (
          <g key={d.label}>
            {bars.map(([v, c, strong], j) => (
              <g key={j}>
                <rect x={x0 + j * (bw + gap)} y={y(v)} width={bw} height={B - y(v)} fill={c} />
                <T x={x0 + j * (bw + gap) + bw / 2} y={y(v) - 4} anchor="middle" bold={strong} color={strong ? C.accent : undefined}>{v.toFixed(v < 10 ? 1 : 0)}</T>
              </g>
            ))}
            <T x={cx} y={B + 17} anchor="middle" bold color={C.ink}>{d.label}</T>
          </g>
        );
      })}
    </Svg>
  );
}

/** 직장인구와 카드 매출의 연령 구성 */
export function AgeChart({ ages }: { ages: NonNullable<SlotsSection["ages"]> }) {
  const L = 64, R = 440, Tp = 8, rowH = 40, bh = 12;
  const max = Math.max(20, Math.ceil(Math.max(...ages.flatMap((a) => [a.work ?? 0, a.sales])) / 10) * 10);
  const x = (v: number) => L + (v / max) * (R - L);
  const ticks: number[] = [];
  for (let g = 0; g <= max; g += 10) ticks.push(g);
  return (
    <Svg w={460} h={Tp + rowH * ages.length + 22} label="연령대별 직장인구 비중과 매출 비중 비교">
      {ticks.map((g) => (<g key={g}><line x1={x(g)} x2={x(g)} y1={Tp} y2={Tp + rowH * ages.length} stroke={C.line} /><T x={x(g)} y={Tp + rowH * ages.length + 14} anchor="middle">{g}</T></g>))}
      {ages.map((d, i) => {
        const y0 = Tp + i * rowH + 6;
        return (
          <g key={d.label}>
            <T x={L - 8} y={y0 + bh} anchor="end" bold color={C.ink} mid>{d.label}</T>
            {d.work !== null && (<g><rect x={L} y={y0} width={x(d.work) - L} height={bh} fill={C.teal} /><T x={x(d.work) + 4} y={y0 + bh / 2} mid>{d.work.toFixed(1)}</T></g>)}
            <rect x={L} y={y0 + bh + 2} width={x(d.sales) - L} height={bh} fill={C.accent} />
            <T x={x(d.sales) + 4} y={y0 + bh + 2 + bh / 2} mid bold color={C.accent}>{d.sales.toFixed(1)}</T>
          </g>
        );
      })}
    </Svg>
  );
}

/** 반경 안 같은 업종 인허가의 연도별 개업·폐업 */
export function ChurnChart({ yearly }: { yearly: NonNullable<CompetitionSection["yearly"]> }) {
  const L = 30, R = 452, B = 205, Tp = 24, bw = Math.min(15, 160 / yearly.length);
  const max = Math.max(10, Math.ceil(Math.max(...yearly.flatMap((d) => [d.o, d.c])) / 10) * 10);
  const gw = (R - L) / yearly.length;
  const y = (v: number) => B - (v / max) * (B - Tp);
  const ticks: number[] = [];
  for (let g = 0; g <= max; g += 10) ticks.push(g);
  return (
    <Svg w={460} h={250} label="반경 안 같은 업종 인허가의 연도별 개업과 폐업">
      {ticks.map((g) => (<g key={g}><line x1={L} x2={R} y1={y(g)} y2={y(g)} stroke={C.line} /><T x={L - 6} y={y(g)} anchor="end" mid>{g}</T></g>))}
      {yearly.map((d, i) => {
        const cx = L + i * gw + gw / 2;
        return (
          <g key={d.y}>
            <rect x={cx - bw - 1} y={y(d.o)} width={bw} height={B - y(d.o)} fill={C.teal} />
            <rect x={cx + 1} y={y(d.c)} width={bw} height={B - y(d.c)} fill={C.accent} opacity={d.partial ? 0.55 : 1} />
            <T x={cx - bw / 2 - 1} y={y(d.o) - 3} anchor="middle">{d.o}</T>
            <T x={cx + bw / 2 + 1} y={y(d.c) - 3} anchor="middle" bold color={C.accent}>{d.c}</T>
            <T x={cx} y={B + 15} anchor="middle">{String(d.y).slice(2)}{d.partial ? "*" : ""}</T>
          </g>
        );
      })}
      {yearly.some((d) => d.partial) && <T x={R} y={B + 32} anchor="end">* 이 해는 자료 수집일까지의 값</T>}
    </Svg>
  );
}

/** 이 상권의 연 개업률·폐업률과 비교 상권 중앙값·상위 25% 경계 */
export function RateBullets({ churn, labels = { close: "연 폐업률", open: "연 개업률" } }: { churn: Pick<NonNullable<CompetitionSection["churn"]>, "openRate" | "closeRate" | "medOpen" | "p75Open" | "medClose" | "p75Close">; labels?: { close: string; open: string } }) {
  const rows = [
    churn.closeRate !== null && churn.medClose !== null && churn.p75Close !== null ? { label: labels.close, me: churn.closeRate * 100, med: churn.medClose * 100, p75: churn.p75Close * 100, color: C.accent } : null,
    churn.openRate !== null && churn.medOpen !== null && churn.p75Open !== null ? { label: labels.open, me: churn.openRate * 100, med: churn.medOpen * 100, p75: churn.p75Open * 100, color: C.teal } : null,
  ].filter((r): r is { label: string; me: number; med: number; p75: number; color: string } => r !== null);
  if (rows.length === 0) return null;
  const L = 20, R = 440;
  const max = Math.max(25, Math.ceil(Math.max(...rows.flatMap((r) => [r.me, r.p75])) / 5) * 5 + 5);
  const x = (v: number) => L + (v / max) * (R - L);
  const ticks: number[] = [];
  for (let g = 0; g <= max; g += 5) ticks.push(g);
  return (
    <Svg w={460} h={50 + rows.length * 100 + 10} label="이 상권의 연 개업률·폐업률을 비교 상권 중앙값·상위 25% 경계와 비교">
      {rows.map((r, i) => {
        const y0 = 50 + i * 100;
        return (
          <g key={r.label}>
            <T x={L} y={y0 - 24} bold color={C.ink}>{r.label}</T>
            <rect x={L} y={y0} width={R - L} height={22} fill={C.soft} />
            <rect x={L} y={y0} width={x(r.p75) - L} height={22} fill={C.line} />
            <rect x={L} y={y0 + 7} width={x(r.me) - L} height={8} fill={r.color} />
            <line x1={x(r.med)} x2={x(r.med)} y1={y0 - 4} y2={y0 + 26} stroke={C.ink} strokeWidth={2} />
            <T x={Math.max(x(r.me), x(r.p75)) + 6} y={y0 + 11} mid bold color={C.accent}>{r.me.toFixed(1)}%</T>
            <T x={x(r.med)} y={y0 + 42} anchor="middle">중앙값 {r.med.toFixed(1)}%</T>
            <T x={x(r.p75)} y={y0 - 8} anchor="middle">상위 25% 경계 {r.p75.toFixed(1)}%</T>
          </g>
        );
      })}
      {ticks.map((g) => (<T key={g} x={x(g)} y={50 + rows.length * 100 + 4} anchor="middle">{g}%</T>))}
    </Svg>
  );
}

/** 입지 요인별 점포당 매출과의 관계(95% 구간) */
export function ForestChart({ f }: { f: FactorsSection }) {
  const rows = [...f.factors].sort((a, b) => Number(b.sig) - Number(a.sig) || b.pct - a.pct);
  const L = 170, R = 600, Tp = 18, rowH = 38;
  const lo = Math.floor(Math.min(-20, ...rows.map((r) => r.lo)) / 20) * 20, hi = Math.ceil(Math.max(60, ...rows.map((r) => r.hi)) / 20) * 20;
  const x = (v: number) => L + ((v - lo) / (hi - lo)) * (R - L);
  const H = Tp + rowH * rows.length;
  const ticks: number[] = [];
  for (let g = lo; g <= hi; g += 20) ticks.push(g);
  return (
    <Svg w={700} h={H + 24} label="입지 요인별 점포당 매출과의 관계. 선이 0을 지나면 뚜렷한 관계가 없음">
      {ticks.map((g) => (<g key={g}><line x1={x(g)} x2={x(g)} y1={Tp - 6} y2={H} stroke={g === 0 ? C.mute : C.line} /><T x={x(g)} y={H + 15} anchor="middle">{g > 0 ? "+" : ""}{g}%</T></g>))}
      {rows.map((d, i) => {
        const cy = Tp + i * rowH + rowH / 2, col = d.sig ? C.accent : C.slate;
        return (
          <g key={d.label}>
            <T x={L - 12} y={cy} anchor="end" mid bold={d.sig} color={d.sig ? C.ink : undefined}>{d.label}</T>
            <line x1={x(d.lo)} x2={x(d.hi)} y1={cy} y2={cy} stroke={col} strokeWidth={3} />
            <circle cx={x(d.pct)} cy={cy} r={6} fill={d.sig ? col : C.paper} stroke={col} strokeWidth={2.5} />
            <T x={696} y={cy} anchor="end" mid bold={d.sig} color={d.sig ? C.accent : undefined}>{d.pct > 0 ? "+" : ""}{d.pct.toFixed(1)}%</T>
          </g>
        );
      })}
    </Svg>
  );
}

/** 상권·행정동 리포트: 시간대별 매출 비중과 유동인구 비중(두 계열). */
export function AreaSlotsChart({ s }: { s: AreaSlots }) {
  const L = 34, R = 692, B = 215, Tp = 22;
  const max = Math.max(20, Math.ceil(Math.max(...s.rows.flatMap((d) => [d.sales, d.pilot ?? 0, d.flpop ?? 0])) / 20) * 20);
  const n = 1 + (s.hasPilot ? 1 : 0) + (s.hasFloating ? 1 : 0);
  const gw = (R - L) / s.rows.length, bw = n === 3 ? 22 : 26, gap = 4;
  const y = (v: number) => B - (v / max) * (B - Tp);
  const ticks: number[] = [];
  for (let g = 0; g <= max; g += 20) ticks.push(g);
  return (
    <Svg w={700} h={260} label="시간대별 매출 비중과 유동인구 비중 비교">
      {ticks.map((g) => (<g key={g}><line x1={L} x2={R} y1={y(g)} y2={y(g)} stroke={C.line} /><T x={L - 6} y={y(g)} anchor="end" mid>{g}</T></g>))}
      {s.rows.map((d, i) => {
        const cx = L + i * gw + gw / 2, x0 = cx - (n * bw + (n - 1) * gap) / 2;
        const bars: [number, string, boolean][] = [[d.sales, C.accent, true]];
        if (s.hasPilot) bars.push([d.pilot ?? 0, C.slate, false]);
        if (s.hasFloating) bars.push([d.flpop ?? 0, C.teal, false]);
        return (
          <g key={d.label}>
            {bars.map(([v, c, strong], j) => (
              <g key={j}>
                <rect x={x0 + j * (bw + gap)} y={y(v)} width={bw} height={B - y(v)} fill={c} />
                <T x={x0 + j * (bw + gap) + bw / 2} y={y(v) - 4} anchor="middle" bold={strong} color={strong ? C.accent : undefined}>{v.toFixed(v < 10 ? 1 : 0)}</T>
              </g>
            ))}
            <T x={cx} y={B + 17} anchor="middle" bold color={C.ink}>{d.label}</T>
          </g>
        );
      })}
    </Svg>
  );
}
