import {slotsPageTitle,locationPageTitle,summaryPageTitle} from "../../lib/reportPageTitles";
import { ReportAreaMap } from "./ReportAreaMap";
import { RF } from "../stores/report/reportTypography";
import { reportFilename } from "../../lib/reportFilename";
import { ReportHeadline } from "../stores/report/ReportHeadline";
import { areaFeatureLines, areaStrategies, founderFieldChecks, strategyHeadline } from "../../lib/areaReportTips";
import { summaryHeadline, summaryInsights } from "../../lib/summaryInsights";
import { useQuery } from "@tanstack/react-query";
import { apiClient, type AreaCharacter, type ReportDetail, type ReportExtras, type FoodUnitStoresResponse } from "../../lib/apiClient";
import { ReportLocationVisuals, ReportCharacter, ReportCompetitionPage, ReportDemandPage, ReportStrategies } from "./ReportExtras";
import { useMemo } from "react";
import { ReportLead } from "../stores/report/ReportLead";
import { areaReportLead } from "../../lib/reportLead";
import { ReportTriad } from "../stores/report/ReportTriad";
import { buildTriad } from "../../lib/reportTriad";
import { sampleNote } from "../../lib/insightReport";
import { buildAreaReport, type AreaReport, type PeerPoint } from "../../lib/areaReport";
import type { Mode } from "../../lib/mode";
import type { FoodBubble } from "../../lib/apiClient";
import { useFoodBubbles, useFoodCompare, useUnitOverview, useAreaCharacter, useReportExtras } from "../food/useFood";
import { ReportIndustryPage, ReportCompetitionSurvivalPage } from "../stores/report/ReportExtraPages";
import { AreaSlotsChart, HistogramChart, TrendChart } from "../stores/report/ReportCharts";
import { C } from "../stores/report/reportColors";
import { boxS, eyebrow, footS, h2 } from "../stores/report/reportStyles";
import { Fig, Head, Page, ReportFrame, Take, TileBox } from "../stores/report/ReportShell";
import { ReportDateContext } from "../stores/report/reportDate";

const today = () => new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD
const peers = (bubbles: FoodBubble[] | undefined): PeerPoint[] => (bubbles ?? []).map((b) => ({ code: b.code, value: b.value, size: b.size }));

interface Props {
  level: "dong" | "trdar";
  code: string;
  name: string;
  type?: string | null;
  svc: string | null;
  scls: string | null;
  /** 읽는 사람 — 자영업자(매출 증대·기회 포착) / 예비 창업자(창업 전 점검) */
  mode: Mode;
  onClose: () => void;
}

function Pages({ r, date, detail, stores, storesFailed, character, marketTypeName, extras, unitName }: { r: AreaReport; date: string; detail?: ReportDetail; stores?: FoodUnitStoresResponse; storesFailed: boolean; character?: AreaCharacter | null; marketTypeName?: string | null; extras?: ReportExtras; unitName: string }) {
  const lv = r.level, sl = r.slots, st = r.stability, lo = r.location;
  const hasStability = st !== null || !!extras;
  // 전략은 자료 기준·계산 방법 바로 앞 쪽에 모은다
  const strategies = areaStrategies(r, character, detail, stores);
  const insights = summaryInsights({ report: r, character, detail, stores, extras });
  const featureLines = areaFeatureLines(r, detail, stores);
  const results = [...r.findings.filter(f=>!(/매출 비중/.test(f.title)&&featureLines.some(l=>l.includes("매출이 가장 몰리는")))).map(f=>f.title), ...featureLines].filter((line,i,all)=>all.indexOf(line)===i);
  const priority = (line:string) => /매출.*(증감|감소|증가|전년)|총매출/.test(line) ? 0 : /점포당|중앙값/.test(line) ? 1 : /시간|시\(/.test(line) ? 2 : /폐업|경쟁|업종/.test(line) ? 3 : /연령|평일|주말/.test(line) ? 4 : 5;
  results.sort((a,b)=>priority(a)-priority(b));
  const checklist = r.lens.mode === "founder" ? [...r.checklist.filter((item) => !/현장|유동|실제 임대료|메뉴·가격대|문을 닫은/.test(item)), ...founderFieldChecks].filter(item=>!item.includes("최근 상호가 바뀐")) : r.checklist.filter(item=>!item.includes("최근 상호가 바뀐"));
  const pages = ["cover", lv && "level", sl && "slots", "demand", extras && "industries", "competitors", hasStability && "stab", "location", "summary", "basis"].filter(Boolean) as string[];
  const total = pages.length;
  const no = (k: string) => pages.indexOf(k) + 1;
  return (
    <ReportDateContext.Provider value={date}>
      <Page n={no("cover")} total={total} className="irp-cover-page">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={eyebrow}>{r.lens.eyebrow} · {lv?.quarterLabel ?? "최근 분기"} 기준</div>
          <ReportHeadline title={r.headline} />
        </div>
        <ReportCharacter character={character} marketTypeName={marketTypeName} lines={[]} profile={r.profile} detail={detail} />

        {r.tiles.length > 0 && <div className="irp-tiles irp-cover-metrics">{r.tiles.map((t) => <TileBox key={t.label} {...t} label={t.label.startsWith("총매출 증감") ? "총매출 증감 · 전년 동기 대비" : t.label.startsWith("같은 업종 분기 폐업률") ? `분기 폐업률 · ${r.stability?.churn?.quarterLabel ?? "최근 분기"}` : t.label} />)}</div>}
        <ReportLead compact lead={areaReportLead({level:no("level"),slots:no("slots"),demand:no("demand"),industries:no("industries"),competitors:no("competitors"),stability:no("stab"),location:no("location"),summary:no("summary"),basis:no("basis")})}/>
        <ReportTriad hideTodo subdued triad={buildTriad({mode:r.lens.mode,tiles:[],cautions:[],checklist:checklist.slice(0,2),sampleNote:lv?.sampleStatus === "too_few" ? sampleNote(lv.sampleStores,"지역") : null})}/>

      </Page>
      {lv && (
        <Page n={no("level")} total={total}>
          <Head eyebrowText="매출 흐름" title={`점포당 월평균 추정매출은 비교 ${r.subtitle.includes("행정동 단위") ? "행정동" : "상권"} 중앙값의 ${lv.ratio.toFixed(1)}배`} text={lv.text} />
          <div className="irp-cols">
            <Fig title={`${lv.peerCount}개 비교 지역 중 어디에 있나`} note="지역별 점포당 월평균 추정매출 분포(만원). 점포가 적은 지역도 포함돼 값이 크게 흔들릴 수 있습니다."><HistogramChart level={lv} /></Fig>
            <Fig title="최근 분기별 점포당 월평균 추정매출" note={`단위 만원.${lv.storesFrom !== null && lv.storesNow !== null ? ` 서울시 집계 점포 수는 ${lv.storesFrom}곳에서 ${lv.storesNow}곳으로 바뀌었습니다.` : ""}`}><TrendChart level={lv} /></Fig>
          </div>
          <div className="irp-tiles">
            {lv.yoyTotal !== null && <TileBox label="총매출 전년 동기 대비" value={`${lv.yoyTotal > 0 ? "+" : ""}${lv.yoyTotal.toFixed(1)}%`} note="점포 수 변화가 함께 반영" tone={lv.yoyTotal < 0 ? "neg" : "plain"} />}
            {lv.flpopYoy !== null && <TileBox label="유동인구 지수 전년 동기 대비" value={`${lv.flpopYoy > 0 ? "+" : ""}${lv.flpopYoy.toFixed(1)}%`} note="길 단위로 배분한 추정치" tone={lv.flpopYoy < 0 ? "neg" : "plain"} />}
          </div>
          <p style={{ margin: 0, fontSize: 12, color: C.mute }}>비교 범위: {lv.peerLabel} · 같은 업종의 유효값 {lv.peerCount}곳(소규모 지역 포함). 순위 중 점포 20곳 이상 비교는 별도 기준입니다.</p>
          {lv.yoyPerStore !== null && lv.sampleStatus !== "too_few" && <TileBox label="점포당 월평균 추정매출 전년 동기 대비" value={`${lv.yoyPerStore > 0 ? "+" : ""}${lv.yoyPerStore.toFixed(1)}%`} note="같은 분기끼리 비교 · 개별 점포의 매출 변화가 아님" tone={lv.yoyPerStore < 0 ? "neg" : "plain"} />}
          <Take label={r.lens.takeLabel} text={r.lens.levelTake} />
          <div style={footS}><b style={{ color: C.ink }}>출처</b> 서울시 상권분석서비스(추정매출·점포·길단위인구-상권) {lv.quarterLabel}. 추정매출은 카드 결제 기반 평균이며 매출이 큰 점포가 평균을 끌어올릴 수 있습니다.</div>
        </Page>
      )}

      {sl && (
        <Page n={no("slots")} total={total}>
          <Head eyebrowText="시간대별 수요" title={slotsPageTitle(sl)} text={sl.text} />
          <Fig title="시간대별 비중 (%)" note="반올림 전 각 계열의 합은 100%입니다. 비교 평균은 같은 업종의 매출액 가중 평균이며 분석 지역 자신도 포함합니다. 유동인구와 매출은 다른 집계라 비중의 차이가 구매 전환율을 뜻하지 않습니다."
            legend={[[C.accent, "이 지역 매출 비중"], ...(sl.hasPilot ? ([[C.slate, `${sl.pilotLabel} 평균 매출 비중`]] as [string, string][]) : []), ...(sl.hasFloating ? ([[C.teal, "이 지역 유동인구 비중"]] as [string, string][]) : [])]}>
            <AreaSlotsChart s={sl} />
          </Fig>
          {sl.facts.length > 0 && <div className="irp-tiles">{sl.facts.map((f) => <TileBox key={f.label} label={f.label} value={f.value} note={f.note} />)}</div>}
          <Take label={r.lens.takeLabel} text={sl.take} />
          <div style={footS}><b style={{ color: C.ink }}>출처</b> 서울시 상권분석서비스(추정매출 시간대, 길단위인구, 직장·상주인구, 집객시설). 직장·상주인구는 상권 영역 안 값이며 밖의 배후지는 포함하지 않습니다.</div>
        </Page>
      )}

      <ReportDemandPage n={no("demand")} total={total} detail={detail} />
      {extras && <ReportIndustryPage n={no("industries")} total={total} extras={extras} unitName={unitName} takeLabel={r.lens.takeLabel} />}
      <ReportCompetitionPage n={no("competitors")} total={total} stores={stores} failed={storesFailed} map={extras?.map?.kind === "stores" ? <ReportAreaMap data={extras.map} name={unitName} categoryNames={stores?.category_mix.map(x=>x.name)}/> : undefined} />
      {hasStability && <ReportCompetitionSurvivalPage n={no("stab")} total={total} extras={extras} stability={st}/>}
      <Page n={no("location")} total={total} className="irp-location-page">
        <Head eyebrowText="입지·주변 시설" title={locationPageTitle(character)}/>
        <ReportLocationVisuals character={character} marketTypeName={marketTypeName} map={(extras?.facility_map ?? extras?.map)?.kind === "facilities" ? <ReportAreaMap data={(extras?.facility_map ?? extras?.map)!} name={unitName}/> : undefined}/>
        {lo && <div className="irp-tiles">{lo.facts.filter(f => !character || (!f.label.includes("지하철") && !f.label.includes("버스"))).map(f=><TileBox key={f.label} label={f.label} value={f.value} note={f.note}/>)}</div>}
        {lo && <p style={{fontSize:RF.caption,color:C.mute,margin:0}}>소규모 상가 참고값 · 선택 지역의 실제 계약 임대료·공실률과 다를 수 있습니다.</p>}
      </Page>

      <Page n={no("summary")} total={total} className="irp-summary-page">
        <section className="irp-result-section">
          <Head splitSummary eyebrowText="★ 종합·창업전략" title={(insights.length >= 2 ? summaryHeadline({ report: r, character, extras }, r.lens.mode) : null) ?? summaryPageTitle(r)}/>
          {/* 인사이트가 있으면 번호 상자(검은 제목 + 회색 근거·확인할 일), 자료가 없으면 예전처럼 핵심 결과 목록을 쓴다 */}
          <ol style={{margin:0,padding:0,listStyle:"none",display:"grid",gap:8}}>
            {insights.length
              ? insights.map((it,i)=><li key={it.key} className="irp-result-item" style={{...boxS,display:"grid",gridTemplateColumns:"24px minmax(0,1fr)",gap:8,fontSize:RF.section,fontWeight:700,color:C.ink,lineHeight:1.5}}><b>{i+1}</b><span>{it.title}{it.detail&&<span style={{display:"block",marginTop:2,fontSize:RF.body,fontWeight:500,color:C.mute,lineHeight:1.5}}>{it.detail}</span>}</span></li>)
              : results.map((line,i)=><li key={line} className="irp-result-item" style={{...boxS,display:"grid",gridTemplateColumns:"24px minmax(0,1fr)",gap:8,fontSize:RF.section,fontWeight:700,color:C.ink,lineHeight:1.6}}><b>{i+1}</b><span>{line}</span></li>)}
          </ol>
          {!insights.length&&!results.length&&<p>종합할 수 있는 자료가 부족합니다.</p>}
        </section>
        {strategies.length > 0 && <section className="irp-strategy-section">
          <h2 style={h2}>{strategyHeadline(strategies)}</h2>
          <ReportStrategies title="" tips={strategies}/>
          <p style={{margin:"8px 0 0",fontSize: RF.caption,color:C.mute}}>영업시간·메뉴·인력·후보 점포를 정할 때 함께 검토하고, 현장에서 직접 확인하세요.</p>
        </section>}
          <div>
            <h3 style={{ margin: "0 0 8px", fontSize: RF.section }}>{r.lens.checklistTitle}</h3>
            <ul className="irp-checklist" style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
              {checklist.map((c) => (<li key={c} style={{ display: "grid", gridTemplateColumns: "20px 1fr", gap: 8, fontSize: RF.body }}><span style={{ width: 13, height: 13, border: `1.5px solid ${C.accent}`, marginTop: 5 }} />{c}</li>))}
            </ul>
          </div>
      </Page>
      <Page n={no("basis")} total={total} className="irp-appendix">
        <Head eyebrowText="자료·계산 기준" title="자료마다 집계 범위와 기준기간이 다릅니다" text={`작성 ${date} · 고객 구성 ${detail?.period ?? "기준기간 미확인"}. 작성일과 자료 기준일은 다릅니다.`}/>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead><tr>{["지표", "기준기간", "집계 범위·참고사항"].map((v) => <th key={v} style={{ textAlign: "left", padding: 6, borderBottom: `1px solid ${C.line}` }}>{v}</th>)}</tr></thead>
          <tbody>{r.dataBasis.map((d) => <tr key={d.label}><td style={{ padding: 6 }}>{d.label}</td><td style={{ padding: 6 }}>{d.period}</td><td style={{ padding: 6 }}>{d.basis}</td></tr>)}</tbody>
        </table>
        <div className="irp-methods">
          <p><b>월평균 추정매출</b> 분기 추정매출 합 ÷ 점포 수 합 ÷ 3. 두 값이 모두 확인된 업종만 사용.</p>
          <p><b>개폐업률</b> 분기: 개업·폐업 수 ÷ 점포 수(비교 시 3곳 미만 제외). 연간: 최근 4분기 합 ÷ 평균 점포 수(4분기 자료가 있는 집단).</p>
          <p><b>점포 수 변동</b> 8분기 변화율 절댓값의 평균(평균 10곳 미만 제외). 증감은 첫·마지막 분기 비교.</p>
          <p><b>시간대 비교</b> 같은 지역 단위·업종의 매출액 가중 평균. 유동인구와의 비중 차이는 구매 전환율이 아님.</p>
        </div>
        <div style={footS}><b>데이터 한계</b> {r.limits.join(" ")}<br /><b>출처</b> {r.sources.join(" · ")}.</div>
      </Page>

    </ReportDateContext.Provider>
  );
}

/** '상권 인사이트 리포트(예비 창업자용)' — 상권·행정동 × 업종 하나를 내용별 페이지로 읽는다. 자료는 종합분석·입지 비교가 쓰는 조회를 같은 키로 재사용한다. */
export function AreaReportModal({ level, code, name, type = null, svc, scls, mode, onClose }: Props) {
  const stores = useQuery({ queryKey: ["report-unit-stores", level, code, svc, scls], queryFn: () => apiClient.getFoodUnitStores(level, code, svc, scls, 0, "distance", 8), staleTime: 10 * 60 * 1000 });
  const cmp = useFoodCompare(level, [code], svc, scls);
  const ov = useUnitOverview(level, code, svc, scls);
  const ch = useAreaCharacter(level, code, svc, scls);
  const ex = useReportExtras(level, code, svc, scls);
  const bPer = useFoodBubbles(level, "per_store_month", svc, scls);
  const bClose = useFoodBubbles(level, "close_rate", svc, scls);
  const bOpen = useFoodBubbles(level, "open_rate", svc, scls);
  const bFrc = useFoodBubbles(level, "frc_share", svc, scls);

  const pending = cmp.isPending || ov.isPending || ch.isPending || ex.isPending || bPer.isPending || bClose.isPending || bOpen.isPending || bFrc.isPending || stores.isPending;
  const report = useMemo(() => {
    if (!cmp.data) return null;
    return buildAreaReport({
      unit: { level, code, name, type },
      scope: cmp.data.scope.sales_label,
      rows: cmp.data.rows,
      overview: ov.data ?? null,
      character: ch.data ?? null,
      peers: { perStore: peers(bPer.data?.bubbles), close: peers(bClose.data?.bubbles), open: peers(bOpen.data?.bubbles), frc: peers(bFrc.data?.bubbles) },
      peerQuarter: bClose.data?.quarter ?? null,
      mode,
      today: today(),
    });
  }, [cmp.data, ov.data, ch.data, bPer.data, bClose.data, bOpen.data, bFrc.data, level, code, name, type, mode]);
  const hasAny = report !== null && (report.level || report.slots || report.stability || report.location);
  // 일부 조회만 실패했을 때 그 쪽이 조용히 빠지면 '자료 없음'으로 오해하므로 실패한 자료를 밝힌다
  const partialFailures = [ov.isError && "시간대·유동인구", ch.isError && "상권 유형·입지", (bPer.isError || bClose.isError || bOpen.isError || bFrc.isError) && "비교 지역 분포", ex.isError && "업종별 비교·영업 기간", stores.isError && "주변 매장", cmp.isError && "핵심 지표"].filter(Boolean) as string[];

  return (
    <ReportFrame downloadTitle={reportFilename(name, cmp.data?.scope.stores_label)} title={`상권분석 보고서 · ${mode === "owner" ? "자영업자용" : "예비 창업자용"}`} canPrint={!pending && partialFailures.length === 0 && Boolean(hasAny)} onClose={onClose}>
      {pending && <div style={{ ...boxS, background: C.paper }}>리포트 자료를 불러오는 중...</div>}
      {!pending && partialFailures.length > 0 && (
        <div style={{ ...boxS, background: C.paper, color: C.bad }}>
          다음 자료를 불러오지 못해 해당 내용이 이 리포트에 빠져 있습니다: {partialFailures.join(" · ")}. 자료가 없는 것이 아니라 조회 실패입니다. 다시 조회한 뒤 인쇄해 주세요. <button type="button" onClick={() => { [cmp, ov, ch, ex, stores, bPer, bClose, bOpen, bFrc].forEach(q => { if (q.isError) void q.refetch(); }); }}>실패한 자료 다시 조회</button>
        </div>
      )}
      {!pending && cmp.isError && <div style={{ ...boxS, background: C.paper, color: C.bad }}>지표를 불러오지 못했습니다: {cmp.error.message}</div>}
      {!pending && report && !hasAny && <div style={{ ...boxS, background: C.paper }}>이 지역·업종은 매출·점포 자료가 부족해 리포트를 만들 수 없습니다. 자료가 없는 것이지 0이라는 뜻이 아닙니다.</div>}
      {!pending && report && hasAny && <Pages r={report} date={today()} detail={ov.data?.report_detail} stores={stores.data} storesFailed={stores.isError} character={ch.data ?? null} marketTypeName={level === "trdar" ? type : null} extras={ex.data} unitName={name} />}
    </ReportFrame>
  );
}
