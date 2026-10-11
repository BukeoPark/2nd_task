import { Fragment } from "react";


export interface LineSeries {
  name: string;
  color: string;
  /** 값이 없는 분기는 null — 0 으로 그리지 않고 선을 끊는다 */
  values: (number | null)[];
}

/** 꺾은선(의존성 없는 SVG). 눈금 라벨은 labels, 값 표기는 fmt. */
export function LineChart({ labels, series, fmt, height = 150 }: { labels: string[]; series: LineSeries[]; fmt: (v: number) => string; height?: number }) {
  const W = 320, padL = 6, padR = 6, padT = 10, padB = 18;
  const all = series.flatMap((s) => s.values).filter((v): v is number => v !== null);
  if (all.length === 0) return <div style={{ fontSize: 12, color: "#6B7280" }}>표시할 값이 없습니다(자료 없음).</div>;
  const min = Math.min(...all), max = Math.max(...all);
  const span = max - min || Math.abs(max) || 1;
  const x = (i: number) => padL + (labels.length <= 1 ? 0 : (i * (W - padL - padR)) / (labels.length - 1));
  const y = (v: number) => padT + (1 - (v - min) / span) * (height - padT - padB);
  const tick = Math.max(1, Math.ceil(labels.length / 6));
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${height}`} width="100%" role="img" aria-label="추이 차트">
        {series.map((s) => {
          let d = "";
          let prev = false;
          s.values.forEach((v, i) => {
            if (v === null) { prev = false; return; }
            d += `${prev ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
            prev = true;
          });
          return (
            <Fragment key={s.name}>
              <path d={d} fill="none" stroke={s.color} strokeWidth={2} />
              {s.values.map((v, i) => v !== null && <circle key={i} cx={x(i)} cy={y(v)} r={2.2} fill={s.color}><title>{`${s.name} ${labels[i]}: ${fmt(v)}`}</title></circle>)}
            </Fragment>
          );
        })}
        {labels.map((l, i) => i % tick === 0 && <text key={i} x={x(i)} y={height - 4} fontSize={9} textAnchor="middle" fill="#6B7280">{l}</text>)}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#6B7280" }}>
        <span>최저 {fmt(min)}</span><span>최고 {fmt(max)}</span>
      </div>
      {series.length > 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 11, marginTop: 4 }}>
          {series.map((s) => <span key={s.name} style={{ color: s.color, fontWeight: 600 }}>● {s.name}</span>)}
        </div>
      )}
    </div>
  );
}

export interface BarItem {
  label: string;
  value: number | null;
  color?: string;
  note?: string;
}

/** 가로 막대. 음수(감소)는 0 선 왼쪽으로, 값이 없으면 막대 없이 '자료 없음'. */
export function BarList({ items, fmt }: { items: BarItem[]; fmt: (v: number) => string }) {
  const vals = items.map((i) => i.value).filter((v): v is number => v !== null);
  const maxAbs = Math.max(0, ...vals.map(Math.abs)) || 1;
  const hasNeg = vals.some((v) => v < 0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {items.map((it) => (
        <div key={it.label} style={{ display: "grid", gridTemplateColumns: "90px 1fr 84px", alignItems: "center", gap: 6, fontSize: 12 }}>
          <span style={{ color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={it.label}>{it.label}</span>
          <div style={{ position: "relative", height: 12, background: "#F3F4F6", borderRadius: 3 }}>
            {it.value !== null && (
              <div style={{
                position: "absolute", top: 0, bottom: 0, background: it.color ?? "#3B82F6", borderRadius: 3,
                width: `${(Math.abs(it.value) / maxAbs) * (hasNeg ? 50 : 100)}%`,
                left: hasNeg ? (it.value < 0 ? `${50 - (Math.abs(it.value) / maxAbs) * 50}%` : "50%") : 0,
              }} />
            )}
          </div>
          <span style={{ textAlign: "right", color: it.value === null ? "#9CA3AF" : "#111827" }} title={it.note}>{it.value === null ? "자료 없음" : fmt(it.value)}</span>
        </div>
      ))}
    </div>
  );
}
