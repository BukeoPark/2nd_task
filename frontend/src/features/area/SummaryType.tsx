import type { AreaCharacter } from "../../lib/apiClient";
import { FS } from "../../lib/typography";
import { Block, Caption } from "../../components/PanelKit";
import { demandStructureNote, typeNotice } from "../../lib/areaCharacter";

/** 유형은 지역명 옆에 표시하고, 통계·주의사항은 요약 안에서 읽는다. */
export function SummaryTypeBadge({ data }: { data: AreaCharacter }) {
  const label = data.type.traits.length ? data.type.traits.map((t) => t.label).join(" · ") : data.type.headline;
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 7, borderRadius: 24, padding: "6px 13px", background: "#F3EEFF", color: "#6333B1", border: "1px solid #E6DBFC", fontSize: FS.cardTitle, fontWeight: 700, lineHeight: 1.4, wordBreak: "keep-all" }}><span aria-hidden="true" style={{ fontSize: FS.screenTitle, lineHeight: 1 }}>⌂</span>{label}</span>;
}

/** 요약의 유형 블록 — 쉬운 설명 한 줄, 핵심 주의 한 줄, 핵심 판정 근거. 판정 방법·출처·한계는 접힘에 둔다(같은 숫자를 다시 적지 않는다). */
export function SummaryTypeContext({ data: d }: { data: AreaCharacter }) {
  const residential = d.type.traits.some((t) => t.key === "residential");
  const business = d.type.traits.some((t) => t.key === "business");
  const intro = residential ? "직장인구보다 상주인구가 많은 지역이에요." : business ? "상주인구보다 직장인구가 많은 지역이에요." : demandStructureNote(d.type);
  // '곳끼리 더하면 중복' 같은 계산 주의는 '추가 확인사항' 한 곳에만 둔다
  const evidenceOf = (t: AreaCharacter["type"]["traits"][number]) => t.evidence.filter((e) => !/더하면 중복|함께 포함/.test(e));
  return <section aria-label="지역 유형과 판정 근거" style={{ marginTop: 16, padding: "16px 0", borderTop: "1px solid #E5E7EB", borderBottom: "1px solid #E5E7EB" }}>
    {intro && <div style={{ fontSize: FS.body, fontWeight: 700, color: "#374151", lineHeight: 1.7, wordBreak: "keep-all" }}>{intro}</div>}
    {typeNotice(d.type) && <Caption tone="warn">{typeNotice(d.type)}</Caption>}
    {d.type.traits.length > 0 && <Caption style={{ marginTop: 8 }}>{d.type.traits.map((t) => evidenceOf(t)[0]).filter(Boolean).join(" · ")}</Caption>}
    <details style={{ marginTop: 10, fontSize: FS.caption, color: "#6B7280", lineHeight: 1.75 }}>
      <summary style={{ cursor: "pointer", color: "#6333B1" }}>분류 방법·출처·한계</summary>
      <p>인구·입지 통계에 따른 참고용 분류이며, 실제 고객 구성이나 창업 성공 가능성을 뜻하지 않아요.</p>
      {d.type.traits.map((t) => <div key={t.key}>{evidenceOf(t).slice(1).join(" · ")}</div>)}
      {d.type.held.map((h) => <p key={h.key}>{h.reason}</p>)}
      <div>{d.basis.label}</div><div>{d.basis.unit}</div>
      <ul style={{ paddingLeft: 18 }}>{d.basis.rules.map((r) => <li key={r}>{r}</li>)}</ul>
      <p>{d.basis.relative_note} {d.basis.success_note}</p>
      {d.basis.data_notes?.map((n) => <p key={n}>{n}</p>)}
      {d.cautions.filter((t) => /이용량.*연결|승하차.*합계/.test(t)).map((t) => <p key={t}>{t}</p>)}
      {d.basis.sources.map((s) => <div key={s.title}>{s.title} · {s.reference}</div>)}
    </details>
  </section>;
}

/** 직접 확인할 것과 추가 확인사항. 역·정류장 같은 지역 특징은 요약에 되풀이하지 않고 해당 항목(교통·입지)에서 본다. */
export function SummaryTypeInsights({ data: d, canInterpret }: { data: AreaCharacter; canInterpret: boolean }) {
  const cautions = d.cautions.filter((s) => !/이용량.*연결|승하차.*합계/.test(s));
  return <>
    <Block title="현장에서 확인할 것" accent="#92531B">
      <div style={{ fontSize: FS.body, color: "#374151", lineHeight: 1.8, wordBreak: "keep-all" }}>{d.type.traits.some((t) => t.key === "residential") ? "실제 고객이 주민 중심인지, 시간대별 손님 흐름은 어떤지 현장에서 확인해 보세요." : "지역의 인구·입지 특성이 실제 고객과 손님 흐름에도 나타나는지 현장에서 확인해 보세요."}</div>
      {canInterpret && cautions.length > 0 && <details style={{ marginTop: 10, fontSize: FS.warn, color: "#6B7280", lineHeight: 1.75 }}><summary style={{ cursor: "pointer", color: "#92531B" }}>추가 확인사항</summary><ul style={{ paddingLeft: 18 }}>{cautions.map((s) => <li key={s}>{s}</li>)}</ul></details>}
    </Block>
  </>;
}
