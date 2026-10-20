import { useMemo } from "react";
import { buildAreaReport, type AreaReport, type PeerPoint } from "../../lib/areaReport";
import type { FoodBubble } from "../../lib/apiClient";
import { useFoodBubbles, useFoodCompare, useUnitOverview, useAreaCharacter } from "../food/useFood";
import { AreaSlotsChart, HistogramChart, RateBullets, TrendChart } from "../stores/report/ReportCharts";
import { C } from "../stores/report/reportColors";
import { boxS, eyebrow, footS } from "../stores/report/reportStyles";
import { Fig, Head, Page, ReportFrame, Take, TileBox } from "../stores/report/ReportShell";

const today = () => new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD
const peers = (bubbles: FoodBubble[] | undefined): PeerPoint[] => (bubbles ?? []).map((b) => ({ code: b.code, value: b.value, size: b.size }));

interface Props {
  level: "dong" | "trdar";
  code: string;
  name: string;
  type?: string | null;
  svc: string | null;
  scls: string | null;
  onClose: () => void;
}

function Pages({ r, date }: { r: AreaReport; date: string }) {
  const lv = r.level, sl = r.slots, st = r.stability, lo = r.location;
  const hasStability = st !== null || lo !== null;
  const pages = ["cover", lv && "level", sl && "slots", hasStability && "stab"].filter(Boolean) as string[];
  const total = pages.length;
  const no = (k: string) => pages.indexOf(k) + 1;
  return (
    <>
      <Page n={no("cover")} total={total}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={eyebrow}>예비 창업자용 · {lv?.quarterLabel ?? "최근 분기"} 기준</div>
          <h1 style={{ fontSize: "clamp(26px,5vw,38px)", lineHeight: 1.25, fontWeight: 900, margin: 0, letterSpacing: "-.02em", textWrap: "balance" }}>{r.headline}</h1>
          <p style={{ margin: 0, color: C.mute, fontSize: 13 }}>{r.subtitle}<br />리포트 작성 {date}</p>
        </div>
        {r.tiles.length > 0 && <div className="irp-tiles">{r.tiles.map((t) => <TileBox key={t.label} {...t} />)}</div>}
        <div>
          {r.findings.map((f, i) => (
            <div key={f.title} style={{ display: "grid", gridTemplateColumns: "36px 1fr", gap: 12, padding: "14px 0", borderTop: `1px solid ${C.line}` }}>
              <div style={{ fontFamily: "ui-monospace,Menlo,Consolas,monospace", fontWeight: 600, fontSize: 20, color: C.accent }}>{i + 1}</div>
              <div><h3 style={{ margin: "0 0 2px", fontSize: 14 }}>{f.title}</h3><p style={{ margin: 0, color: C.mute, fontSize: 13 }}>{f.body}</p></div>
            </div>
          ))}
        </div>
        <div className="irp-cols">
          {r.profile.length > 0 && (
            <div>
              <h3 style={{ margin: "0 0 6px", fontSize: 14 }}>이 지역 프로필</h3>
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
                <tbody>{r.profile.map((p) => (<tr key={p.label}><th style={{ textAlign: "left", color: C.mute, fontWeight: 500, width: "38%", padding: "6px 10px 6px 0", borderBottom: `1px solid ${C.line}`, verticalAlign: "top" }}>{p.label}</th><td style={{ padding: "6px 0", borderBottom: `1px solid ${C.line}` }}>{p.value}</td></tr>))}</tbody>
              </table>
            </div>
          )}
          <div style={boxS}><strong style={{ color: C.ink }}>읽기 전에</strong><br />이 리포트의 매출은 한 가게의 실제 매출이 아니라, 이 지역 같은 업종 점포들의 카드 결제 기반 추정 평균입니다. 점수나 '창업 적합도'는 만들지 않았고, 원인을 단정하지 않고 관측된 차이와 가능한 해석만 적었습니다. 공개 통계로 만든 문서이며 특정 가게의 자료는 쓰지 않았습니다.</div>
        </div>
      </Page>

      {lv && (
        <Page n={no("level")} total={total}>
          <Head eyebrowText="인사이트 1 · 매출 수준과 흐름" title={`점포당 월평균 추정매출은 비교 ${r.subtitle.includes("행정동 단위") ? "행정동" : "상권"} 중앙값의 ${lv.ratio.toFixed(1)}배`} text={lv.text} />
          <div className="irp-cols">
            <Fig title={`${lv.peerCount}개 비교 지역 중 어디에 있나`} note="지역별 점포당 월평균 추정매출 분포(만원). 점포가 적은 지역도 포함돼 값이 크게 흔들릴 수 있습니다."><HistogramChart level={lv} /></Fig>
            <Fig title="최근 분기별 점포당 월평균 추정매출" note={`단위 만원.${lv.storesFrom !== null && lv.storesNow !== null ? ` 서울시 집계 점포 수는 ${lv.storesFrom}곳에서 ${lv.storesNow}곳으로 바뀌었습니다.` : ""}`}><TrendChart level={lv} /></Fig>
          </div>
          <div className="irp-tiles">
            {lv.yoyTotal !== null && <TileBox label="총매출 전년 동기 대비" value={`${lv.yoyTotal > 0 ? "+" : ""}${lv.yoyTotal.toFixed(1)}%`} note="점포 수 변화가 함께 반영" tone={lv.yoyTotal < 0 ? "neg" : "plain"} />}
            {lv.flpopYoy !== null && <TileBox label="유동인구 지수 전년 동기 대비" value={`${lv.flpopYoy > 0 ? "+" : ""}${lv.flpopYoy.toFixed(1)}%`} note="길 단위로 배분한 추정치" tone={lv.flpopYoy < 0 ? "neg" : "plain"} />}
          </div>
          <Take label="창업 전에 의미" text="점포당 추정매출이 높다는 것은 이 지역에 매출이 모인다는 뜻이고, 이익이 많이 남는다는 뜻은 아닙니다. 임대료·인건비·원가는 이 자료에 없습니다. 최근 흐름이 내려가는 중이라면 그 이유(점포 수 변화·유동인구·경쟁)를 현장에서 확인해 보고, 후보 지역은 '입지 비교'로 나란히 견줘 보세요." />
          <div style={footS}><b style={{ color: C.ink }}>출처</b> 서울시 상권분석서비스(추정매출·점포·길단위인구-상권) {lv.quarterLabel}. 추정매출은 카드 결제 기반 평균이며 매출이 큰 점포가 평균을 끌어올릴 수 있습니다.</div>
        </Page>
      )}

      {sl && (
        <Page n={no("slots")} total={total}>
          <Head eyebrowText="인사이트 2 · 언제, 누가 오는 지역인가" title={r.headline} text={sl.text} />
          <Fig title="시간대별 비중 (%)" note="각 계열의 합은 100%입니다. 유동인구와 매출은 다른 집계라 비중의 차이가 구매 전환율을 뜻하지 않습니다."
            legend={[[C.accent, "이 지역 매출 비중"], ...(sl.hasPilot ? ([[C.slate, `${sl.pilotLabel} 평균 매출 비중`]] as [string, string][]) : []), ...(sl.hasFloating ? ([[C.teal, "이 지역 유동인구 비중"]] as [string, string][]) : [])]}>
            <AreaSlotsChart s={sl} />
          </Fig>
          {sl.facts.length > 0 && <div className="irp-tiles">{sl.facts.map((f) => <TileBox key={f.label} label={f.label} value={f.value} note={f.note} />)}</div>}
          <Take label="창업 전에 의미" text={sl.take} />
          <div style={footS}><b style={{ color: C.ink }}>출처</b> 서울시 상권분석서비스(추정매출 시간대, 길단위인구, 직장·상주인구, 집객시설). 직장·상주인구는 상권 영역 안 값이며 밖의 배후지는 포함하지 않습니다.</div>
        </Page>
      )}

      {hasStability && (
        <Page n={no("stab")} total={total}>
          <Head eyebrowText="인사이트 3 · 안정성·경쟁과 입지" title={st?.churn?.closeRate != null ? "같은 업종 가게가 바뀌는 속도와 입지 여건" : "입지 여건"} text={st?.text} />
          <div className="irp-cols">
            {st?.churn && <Fig title="분기 개업률·폐업률 vs 비교 지역" note="최근 분기의 개업(폐업) 점포 ÷ 점포 수. 점포 3곳 미만 지역은 비교에서 뺍니다. 업종 변경·이전도 개폐업으로 잡힙니다."><RateBullets churn={st.churn} labels={{ close: "분기 폐업률", open: "분기 개업률" }} /></Fig>}
            {st && st.facts.length > 0 && <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{st.facts.map((f) => <TileBox key={f.label} label={f.label} value={f.value} note={f.note} />)}</div>}
          </div>
          {st && <Take label="창업 전에 의미" text={st.take} />}
          {lo && (
            <>
              <h3 style={{ margin: "4px 0 0", fontSize: 14 }}>입지 여건</h3>
              <div className="irp-tiles">{lo.facts.map((f) => <TileBox key={f.label} label={f.label} value={f.value} note={f.note} />)}</div>
              <p style={{ margin: 0, fontSize: 13, color: C.mute }}>{lo.text}</p>
              {(lo.strengths.length > 0 || lo.cautions.length > 0) && (
                <div className="irp-cols">
                  {lo.strengths.length > 0 && <div style={boxS}><strong style={{ color: C.ink }}>참고할 점</strong><ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{lo.strengths.map((s) => <li key={s}>{s}</li>)}</ul></div>}
                  {lo.cautions.length > 0 && <div style={boxS}><strong style={{ color: C.ink }}>주의할 점</strong><ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{lo.cautions.map((s) => <li key={s}>{s}</li>)}</ul></div>}
                </div>
              )}
            </>
          )}
          <div>
            <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>창업 전에 확인해 볼 것</h3>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
              {r.checklist.map((c) => (<li key={c} style={{ display: "grid", gridTemplateColumns: "20px 1fr", gap: 8, fontSize: 13.5 }}><span style={{ width: 13, height: 13, border: `1.5px solid ${C.accent}`, marginTop: 5 }} />{c}</li>))}
            </ul>
          </div>
          <div style={footS}>
            <b style={{ color: C.ink }}>데이터 한계</b> {r.limits.join(" ")}<br />
            <b style={{ color: C.ink }}>출처</b> {r.sources.join(" · ")}.
          </div>
        </Page>
      )}
    </>
  );
}

/** '상권 인사이트 리포트(예비 창업자용)' — 상권·행정동 × 업종 하나를 4쪽으로 읽는다. 자료는 종합분석·입지 비교가 쓰는 조회를 같은 키로 재사용한다. */
export function AreaReportModal({ level, code, name, type = null, svc, scls, onClose }: Props) {
  const cmp = useFoodCompare(level, [code], svc, scls);
  const ov = useUnitOverview(level, code, svc, scls);
  const ch = useAreaCharacter(level, code, svc, scls);
  const bPer = useFoodBubbles(level, "per_store_month", svc, scls);
  const bClose = useFoodBubbles(level, "close_rate", svc, scls);
  const bOpen = useFoodBubbles(level, "open_rate", svc, scls);
  const bFrc = useFoodBubbles(level, "frc_share", svc, scls);

  const pending = cmp.isPending || ov.isPending || bPer.isPending;
  const report = useMemo(() => {
    if (!cmp.data) return null;
    return buildAreaReport({
      unit: { level, code, name, type },
      scope: cmp.data.scope.sales_label,
      rows: cmp.data.rows,
      overview: ov.data ?? null,
      character: ch.data ?? null,
      peers: { perStore: peers(bPer.data?.bubbles), close: peers(bClose.data?.bubbles), open: peers(bOpen.data?.bubbles), frc: peers(bFrc.data?.bubbles) },
      today: today(),
    });
  }, [cmp.data, ov.data, ch.data, bPer.data, bClose.data, bOpen.data, bFrc.data, level, code, name, type]);
  const hasAny = report !== null && (report.level || report.slots || report.stability || report.location);

  return (
    <ReportFrame title="상권 인사이트 리포트 · 예비 창업자용" canPrint={Boolean(hasAny)} onClose={onClose}>
      {pending && <div style={{ ...boxS, background: C.paper }}>리포트 자료를 불러오는 중...</div>}
      {!pending && cmp.isError && <div style={{ ...boxS, background: C.paper, color: C.bad }}>지표를 불러오지 못했습니다: {cmp.error.message}</div>}
      {!pending && report && !hasAny && <div style={{ ...boxS, background: C.paper }}>이 지역·업종은 매출·점포 자료가 부족해 리포트를 만들 수 없습니다. 자료가 없는 것이지 0이라는 뜻이 아닙니다.</div>}
      {report && hasAny && <Pages r={report} date={today()} />}
    </ReportFrame>
  );
}
