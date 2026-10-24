import type { CSSProperties } from "react";
import { AppIcon, type AppIconName } from "../../components/DataVisuals";
import type { AreaCharacter } from "../../lib/apiClient";
import type { ReportTip } from "../../lib/areaReportTips";
import { marketType } from "../../lib/marketTypes";
import { FS } from "../../lib/typography";
import type { ReportDetail, FoodUnitStoresResponse } from "../../lib/apiClient";
import { C } from "../stores/report/reportColors";
import { Head, Page } from "../stores/report/ReportShell";

function Share({ label, pct }: { label: string; pct: number | null }) {
  return <div style={{ display: "grid", gridTemplateColumns: "85px 1fr 65px", gap: 8, alignItems: "center", margin: "8px 0", fontSize: FS.caption }}>
    <span>{label}</span><span style={{ background: C.soft, height: 14 }}><span style={{ display: "block", height: 14, width: `${Math.max(0, Math.min(100, pct ?? 0))}%`, background: C.teal }} /></span><b>{pct === null ? "자료 없음" : `${pct.toFixed(1)}%`}</b>
  </div>;
}

export function ReportDemandPage({ n, total, detail }: { n: number; total: number; detail?: ReportDetail }) {
  const weekend = detail?.composition["요일"]?.find((r) => r.label === "주말")?.pct ?? null;
  const female = detail?.composition["성별"]?.find((r) => r.label === "여성")?.pct ?? null;
  return <Page n={n} total={total}><Head eyebrowText="고객과 영업일" title="언제 소비하고, 누가 결제하는가" text={`${detail?.period ?? "기준기간 확인 불가"} · 매출액 구성 기준`} />
    {!detail && <p>고객 구성 자료를 불러오지 못했습니다. 자료가 없는 것이 아니라 서버 응답 확인이 필요합니다.</p>}
    <div className="irp-cols"><div><h3>평일·주말 매출 비중</h3><Share label="평일" pct={weekend === null ? null : 100 - weekend} /><Share label="주말" pct={weekend} /></div>
    <div><h3>성별 매출 비중</h3><Share label="남성" pct={female === null ? null : 100 - female} /><Share label="여성" pct={female} /></div></div>
    <div><h3>연령별 매출 비중</h3>{(detail?.composition["연령"] ?? []).map((r) => <Share key={r.label} {...r} />)}</div>
    <p style={{ fontSize: FS.caption, color: C.mute }}>{detail?.basis} 성별·연령은 결제자 분류에 따른 매출액 구성으로 방문자 수나 전체 고객 인구 비율이 아닙니다. 결제자와 실제 이용자가 다를 수 있습니다. 평일은 5일, 주말은 2일을 합한 비중으로 하루 수요를 직접 비교할 수 없습니다. 요일별 개별 수치와 실제 영업일 수가 없어 일평균 매출은 제공하지 않습니다.</p>
    <p>영업일과 메뉴를 정하기 전에 평일·주말 각각 같은 시간대의 방문 흐름을 확인하고, 결제자 구성과 실제 동반 고객이 다른지도 살펴보세요.</p>
  </Page>;
}

export function ReportCompetitionPage({ n, total, stores, failed }: { n: number; total: number; stores?: FoodUnitStoresResponse; failed: boolean }) {
  return <Page n={n} total={total}><Head eyebrowText="실질 경쟁 점검" title="세부 업종 구성과 확인할 가게" text={stores ? `선택 경계·선택 업종 전체 ${stores.total.toLocaleString()}곳 · 상가정보 등록 기준` : failed ? "점포 자료 조회 실패 · 보고서를 다시 열어 주세요." : "점포 자료를 불러오는 중입니다."} />
    <div>{stores?.category_mix.slice(0, 8).map((r) => <Share key={r.code ?? r.name} label={`${r.name} ${r.count}곳`} pct={r.share_pct} />)}{(stores?.category_mix.length ?? 0) > 8 && <p>상위 8개 세부 업종만 표시했습니다. 나머지 업종도 전체 점포 수에 포함됩니다.</p>}</div>
    <table style={{ fontSize: FS.caption, width: "100%", borderCollapse: "collapse" }}><thead><tr><th align="left">현장 확인 대상</th><th align="left">세부 업종</th><th align="right">상권 중심 직선거리</th></tr></thead><tbody>{stores?.records.slice(0, 8).map((r) => <tr key={r.store_id}><td style={{ padding: 5 }}>{r.name} {r.branch}</td><td>{r.category_detail}</td><td align="right">{r.distance_m}m</td></tr>)}</tbody></table>
    <p style={{ fontSize: FS.caption, color: C.mute }}>목록은 상권·행정동 중심에서 가까운 순 최대 8곳이며 전체 경쟁점 목록이나 추천 순위가 아닙니다. 등록 정보만으로 현재 영업 중인지 확인할 수 없습니다. 세부 메뉴·가격·영업시간 자료는 확보되지 않았습니다.</p>
    <p>목록의 가게에서 대표 메뉴·가격·영업시간·좌석·포장 및 배달 여부를 확인해 내 계획과 겹치는 가게를 추려 보세요.</p>
  </Page>;
}

const TRAIT_ICON: Record<"business" | "residential" | "transit" | "commercial", AppIconName> = { business: "work", residential: "home", transit: "train", commercial: "building" };
const chip: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 7, borderRadius: 24, padding: "5px 12px", fontSize: FS.ui, fontWeight: 700, lineHeight: 1.4, whiteSpace: "nowrap" };

/** 1쪽 '이 상권의 특징' — 서비스 화면과 같은 아이콘의 상권 유형, 값으로 쓴 특징 문장, 지역 프로필을 한곳에 모은다. */
export function ReportCharacter({ character, marketTypeName, lines, profile }: { character?: AreaCharacter | null; marketTypeName?: string | null; lines: string[]; profile: { label: string; value: string }[] }) {
  const t = character?.type;
  const market = marketType(marketTypeName ?? "");
  const rows = profile.filter((p) => p.label !== "유형(참고용 분류)");
  return <section style={{ background: C.soft, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }} aria-label="이 상권의 특징">
    <h3 style={{ margin: 0, fontSize: FS.body }}>이 상권의 특징</h3>
    {(t || market) && <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {t && (t.traits.length > 0
        ? t.traits.map((x) => <span key={x.key} style={{ ...chip, background: "#F3EEFF", color: "#6333B1", border: "1px solid #E6DBFC" }}><AppIcon name={TRAIT_ICON[x.key]} />{x.label}</span>)
        : <span style={{ ...chip, background: "#F3EEFF", color: "#6333B1", border: "1px solid #E6DBFC" }}><AppIcon name="building" />{t.headline}</span>)}
      {market && <span style={{ ...chip, background: market.bg, color: market.color, border: `1px solid ${market.color}33` }} title={market.description}><AppIcon name={market.icon} />{market.label}</span>}
    </div>}
    {lines.length > 0 && <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 3, fontSize: FS.warn }}>{lines.map((l) => <li key={l}>{l}</li>)}</ul>}
    {rows.length > 0 && <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "6px 14px", fontSize: FS.caption }}>
      {rows.map((p) => <div key={p.label}><dt style={{ color: C.mute }}>{p.label}</dt><dd style={{ margin: 0, fontWeight: 700 }}>{p.value}</dd></div>)}
    </dl>}
    <p style={{ margin: 0, fontSize: FS.caption, color: C.mute }}>유형은 인구·입지 통계에 따른 참고용 분류이며 창업 성공 가능성을 뜻하지 않습니다.</p>
  </section>;
}

/** 1쪽 '이 특징을 활용한 전략' — 자료 근거와 운영 전략을 항목마다 한 덩이로. 어디까지나 검토할 방향이다. */
export function ReportStrategies({ title, tips }: { title: string; tips: ReportTip[] }) {
  if (tips.length === 0) return null;
  return <section style={{ display: "flex", flexDirection: "column", gap: 8 }} aria-label={title}>
    {title && <h3 style={{ margin: 0, fontSize: FS.body }}>{title}</h3>}
    {tips.map((tip, i) => <div className="irp-tip" key={tip.key}>
      <h4 style={{ margin: "0 0 3px", fontSize: FS.ui }}>{i + 1}. {tip.title}</h4>
      <p style={{ margin: "0 0 3px", fontSize: FS.caption, color: C.mute }}><b>자료 근거</b> {tip.evidence}</p>
      <p style={{ margin: 0, fontSize: FS.warn }}><b>운영 전략</b> {tip.action}</p>
    </div>)}
  </section>;
}
