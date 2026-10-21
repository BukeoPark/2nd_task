import type { AreaCharacter } from "../../lib/apiClient";
import { FS } from "../../lib/typography";
import { Block, Caption } from "../../components/PanelKit";
import { demandStructureNote, typeNotice } from "../../lib/areaCharacter";

/** 유형은 지역명 옆에 표시하고, 통계·주의사항은 요약 안에서 읽는다. */
export function SummaryTypeBadge({ data }: { data: AreaCharacter }) {
  const label = data.type.traits.length ? data.type.traits.map((t) => t.label).join(" · ") : data.type.headline;
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 7, borderRadius: 24, padding: "6px 13px", background: "#F3EEFF", color: "#6333B1", border: "1px solid #E6DBFC", fontSize: FS.cardTitle, fontWeight: 700, lineHeight: 1.4, wordBreak: "keep-all" }}><span aria-hidden="true" style={{ fontSize: FS.screenTitle, lineHeight: 1 }}>⌂</span>{label}</span>;
}

export function SummaryTypeContext({ data: d }: { data: AreaCharacter }) {
  const residential = d.type.traits.some((t) => t.key === "residential");
  const business = d.type.traits.some((t) => t.key === "business");
  const intro = residential ? "직장인구보다 상주인구가 많은 지역이에요." : business ? "상주인구보다 직장인구가 많은 지역이에요." : demandStructureNote(d.type);
  const demand = d.sections.demand;
  return <section aria-label="지역 유형과 판정 근거" style={{ marginTop: 16, padding: "16px 0", borderTop: "1px solid #E5E7EB", borderBottom: "1px solid #E5E7EB" }}>
    {intro && <div style={{ fontSize: FS.body, fontWeight: 700, color: "#374151", lineHeight: 1.7, wordBreak: "keep-all" }}>{intro}</div>}
    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", marginTop: 8, fontSize: FS.caption, color: "#6B7280" }}>
      <span>상주인구 <b>{demand.residents.value == null ? "자료 없음" : `${Math.round(demand.residents.value).toLocaleString("ko-KR")}명`}</b></span>
      <span>직장인구 <b>{demand.workers.value == null ? "자료 없음" : `${Math.round(demand.workers.value).toLocaleString("ko-KR")}명`}</b></span>
      <span>직장인구 비율 <b>{demand.worker_share_pct == null ? "자료 없음" : `${Math.round(demand.worker_share_pct)}%`}</b></span>
    </div>
    {typeNotice(d.type) && <Caption tone="warn">{typeNotice(d.type)}</Caption>}
    <details style={{ marginTop: 10, fontSize: FS.caption, color: "#6B7280", lineHeight: 1.75 }}>
      <summary style={{ cursor: "pointer", color: "#6333B1" }}>유형 판정 근거·기준</summary>
      {d.type.traits.map((t) => <div key={t.key} style={{ marginTop: 10 }}><b>{t.label}</b><ul style={{ margin: "4px 0", paddingLeft: 18 }}>{t.evidence.map((e) => <li key={e}>{e}</li>)}</ul></div>)}
      {d.type.held.map((h) => <p key={h.key}>{h.reason}</p>)}
      <p>인구·입지 통계에 따른 참고용 분류이며 실제 고객 구성이나 창업 성공 가능성을 뜻하지 않아요.</p>
      <div>{d.basis.label}</div><div>{d.basis.unit}</div>
      <ul style={{ paddingLeft: 18 }}>{d.basis.rules.map((r) => <li key={r}>{r}</li>)}</ul>
      <p>{d.basis.relative_note} {d.basis.success_note}</p>
      {d.basis.data_notes?.map((n) => <p key={n}>{n}</p>)}
      {d.cautions.filter((t) => /이용량.*연결|승하차.*합계/.test(t)).map((t) => <p key={t}>{t}</p>)}
      {d.basis.sources.map((s) => <div key={s.title}>{s.title} · {s.reference}</div>)}
    </details>
  </section>;
}

/** 핵심 숫자와 겹치는 증감·인구 설명을 빼고 지역 특징을 최대 두 개로 추린다. */
export function SummaryTypeInsights({ data: d, canInterpret }: { data: AreaCharacter; canInterpret: boolean }) {
  const features = d.strengths.filter((s) => !/상주인구|직장인구|폐업|점포 수/.test(s)).slice(0, 2);
  const cautions = d.cautions.filter((s) => !/이용량.*연결|승하차.*합계/.test(s));
  return <>
    {features.length > 0 && <Block title="함께 읽을 지역 특징"><ul style={{ margin: 0, paddingLeft: 18, fontSize: FS.body, color: "#374151", lineHeight: 1.8, display: "grid", gap: 8, wordBreak: "keep-all" }}>{features.map((s) => <li key={s}>{s}</li>)}</ul></Block>}
    <Block title="직접 확인하면 좋은 것" accent="#92531B">
      <div style={{ fontSize: FS.body, color: "#374151", lineHeight: 1.8, wordBreak: "keep-all" }}>{d.type.traits.some((t) => t.key === "residential") ? "실제 고객이 주민 중심인지, 시간대별 손님 흐름은 어떤지 현장에서 확인해 보세요." : "지역의 인구·입지 특성이 실제 고객과 손님 흐름에도 나타나는지 현장에서 확인해 보세요."}</div>
      {canInterpret && cautions.length > 0 && <details style={{ marginTop: 10, fontSize: FS.warn, color: "#6B7280", lineHeight: 1.75 }}><summary style={{ cursor: "pointer", color: "#92531B" }}>추가 확인사항</summary><ul style={{ paddingLeft: 18 }}>{cautions.map((s) => <li key={s}>{s}</li>)}</ul></details>}
    </Block>
  </>;
}
