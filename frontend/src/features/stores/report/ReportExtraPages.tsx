import type { ReactNode } from "react";
import type { ReportExtras } from "../../../lib/apiClient";
import { industryLines, industryTake, licenseNotice, NO_DATA, pctText, survivalTake, yearsText } from "../../../lib/reportExtras";
import { C } from "./reportColors";
import { Head, Page, Take, TileBox } from "./ReportShell";
import { boxS, footS } from "./reportStyles";
import { RF } from "./reportTypography";

const th = { textAlign: "right", padding: "6px 8px", fontSize: RF.caption, fontWeight: 600, color: C.mute, borderBottom: `1px solid ${C.line}`, verticalAlign: "bottom" } as const;
const td = { textAlign: "right", padding: "7px 8px", fontSize: RF.body, borderBottom: `1px solid ${C.line}`, fontVariantNumeric: "tabular-nums" } as const;
const sub = { margin: "0 0 6px", fontSize: RF.section } as const;
const months = (m: number | null) => (m === null ? NO_DATA : `${Math.round(m).toLocaleString("ko-KR")}개월`);

/** 외식 업종별 비교표 — 같은 지역·같은 분기의 서울시 외식 10개 업종. 순위·점수 없이 표준 업종 순서로 놓는다. */
export function ReportIndustryPage({ n, total, extras, unitName, takeLabel }: { n: number; total: number; extras: ReportExtras; unitName: string; takeLabel: string }) {
  const ind = extras.industry;
  const lines = ind.status === "ok" ? industryLines(ind) : [];
  const notes = lines.filter((l) => l.note);
  return (
    <Page n={n} total={total}>
      <Head eyebrowText="인사이트 · 업종 비교" title={`${unitName} 외식 업종별 비교`}
        text={ind.status === "ok" ? `${ind.quarter_label} 기준으로 서울시 외식 10개 업종을 같은 지역에서 나란히 놓았습니다. 업종을 고르는 순서나 추천이 아니라, 업종마다 현실이 어떻게 다른지 보는 표입니다.` : (ind.message ?? NO_DATA)} />
      {ind.status === "ok" && (
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <colgroup><col style={{ width: "22%" }} /><col style={{ width: "11%" }} /><col style={{ width: "19%" }} /><col style={{ width: "15%" }} /><col style={{ width: "18%" }} /><col style={{ width: "15%" }} /></colgroup>
          <thead><tr>
            <th style={{ ...th, textAlign: "left" }}>업종</th><th style={th}>점포 수</th><th style={th}>점포당 월평균 추정매출</th><th style={th}>객단가</th><th style={th}>점포당 하루 결제 건수</th><th style={th}>분기 폐업률</th>
          </tr></thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.svc} style={l.selected ? { background: C.accentSoft, fontWeight: 800 } : undefined}>
                <td style={{ ...td, textAlign: "left" }}>{l.svc}{l.selected ? " ●" : ""}{l.note ? " ※" : ""}</td>
                <td style={td}>{l.stores}</td><td style={td}>{l.perStore}</td><td style={td}>{l.ticket}</td><td style={td}>{l.daily}</td><td style={td}>{l.close}</td>
              </tr>
            ))}
            {ind.total && (
              <tr style={{ background: C.soft, fontWeight: 800 }}>
                <td style={{ ...td, textAlign: "left" }}>외식 전체</td><td style={td}>{ind.total.stores === null ? NO_DATA : `${Math.round(ind.total.stores).toLocaleString("ko-KR")}곳`}</td>
                <td style={td}>{ind.total.per_store_month === null ? NO_DATA : `${Math.round(ind.total.per_store_month / 1e4).toLocaleString("ko-KR")}만원`}</td><td style={td}>—</td><td style={td}>—</td><td style={td}>—</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
      {ind.status === "ok" && (
        <div style={{ ...boxS, fontSize: RF.caption }}>
          {lines.some((l) => l.selected) && <div>● 이 보고서의 기준 업종</div>}
          {notes.map((l) => <div key={l.svc}>※ {l.svc}: {l.note}</div>)}
          <div>분기 폐업률은 최근 분기에 문을 닫은 점포 ÷ 점포 수입니다. 값이 없는 칸은 0이 아니라 자료가 없다는 뜻입니다.</div>
        </div>
      )}
      <Take label={takeLabel} text={industryTake(extras)} />
      <div style={footS}><b style={{ color: C.ink }}>출처</b> {ind.source ?? "서울시 상권분석서비스"} {ind.quarter_label ?? ""}. {ind.basis ?? ""}</div>
    </Page>
  );
}

function Bars({ bands }: { bands: { label: string; count: number; pct: number | null }[] }) {
  return (
    <div style={{ display: "grid", gap: 6 }} role="img" aria-label="영업 중인 가게의 업력 분포">
      {bands.map((b) => (
        <div key={b.label} style={{ display: "grid", gridTemplateColumns: "84px 1fr 120px", gap: 10, alignItems: "center", fontSize: RF.body }}>
          <span>{b.label}</span>
          <span style={{ background: C.soft, height: 16 }}><span style={{ display: "block", height: 16, width: `${Math.max(0, Math.min(100, b.pct ?? 0))}%`, background: C.teal }} /></span>
          <b style={{ textAlign: "right" }}>{pctText(b.pct)} <span style={{ fontWeight: 400, color: C.mute, fontSize: RF.caption }}>({b.count.toLocaleString("ko-KR")}곳)</span></b>
        </div>
      ))}
    </div>
  );
}

const Block = ({ title, children }: { title: string; children: ReactNode }) => (<div><h3 style={sub}>{title}</h3>{children}</div>);

/** 영업 기간·생존 — 서울시 상권변화지표(행정동 단위)와 인허가 기준 업력·폐업 가게의 영업 기간·3년 내 폐업 비율. */
export function ReportSurvivalPage({ n, total, extras, takeLabel }: { n: number; total: number; extras: ReportExtras; takeLabel: string }) {
  const ci = extras.change_index, lic = extras.license;
  const notice = licenseNotice(lic);
  const dongNote = ci ? `${ci.scope === "소속 행정동" ? "소속 행정동 " : ""}${ci.dong_name} · 전 업종` : "";
  return (
    <Page n={n} total={total}>
      <Head eyebrowText="인사이트 · 영업 기간·생존" title="가게들은 얼마나 오래 버텼을까요"
        text="서울시 상권변화지표와 인허가 이력으로 영업 기간을 봅니다. 과거 통계이며 특정 가게의 폐업 가능성이나 창업 성공 가능성이 아닙니다." />
      <Block title={ci ? `서울시 상권변화지표 · ${ci.quarter_label ?? ""}` : "서울시 상권변화지표"}>
        {ci ? (
          <>
            <div className="irp-tiles" style={{ gridTemplateColumns: "repeat(3,minmax(0,1fr))" }}>
              <TileBox label="상권변화지표 단계" value={ci.stage ?? NO_DATA} note={dongNote} />
              <TileBox label="영업 중 점포 평균 영업" value={months(ci.open_months)} note={ci.seoul_open_months === null ? "서울시 평균 자료 없음" : `서울시 평균 ${months(ci.seoul_open_months)}`} />
              <TileBox label="폐업 점포 평균 영업" value={months(ci.close_months)} note={ci.seoul_close_months === null ? "서울시 평균 자료 없음" : `서울시 평균 ${months(ci.seoul_close_months)}`} />
            </div>
            <p style={{ margin: "6px 0 0", fontSize: RF.caption, color: C.mute }}>{ci.note}{ci.scope === "소속 행정동" ? " 이 상권에는 같은 표가 없어 소속 행정동 값을 보여 드립니다." : ""}</p>
          </>
        ) : <div style={boxS}>상권변화지표: {NO_DATA} — 이 지역의 서울시 상권변화지표가 없습니다.</div>}
      </Block>
      <Block title={`인허가 기준 · ${lic.scope_label}${lic.as_of ? ` · ${lic.as_of} 수집` : ""}`}>
        {notice && <div style={{ ...boxS, marginBottom: 8 }}>{NO_DATA} — {notice}</div>}
        {lic.status === "ok" && lic.active && (
          <>
            <div className="irp-tiles" style={{ gridTemplateColumns: "repeat(3,minmax(0,1fr))" }}>
              <TileBox label="영업 중 가게 업력(중앙값)" value={yearsText(lic.active.median_years)} note={lic.active.enough ? `영업 중 ${lic.active.count.toLocaleString("ko-KR")}곳 기준` : `영업 중 ${lic.active.count}곳 — 5곳 미만`} />
              <TileBox label="최근 5년 폐업 가게 영업 기간(중앙값)" value={lic.closed ? yearsText(lic.closed.median_years) : NO_DATA}
                note={lic.closed ? (lic.closed.enough ? `폐업 ${lic.closed.count.toLocaleString("ko-KR")}곳 기준` : `폐업 ${lic.closed.count}곳 — 5곳 미만`) : "폐업일자 없음"} />
              <TileBox label={`인허가 후 ${lic.cohort?.horizon_years ?? 3}년 내 폐업 비율`} value={lic.cohort?.status === "ok" && lic.cohort.rate !== null ? `${Math.round(lic.cohort.rate * 100)}%` : NO_DATA}
                note={lic.cohort?.status === "ok" ? `${lic.cohort.denominator.toLocaleString("ko-KR")}건 중 ${lic.cohort.numerator.toLocaleString("ko-KR")}건` : (lic.cohort?.message ?? "자료 부족")} />
            </div>
            {lic.active.bands.length > 0 && <div style={{ marginTop: 14 }}><h3 style={sub}>영업 중인 가게의 업력 분포</h3><Bars bands={lic.active.bands} /></div>}
            <p style={{ margin: "8px 0 0", fontSize: RF.caption, color: C.mute }}>
              {lic.short_lived_excluded ? `인허가일부터 폐업일까지 ${lic.short_lived_days}일 이하인 ${lic.short_lived_excluded.toLocaleString("ko-KR")}건은 팝업·임시 영업 등록으로 보고 폐업 가게의 영업 기간과 폐업 비율에서 뺐습니다. ` : ""}
              {lic.no_coord_pct != null ? `인허가의 약 ${lic.no_coord_pct}%는 좌표가 없어 경계 안 집계에서 빠집니다. ` : ""}3년 내 폐업 비율은 3년 관찰이 가능한 인허가 집단만 셉니다.
            </p>
          </>
        )}
      </Block>
      <Take label={takeLabel} text={survivalTake(extras)} />
      <div style={footS}><b style={{ color: C.ink }}>출처</b> 서울시 상권변화지표(상권분석서비스), {lic.source ?? "서울시 LOCALDATA 인허가"}. {extras.disclaimer}</div>
    </Page>
  );
}
