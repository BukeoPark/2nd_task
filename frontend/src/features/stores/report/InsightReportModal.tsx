import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { apiClient } from "../../../lib/apiClient";
import { buildInsightReport, sampleNote, type InsightReport } from "../../../lib/insightReport";
import { buildTriad } from "../../../lib/reportTriad";
import { ReportLead } from "./ReportLead";
import { reportLead } from "../../../lib/reportLead";
import { ReportTriad } from "./ReportTriad";
import { useLocationInfluence, useNearbyAnalysis, useStoreDetail } from "../useStores";
import { AgeChart, ChurnChart, ForestChart, HistogramChart, RateBullets, SlotsChart, TrendChart } from "./ReportCharts";
import { C } from "./reportColors";
import { Fig, Head, Page, ReportFrame, Take, TileBox } from "./ReportShell";
import { boxS, eyebrow, footS } from "./reportStyles";

const LONG = 10 * 60 * 1000;
const RADIUS_M = 500;
const today = () => new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD

function ReportPages({ r, today: date }: { r: InsightReport; today: string }) {
  const hasChurn = r.competition !== null || r.factors !== null;
  const pages = ["cover", r.level && "level", r.slots && "slots", hasChurn && "comp"].filter(Boolean) as string[];
  const total = pages.length;
  const no = (k: string) => pages.indexOf(k) + 1;
  const lv = r.level, sl = r.slots, cp = r.competition, fa = r.factors;
  return (
    <>
      <Page n={no("cover")} total={total}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={eyebrow}>자영업자용 · {lv?.quarterLabel ?? "최근 분기"} 기준</div>
          <h1 style={{ fontSize: "clamp(26px,5vw,38px)", lineHeight: 1.25, fontWeight: 900, margin: 0, letterSpacing: "-.02em", textWrap: "balance" }}>{r.headline}</h1>
          <p style={{ margin: 0, color: C.mute, fontSize: 13 }}>{r.subtitle}<br />리포트 작성 {date}</p>
        </div>
        <ReportLead lead={reportLead("owner", "store", { level: no("level") || undefined, slots: no("slots") || undefined, competition: hasChurn ? no("comp") : undefined, checklist: r.checklist.length > 0 ? total : undefined })} />
        {r.tiles.length > 0 && <div className="irp-tiles">{r.tiles.map((t) => <TileBox key={t.label} {...t} />)}</div>}
        <ReportTriad triad={buildTriad({ mode: "owner", tiles: r.tiles, cautions: [], checklist: r.checklist, sampleNote: lv?.sampleStatus === "too_few" ? sampleNote(lv.sampleStores, "지역") : null })} />
        <div className="irp-cols">
          {r.profile.length > 0 && (
            <div>
              <h3 style={{ margin: "0 0 6px", fontSize: 14 }}>이 매장 프로필</h3>
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
                <tbody>{r.profile.map((p) => (<tr key={p.label}><th style={{ textAlign: "left", color: C.mute, fontWeight: 500, width: "34%", padding: "6px 10px 6px 0", borderBottom: `1px solid ${C.line}`, verticalAlign: "top" }}>{p.label}</th><td style={{ padding: "6px 0", borderBottom: `1px solid ${C.line}` }}>{p.value}</td></tr>))}</tbody>
              </table>
            </div>
          )}
        </div>
      </Page>

      {lv && (
        <Page n={no("level")} total={total}>
          <Head eyebrowText="인사이트 1 · 매출 수준과 흐름" title={`점포당 월평균 추정매출은 중앙값의 ${lv.ratio.toFixed(1)}배${lv.yoyPerStore !== null ? `, 전년 동기 대비 ${lv.yoyPerStore > 0 ? "+" : ""}${lv.yoyPerStore.toFixed(1)}%` : ""}`} text={lv.text} />
          <div className="irp-cols">
            <Fig title={`${lv.peerCount}개 ${lv.peerLabel} 중 어디에 있나`} note="상권별 점포당 월평균 추정매출 분포(만원). 점포가 적은 상권도 포함돼 값이 크게 흔들릴 수 있습니다."><HistogramChart level={lv} /></Fig>
            <Fig title="최근 분기별 점포당 월평균 추정매출" note={`단위 만원.${lv.storesFrom !== null && lv.storesNow !== null ? ` 점포 수는 ${lv.storesFrom}곳에서 ${lv.storesNow}곳으로 바뀌었습니다.` : ""}`}><TrendChart level={lv} /></Fig>
          </div>
          <div className="irp-tiles">
            {lv.qoqPerStore !== null && <TileBox label="점포당 월평균 추정매출 전분기 대비" value={`${lv.qoqPerStore > 0 ? "+" : ""}${lv.qoqPerStore.toFixed(1)}%`} note="직전 분기와 비교" tone={lv.qoqPerStore < 0 ? "neg" : "plain"} />}
            {lv.yoyTotal !== null && <TileBox label="총매출 전년 동기 대비" value={`${lv.yoyTotal > 0 ? "+" : ""}${lv.yoyTotal.toFixed(1)}%`} note="점포 수 변화가 함께 반영" tone={lv.yoyTotal < 0 ? "neg" : "plain"} />}
            {lv.flpopYoy !== null && <TileBox label="유동인구 지수 전년 동기 대비" value={`${lv.flpopYoy > 0 ? "+" : ""}${lv.flpopYoy.toFixed(1)}%`} note="길 단위로 배분한 추정치" tone={lv.flpopYoy < 0 ? "neg" : "plain"} />}
          </div>
          {lv.flpopYoy !== null && <div style={boxS}>유동인구 지수는 길 위의 사람만 세어 오피스 건물 안 인구가 적게 잡힙니다. 오피스가 많은 상권에서는 실제 손님 수와 다를 수 있어 감소 폭보다 방향을 참고하세요.</div>}
          <Take text={`순위가 높다는 것은 이 ${lv.peerLabel.includes("상권") ? "상권" : "행정동"}에 매출이 모인다는 뜻이고, 이익이 많이 남는다는 뜻은 아닙니다. 임대료·인건비·원가는 이 자료에 없습니다. 내 월 매출의 변화율을 점포당 ${lv.yoyPerStore !== null ? `${lv.yoyPerStore > 0 ? "+" : ""}${lv.yoyPerStore.toFixed(1)}%` : "평균"}와 견줘 보세요. 내 가게가 더 크게 내려갔다면 상권 전체 흐름보다 내 가게의 메뉴·가격·시간대를 먼저 점검해 볼 신호입니다. '내 가게 점검'에 월 매출을 기록하면 같은 업종 흐름과 바로 비교됩니다.`} />
          <div style={footS}><b style={{ color: C.ink }}>출처</b> 서울시 상권분석서비스(추정매출·점포·길단위인구-상권) {lv.quarterLabel}. 추정매출은 카드 결제 기반 평균이며 매출이 큰 점포가 평균을 끌어올릴 수 있습니다.</div>
        </Page>
      )}

      {sl && (
        <Page n={no("slots")} total={total}>
          <Head eyebrowText="인사이트 2 · 언제, 누가 쓰는 상권인가" title={r.headline} text={sl.text} />
          <Fig title="시간대별 비중 (%)" note="각 계열의 합은 100%입니다. 유동인구와 매출은 다른 집계라 비중의 차이가 구매 전환율을 뜻하지 않습니다."
            legend={[[C.accent, "이 상권 매출 비중"], [C.slate, "비교 상권 평균 매출 비중"], ...(sl.hasFloating ? ([[C.teal, "이 상권 유동인구 비중"]] as [string, string][]) : [])]}>
            <SlotsChart s={sl} />
          </Fig>
          {sl.ages && (
            <div className="irp-cols">
              <Fig title="직장인구와 매출의 연령 구성 (%)" note="10대는 값이 작아 뺐습니다. 직장인구와 카드 결제 고객은 모집단이 다릅니다." legend={[[C.teal, "상권 안 직장인구"], [C.accent, "카드 매출"]]}><AgeChart ages={sl.ages} /></Fig>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {sl.workers && <TileBox label="상권 안 직장인구" value={`${sl.workers.total.toLocaleString("ko-KR")}명`} note={sl.workers.median !== null && sl.workers.ratio !== null ? `비교 상권 중앙값 ${sl.workers.median.toLocaleString("ko-KR")}명 · ${sl.workers.ratio.toFixed(1)}배` : ""} />}
                {sl.workers?.age3040 != null && <TileBox label="직장인구 중 30·40대" value={`${sl.workers.age3040.toFixed(1)}%`} note={sl.salesAge3040 !== null ? `이 상권 매출에서 30·40대는 ${sl.salesAge3040.toFixed(1)}%` : ""} />}
                {sl.salesAge50 !== null && <TileBox label="매출 중 50대 이상" value={`${sl.salesAge50.toFixed(1)}%`} note={sl.workAge50 !== null ? `직장인구 중 50대 이상은 ${sl.workAge50.toFixed(1)}%` : ""} />}
              </div>
            </div>
          )}
          <Take text={sl.take} />
          <div style={footS}><b style={{ color: C.ink }}>출처</b> 서울시 상권분석서비스(추정매출 시간대·연령대, 직장인구, 길단위인구-상권). 직장인구는 상권 영역 안 값이며 상권 밖 배후지는 포함하지 않습니다.</div>
        </Page>
      )}

      {hasChurn && (
        <Page n={no("comp")} total={total}>
          <Head eyebrowText="인사이트 3 · 경쟁과 폐업" title={cp ? "같은 업종이 모여 있고, 가게가 바뀌는 속도는 이렇습니다" : "입지 요인"} text={cp?.text} />
          {cp && (cp.yearly || cp.churn) && (
            <div className="irp-cols">
              {cp.yearly && <Fig title={`반경 ${cp.radiusM}m 인허가 연도별 개업·폐업 (곳)`} note={`${cp.cohort ? `인허가 후 ${cp.cohort.years}년 이내 폐업 비율은 ${(cp.cohort.rate * 100).toFixed(1)}%(${cp.cohort.den}곳 중 ${cp.cohort.num}곳)입니다. ` : ""}이 매장의 폐업 가능성을 뜻하지 않습니다.`} legend={[[C.teal, "개업"], [C.accent, "폐업"]]}><ChurnChart yearly={cp.yearly} /></Fig>}
              {cp.churn && <Fig title={`연 개업률·폐업률 vs 비교 ${cp.churn.peers ?? ""}곳`} note="최근 4개 분기 합 ÷ 평균 점포 수. 업종 변경·이전도 개폐업으로 잡힙니다."><RateBullets churn={cp.churn} /></Fig>}
            </div>
          )}
          {fa && (
            <Fig title="점포당 매출이 높은 상권의 특징 (입지 요인 모델)" note={`${fa.text} 값은 요인이 표준편차 1만큼 클 때(지하철역은 없음→있음) 점포당 매출이 몇 % 높은 경향인지, 선은 95% 구간입니다. 선이 0을 지나면 뚜렷한 관계가 없는 것입니다.`}>
              <ForestChart f={fa} />
            </Fig>
          )}
          <div className="irp-cols">
            {cp && <Take text={cp.take} />}
            {r.checklist.length > 0 && (
              <div>
                <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>이번 달 확인해 볼 것</h3>
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
                  {r.checklist.map((c) => (<li key={c} style={{ display: "grid", gridTemplateColumns: "20px 1fr", gap: 8, fontSize: 13.5 }}><span style={{ width: 13, height: 13, border: `1.5px solid ${C.accent}`, marginTop: 5 }} />{c}</li>))}
                </ul>
              </div>
            )}
          </div>
          <div style={footS}>
            <b style={{ color: C.ink }}>데이터 한계</b> {r.limits.slice(1).join(" ")}<br />
            <b style={{ color: C.ink }}>출처</b> {r.sources.join(" · ")}. 좌표 없는 인허가는 반경 계산에서 제외했고, 거리는 직선거리입니다.
          </div>
        </Page>
      )}
    </>
  );
}

/** '상권 인사이트 리포트 뽑기' — 화면 위에 리포트를 펼치고, 인쇄(PDF 저장)할 수 있다. 자료는 매장 상세가 이미 쓰는 조회를 그대로 재사용한다. */
export function InsightReportModal({ storeId, onClose }: { storeId: string; onClose: () => void }) {
  const detail = useStoreDetail(storeId);
  const bench = useQuery({ queryKey: ["sales-benchmark", storeId], queryFn: () => apiClient.getSalesBenchmark(storeId), staleTime: LONG });
  const nearby = useNearbyAnalysis(storeId, RADIUS_M);
  const loc = useLocationInfluence(storeId, RADIUS_M);
  const anchors = useQuery({ queryKey: ["store-anchors", storeId], queryFn: () => apiClient.getStoreAnchors(storeId), staleTime: LONG });

  const store = detail.data?.store;
  const pending = detail.isPending || bench.isPending || nearby.isPending || loc.isPending || anchors.isPending;
  const report = useMemo(() => {
    if (!store) return null;
    const lic = detail.data?.operation_history.license;
    return buildInsightReport({
      store: { name: store.name, branch: store.branch, category: store.category.scls || store.category.mcls, dong: store.dong, sigungu: store.sigungu, areaName: store.trdar?.name ?? null, areaKind: store.trdar?.type ?? null },
      licenseAge: lic?.age_label ?? null,
      licenseState: lic ? `${lic.license_name} ${lic.state_name}` : null,
      anchors: (anchors.data?.brands ?? []).map((b) => ({ label: b.label, nearestM: b.nearest_m })),
      bench: bench.data ?? null,
      nearby: nearby.data ?? null,
      loc: loc.data ?? null,
      today: today(),
    });
  }, [store, detail.data, bench.data, nearby.data, loc.data, anchors.data]);
  const hasAny = report !== null && (report.level || report.slots || report.competition || report.factors);
  // 일부 조회만 실패했을 때 그 쪽이 조용히 빠지면 '자료 없음'으로 오해하므로 실패한 자료를 밝힌다
  const partialFailures = [bench.isError && "상권 매출 비교", nearby.isError && "주변 인허가 분석", loc.isError && "입지 영향력"].filter(Boolean) as string[];

  return (
    <ReportFrame title="상권분석 보고서 · 내 매장(자영업자용)" canPrint={!pending && Boolean(hasAny)} onClose={onClose}>
      {pending && <div style={{ ...boxS, background: C.paper }}>리포트 자료를 불러오는 중...</div>}
      {!pending && partialFailures.length > 0 && (
        <div style={{ ...boxS, background: C.paper, color: C.bad }}>
          다음 자료를 불러오지 못해 해당 내용이 이 리포트에 빠져 있습니다: {partialFailures.join(" · ")}. 자료가 없는 것이 아니라 조회 실패이니 잠시 후 리포트를 다시 열어 주세요.
        </div>
      )}
      {!pending && detail.isError && <div style={{ ...boxS, background: C.paper, color: C.bad }}>매장 정보를 불러오지 못했습니다: {detail.error.message}</div>}
      {!pending && report && !hasAny && (
        <div style={{ ...boxS, background: C.paper }}>이 매장은 상권 매출·경쟁 자료가 부족해 리포트를 만들 수 없습니다. 자료가 없는 것이지 0이라는 뜻이 아닙니다.{bench.data?.message ? ` (${bench.data.message})` : ""}</div>
      )}
      {!pending && report && hasAny && <ReportPages r={report} today={today()} />}
    </ReportFrame>
  );
}
