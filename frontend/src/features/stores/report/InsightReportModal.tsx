import { reportFilename } from "../../../lib/reportFilename";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { apiClient } from "../../../lib/apiClient";
import { buildInsightReport, sampleNote, type InsightReport } from "../../../lib/insightReport";
import { buildTriad } from "../../../lib/reportTriad";
import { ReportLead } from "./ReportLead";
import { storeReportLead } from "../../../lib/reportLead";
import { ReportHeadline } from "./ReportHeadline";
import { ReportDateContext } from "./reportDate";
import { RF } from "./reportTypography";
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
  const pages = ["cover", r.level && "level", r.slots && "slots", hasChurn && "comp", "summary", "basis"].filter(Boolean) as string[];
  const total = pages.length;
  const no = (k: string) => pages.indexOf(k) + 1;
  const lv = r.level, sl = r.slots, cp = r.competition, fa = r.factors;
  const unitWord = lv?.peerLabel.includes("상권") ? "상권" : "행정동";
  return (
    <ReportDateContext.Provider value={date}>
      {/* 1쪽 표지 — 상권 보고서와 같은 틀: 분류 줄 · 제목(두 줄 맞춤) · 소개 · 핵심 숫자 · 길잡이 · 주의할 점 */}
      <Page n={no("cover")} total={total} className="irp-cover-page">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={eyebrow}>자영업자용 · 매출 증대·기회 포착 · {lv?.quarterLabel ?? "최근 분기"} 기준</div>
          <ReportHeadline title={r.headline} />
          <p style={{ margin: 0, color: C.mute, fontSize: RF.body }}>{r.subtitle}</p>
        </div>
        {r.profile.length > 0 && (
          <div>
            <h3 style={{ margin: "0 0 6px", fontSize: RF.section }}>이 매장 프로필</h3>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: RF.body }}>
              <tbody>{r.profile.map((p) => (<tr key={p.label}><th style={{ textAlign: "left", color: C.mute, fontWeight: 500, width: "34%", padding: "6px 10px 6px 0", borderBottom: `1px solid ${C.line}`, verticalAlign: "top" }}>{p.label}</th><td style={{ padding: "6px 0", borderBottom: `1px solid ${C.line}` }}>{p.value}</td></tr>))}</tbody>
            </table>
          </div>
        )}
        {r.tiles.length > 0 && <div className="irp-tiles irp-cover-metrics">{r.tiles.map((t) => <TileBox key={t.label} {...t} />)}</div>}
        <ReportLead compact lead={storeReportLead({ level: no("level") || undefined, slots: no("slots") || undefined, competition: hasChurn ? no("comp") : undefined, summary: no("summary"), basis: no("basis") })} />
        <ReportTriad hideTodo subdued triad={buildTriad({ mode: "owner", tiles: [], cautions: [], checklist: r.checklist.slice(0, 2), sampleNote: lv?.sampleStatus === "too_few" ? sampleNote(lv.sampleStores, "지역") : null })} />
      </Page>

      {lv && (
        <Page n={no("level")} total={total}>
          <Head eyebrowText="매출 흐름" title={`점포당 월평균 추정매출은 비교 ${unitWord} 중앙값의 ${lv.ratio.toFixed(1)}배`} text={lv.text} />
          <div className="irp-cols">
            <Fig title={`${lv.peerCount}개 비교 ${unitWord} 중 어디에 있나`} note={`${unitWord}별 점포당 월평균 추정매출 분포(만원). 점포가 적은 ${unitWord}도 포함돼 값이 크게 흔들릴 수 있습니다.`}><HistogramChart level={lv} /></Fig>
            <Fig title="최근 분기별 점포당 월평균 추정매출" note={`단위 만원.${lv.storesFrom !== null && lv.storesNow !== null ? ` 서울시 집계 점포 수는 ${lv.storesFrom}곳에서 ${lv.storesNow}곳으로 바뀌었습니다.` : ""}`}><TrendChart level={lv} /></Fig>
          </div>
          <div className="irp-tiles">
            {lv.qoqPerStore !== null && <TileBox label="점포당 월평균 추정매출 전분기 대비" value={`${lv.qoqPerStore > 0 ? "+" : ""}${lv.qoqPerStore.toFixed(1)}%`} note="직전 분기와 비교" tone={lv.qoqPerStore < 0 ? "neg" : "plain"} />}
            {lv.yoyTotal !== null && <TileBox label="총매출 전년 동기 대비" value={`${lv.yoyTotal > 0 ? "+" : ""}${lv.yoyTotal.toFixed(1)}%`} note="점포 수 변화가 함께 반영" tone={lv.yoyTotal < 0 ? "neg" : "plain"} />}
            {lv.flpopYoy !== null && <TileBox label="유동인구 지수 전년 동기 대비" value={`${lv.flpopYoy > 0 ? "+" : ""}${lv.flpopYoy.toFixed(1)}%`} note="길 단위로 배분한 추정치" tone={lv.flpopYoy < 0 ? "neg" : "plain"} />}
          </div>
          <p style={{ margin: 0, fontSize: RF.caption, color: C.mute }}>비교 범위: {lv.peerLabel} · 같은 업종의 유효값 {lv.peerCount}곳(소규모 {unitWord} 포함). 순위 중 점포 20곳 이상 비교는 별도 기준입니다.</p>
          {lv.flpopYoy !== null && <div style={boxS}>유동인구 지수는 길 위의 사람만 세어 오피스 건물 안 인구가 적게 잡힙니다. 감소 폭보다 방향을 참고하세요.</div>}
          <Take text={`이 숫자는 이 ${unitWord} 같은 업종 점포들의 평균이라 내 가게의 매출이 아닙니다.${lv.yoyTotal !== null ? ` ${unitWord} 총매출은 전년 동기 대비 ${lv.yoyTotal > 0 ? "+" : ""}${lv.yoyTotal.toFixed(1)}%입니다.` : ""} '내 가게 점검'에 월 매출을 기록해 ${unitWord} 흐름과 견주면 내 가게가 앞서는지 뒤처지는지 감을 잡을 수 있습니다. 시간대별 매출 구성과 경쟁 환경을 함께 확인하세요.`} />
          <div style={footS}><b style={{ color: C.ink }}>출처</b> 서울시 상권분석서비스(추정매출·점포·길단위인구-상권) {lv.quarterLabel}. 추정매출은 카드 결제 기반 평균이며 매출이 큰 점포가 평균을 끌어올릴 수 있습니다.</div>
        </Page>
      )}

      {sl && (
        <Page n={no("slots")} total={total}>
          <Head eyebrowText="시간대별 수요" title={sl.title} text={sl.text} />
          <Fig title="시간대별 비중 (%)" note="반올림 전 각 계열의 합은 100%입니다. 비교 평균은 같은 업종의 매출액 가중 평균입니다. 유동인구와 매출은 다른 집계라 비중의 차이가 구매 전환율을 뜻하지 않습니다."
            legend={[[C.accent, `이 ${unitWord} 매출 비중`], [C.slate, `비교 ${unitWord} 평균 매출 비중`], ...(sl.hasFloating ? ([[C.teal, `이 ${unitWord} 유동인구 비중`]] as [string, string][]) : [])]}>
            <SlotsChart s={sl} />
          </Fig>
          {sl.ages && (
            <div className="irp-cols">
              <Fig title="직장인구와 매출의 연령 구성 (%)" note="10대는 값이 작아 뺐습니다. 직장인구와 카드 결제 고객은 모집단이 다릅니다." legend={[[C.teal, `${unitWord} 안 직장인구`], [C.accent, "카드 매출"]]}><AgeChart ages={sl.ages} /></Fig>
              <div className="irp-tiles" style={{ gridTemplateColumns: "1fr" }}>
                {sl.workers && <TileBox label={`${unitWord} 안 직장인구`} value={`${sl.workers.total.toLocaleString("ko-KR")}명`} note={sl.workers.median !== null && sl.workers.ratio !== null ? `비교 ${unitWord} 중앙값 ${sl.workers.median.toLocaleString("ko-KR")}명 · ${sl.workers.ratio.toFixed(1)}배` : ""} />}
                {sl.workers?.age3040 != null && <TileBox label="직장인구 중 30·40대" value={`${sl.workers.age3040.toFixed(1)}%`} note={sl.salesAge3040 !== null ? `매출에서 30·40대는 ${sl.salesAge3040.toFixed(1)}%` : ""} />}
                {sl.salesAge50 !== null && <TileBox label="매출 중 50대 이상" value={`${sl.salesAge50.toFixed(1)}%`} note={sl.workAge50 !== null ? `직장인구 중 50대 이상은 ${sl.workAge50.toFixed(1)}%` : ""} />}
              </div>
            </div>
          )}
          <Take text={sl.take} />
          <div style={footS}><b style={{ color: C.ink }}>출처</b> 서울시 상권분석서비스(추정매출 시간대·연령대, 직장인구, 길단위인구-상권). 직장인구는 상권 영역 안 값이며 밖의 배후지는 포함하지 않습니다.</div>
        </Page>
      )}

      {hasChurn && (
        <Page n={no("comp")} total={total}>
          <Head eyebrowText="주변 경쟁·폐업" title={cp ? cp.title : "점포당 매출이 높은 상권의 특징"} text={cp?.text} />
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
          {cp && <Take text={cp.take} />}
          <div style={footS}><b style={{ color: C.ink }}>출처</b> 소상공인 상가(상권)정보 · 서울시 자치구별 인허가(LOCALDATA) · 서울시 상권분석서비스. 좌표 없는 인허가는 반경 계산에서 제외했고, 거리는 직선거리입니다.</div>
        </Page>
      )}

      {/* 종합 쪽 — 상권 보고서와 같은 틀: 번호 상자(검은 제목 + 회색 근거) 다음에 확인 목록 */}
      <Page n={no("summary")} total={total} className="irp-summary-page">
        <section className="irp-result-section">
          <Head splitSummary eyebrowText="★ 종합·확인사항" title={r.summaryTitle} />
          <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
            {r.findings.map((f, i) => (
              <li key={f.title} className="irp-result-item" style={{ ...boxS, display: "grid", gridTemplateColumns: "24px minmax(0,1fr)", gap: 8, fontSize: RF.section, fontWeight: 700, color: C.ink, lineHeight: 1.5 }}>
                <b>{i + 1}</b><span>{f.title}<span style={{ display: "block", marginTop: 2, fontSize: RF.body, fontWeight: 500, color: C.mute, lineHeight: 1.5 }}>{f.body}</span></span>
              </li>
            ))}
          </ol>
          {r.findings.length === 0 && <p>종합할 수 있는 자료가 부족합니다.</p>}
        </section>
        {r.checklist.length > 0 && (
          <div>
            <h3 style={{ margin: "0 0 8px", fontSize: RF.section }}>이번 달 해볼 것</h3>
            <ul className="irp-checklist" style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
              {r.checklist.map((c) => (<li key={c} style={{ display: "grid", gridTemplateColumns: "20px 1fr", gap: 8, fontSize: RF.body }}><span style={{ width: 13, height: 13, border: `1.5px solid ${C.accent}`, marginTop: 5 }} />{c}</li>))}
            </ul>
          </div>
        )}
      </Page>

      {/* 마지막 쪽 — 상권 보고서와 같은 '자료·계산 기준' */}
      <Page n={no("basis")} total={total} className="irp-appendix">
        <Head eyebrowText="자료·계산 기준" title="자료마다 집계 범위와 기준기간이 다릅니다" text={`작성 ${date} · 작성일과 자료 기준일은 다릅니다.`} />
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead><tr>{["지표", "기준기간", "집계 범위·참고사항"].map((v) => <th key={v} style={{ textAlign: "left", padding: 6, borderBottom: `1px solid ${C.line}` }}>{v}</th>)}</tr></thead>
          <tbody>{r.dataBasis.map((d) => <tr key={d.label}><td style={{ padding: 6 }}>{d.label}</td><td style={{ padding: 6 }}>{d.period}</td><td style={{ padding: 6 }}>{d.basis}</td></tr>)}</tbody>
        </table>
        <div className="irp-methods">
          <p><b>월평균 추정매출</b> 분기 추정매출 합 ÷ 점포 수 합 ÷ 3. 두 값이 모두 확인된 업종만 사용.</p>
          <p><b>개폐업률</b> 연간: 최근 4분기 합 ÷ 평균 점포 수(4분기 자료가 있는 집단, 평균 10곳 미만 제외).</p>
          <p><b>반경 인허가 개폐업</b> 이 매장 중심 직선거리 안 같은 업종 인허가의 연도별 개업·폐업 수. 좌표 없는 인허가는 제외.</p>
          <p><b>시간대 비교</b> 같은 지역 단위·업종의 매출액 가중 평균. 유동인구와의 비중 차이는 구매 전환율이 아님.</p>
        </div>
        <div style={footS}><b>데이터 한계</b> {r.limits.join(" ")}<br /><b>출처</b> {r.sources.join(" · ")}.</div>
      </Page>
    </ReportDateContext.Provider>
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
    <ReportFrame downloadTitle={store ? reportFilename(store.trdar?.name ?? store.dong, store.category.scls || store.category.mcls) : undefined} title="상권분석 보고서 · 자영업자용(내 매장)" canPrint={!pending && Boolean(hasAny)} onClose={onClose}>
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
