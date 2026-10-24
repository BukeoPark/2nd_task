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
