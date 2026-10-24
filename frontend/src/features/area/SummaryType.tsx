import { AppIcon, PopulationMix } from "../../components/DataVisuals";
import type { AreaCharacter } from "../../lib/apiClient";
import { FS } from "../../lib/typography";
import { Caption } from "../../components/PanelKit";
import { demandStructureNote, typeNotice } from "../../lib/areaCharacter";

/** 유형은 지역명 옆에 표시하고, 통계·주의사항은 요약 안에서 읽는다. */
export function SummaryTypeBadge({ data }: { data: AreaCharacter }) {
  const label = data.type.traits.length ? data.type.traits.map((t) => t.label).join(" · ") : data.type.headline;
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 7, borderRadius: 24, padding: "6px 13px", background: "#F3EEFF", color: "#6333B1", border: "1px solid #E6DBFC", fontSize: FS.cardTitle, fontWeight: 700, lineHeight: 1.4, wordBreak: "keep-all" }}><AppIcon name={data.type.traits.some(t => t.key === "business") ? "work" : data.type.traits.some(t => t.key === "residential") ? "home" : data.type.traits.some(t => t.key === "transit") ? "train" : "building"} />{label}</span>;
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
    <PopulationMix residents={d.sections.demand.residents.value} workers={d.sections.demand.workers.value} period={d.sections.demand.residents.as_of ?? d.sections.demand.workers.as_of} />
    {d.type.traits.some(t => t.key !== "business" && t.key !== "residential") && <Caption style={{ marginTop: 8 }}>{d.type.traits.filter(t => t.key !== "business" && t.key !== "residential").map(t => evidenceOf(t)[0]).filter(Boolean).join(" · ")}</Caption>}
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
