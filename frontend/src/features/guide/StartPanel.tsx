import { useState } from "react";
import { Drawer } from "../../components/Drawer";
import type { FoodCategoriesResponse } from "../../lib/apiClient";
import type { Mode } from "../../lib/mode";
import type { MyStoreEntry } from "../../lib/monthlyCheck";
import { START_STEPS, stepsLine } from "../../lib/flow";
import { FS } from "../../lib/typography";

interface Props {
  mode: Mode;
  categories: FoodCategoriesResponse | undefined;
  /** 내 관심 지역에 저장한 곳 수 */
  interestCount: number;
  myStores: MyStoreEntry[];
  /** 예비 창업자 ① 지역·업종 미정 → 조건으로 후보 찾기 */
  onUndecided: () => void;
  /** ② 업종 확정 → 그 업종으로 조건 탐색 */
  onPickSvc: (svc: string) => void;
  /** ③ 관심 지역 확정 → 검색창 */
  onFocusSearch: () => void;
  onOpenInterest: () => void;
  /** 자영업자: 내 가게 찾기(검색창)·저장한 가게 열기 */
  onOpenStore: (storeId: string) => void;
  /** 보고서부터 — 지역을 고르는 화면(조건으로 찾기)으로 간다. 거기서 지역마다 '상권분석 보고서 보기'가 있다 */
  onReportFirst: () => void;
  onClose: () => void;
}

/** 첫 화면 — 모드마다 다른 질문으로 시작한다. 자영업자는 '우리 가게 장사 점검', 예비 창업자는 '창업할 자리 찾기'. 지도를 가리지 않게 닫을 수 있다. */
export function StartPanel(p: Props) {
  return p.mode === "owner" ? <OwnerStart {...p} /> : <FounderStart {...p} />;
}

function OwnerStart(p: Props) {
  const steps = START_STEPS.owner;
  return (
    <Drawer title="우리 가게 장사 점검" subtitle="자영업자 · 매출·비용과 주변 상권을 살펴봐요" onClose={p.onClose}>
      <ol style={{ margin: "10px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
        {steps.map((s, i) => (
          <li key={s} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: FS.body, color: "#374151" }}>
            <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: "50%", background: i === 0 ? "#1D4ED8" : "#E5E7EB", color: i === 0 ? "white" : "#4B5563", fontSize: FS.caption, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
      <button type="button" onClick={p.onFocusSearch} style={primary}>내 가게 찾기 ›<span style={sub}>가게 이름이나 주소를 검색하면 점검 요약이 열려요</span></button>
      {p.myStores.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: FS.warn, fontWeight: 700, marginBottom: 4 }}>내 가게 이어서 보기</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {p.myStores.slice(0, 3).map((s) => (
              <button key={s.storeId} type="button" onClick={() => p.onOpenStore(s.storeId)} style={secondary}>
                {s.name}{s.dong ? <span style={{ color: "#6B7280", fontWeight: 400 }}> · {s.dong}</span> : null} ›
              </button>
            ))}
          </div>
        </div>
      )}
      <ReportCta onClick={p.onReportFirst} who="우리 지역 상권" />
      <div style={{ fontSize: FS.caption, color: "#6B7280", marginTop: 12, lineHeight: 1.6 }}>매출·비용 기록은 이 브라우저에만 저장되고 서버로 보내지 않아요. 상권 매출은 카드 결제 기반 추정이라 내 가게의 실제 매출이 아니에요.</div>
    </Drawer>
  );
}

function FounderStart(p: Props) {
  const [choosingSvc, setChoosingSvc] = useState(false);
  const [svc, setSvc] = useState("");
  return (
    <Drawer title="창업할 자리 찾기" subtitle="예비 창업자 · 어디까지 정하셨나요?" onClose={p.onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
        <button type="button" onClick={p.onUndecided} style={choice}>
          <strong>① 지역도 업종도 아직 못 정했어요</strong>
          <span style={sub2}>매출이 늘고 있는 곳, 경쟁이 적은 곳 같은 조건으로 후보를 모아 볼게요</span>
        </button>
        <div style={{ ...choice, cursor: "default" }}>
          <button type="button" onClick={() => setChoosingSvc((v) => !v)} aria-expanded={choosingSvc} style={{ all: "unset", cursor: "pointer", display: "block", width: "100%" }}>
            <strong>② 업종은 정했어요</strong>
            <span style={sub2}>그 업종 기준으로 후보 지역을 찾아 볼게요</span>
          </button>
          {choosingSvc && (
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <select aria-label="창업 업종" value={svc} onChange={(e) => setSvc(e.target.value)} style={{ flex: 1, padding: "6px 8px", borderRadius: 8, border: "1px solid #D1D5DB", fontSize: FS.body }}>
                <option value="">업종을 고르세요</option>
                {(p.categories?.groups ?? []).map((g) => <option key={g.svc_cd} value={g.svc_cd}>{g.svc_nm}</option>)}
              </select>
              <button type="button" disabled={!svc} onClick={() => p.onPickSvc(svc)} style={{ ...btnSmall, opacity: svc ? 1 : 0.5 }}>찾기 ›</button>
            </div>
          )}
        </div>
        <button type="button" onClick={p.onFocusSearch} style={choice}>
          <strong>③ 관심 지역이 있어요</strong>
          <span style={sub2}>지역·역·상권 이름을 검색해서 바로 요약부터 볼게요</span>
        </button>
      </div>
      <ReportCta onClick={p.onReportFirst} who="후보 지역 상권" />
      {p.interestCount > 0 && <button type="button" onClick={p.onOpenInterest} style={{ ...linkBtn, marginTop: 14 }}>내 관심 지역 {p.interestCount}곳 이어서 보기(비교·보고서·비용) ›</button>}
      <div style={{ fontSize: FS.caption, color: "#6B7280", marginTop: 12, lineHeight: 1.6 }}>이어서: {stepsLine("founder")}. 후보는 조건에 맞는 곳이지 창업 추천이 아니에요.</div>
    </Drawer>
  );
}

/** 보고서 진입 — 지역을 고르면 그 지역의 상권분석 보고서를 바로 볼 수 있다(매출 흐름·경쟁·수요·입지를 4쪽으로, 인쇄·PDF 저장). */
function ReportCta({ onClick, who }: { onClick: () => void; who: string }) {
  return (
    <button type="button" onClick={onClick} style={{ width: "100%", marginTop: 14, minHeight: 48, padding: "10px 14px", border: "none", borderRadius: 10, background: "#C2410C", color: "white", fontWeight: 800, fontSize: FS.cardTitle, cursor: "pointer", textAlign: "left" }}>
      상권분석 보고서 보기 ›
      <span style={{ display: "block", fontSize: FS.caption, fontWeight: 500, opacity: 0.92, marginTop: 2 }}>{who}을 고르면 매출 흐름·경쟁·수요·입지를 4쪽으로 정리해 드려요</span>
    </button>
  );
}

const primary: React.CSSProperties = { width: "100%", marginTop: 16, padding: "11px 14px", border: "none", borderRadius: 10, background: "#1D4ED8", color: "white", fontWeight: 800, fontSize: FS.cardTitle, cursor: "pointer", textAlign: "left" };
const sub: React.CSSProperties = { display: "block", fontSize: FS.caption, fontWeight: 500, opacity: 0.9, marginTop: 2 };
const secondary: React.CSSProperties = { textAlign: "left", minHeight: 40, padding: "8px 12px", border: "1px solid #BFDBFE", borderRadius: 8, background: "#EFF6FF", color: "#1E3A8A", fontWeight: 700, fontSize: FS.body, cursor: "pointer" };
const linkBtn: React.CSSProperties = { border: "none", background: "none", color: "#1D4ED8", cursor: "pointer", fontSize: FS.body, padding: 0, textAlign: "left", textDecoration: "underline" };
const choice: React.CSSProperties = { textAlign: "left", padding: "12px 14px", border: "1px solid #D1D5DB", borderRadius: 12, background: "white", cursor: "pointer", fontSize: FS.body, lineHeight: 1.5, minHeight: 56 };
const sub2: React.CSSProperties = { display: "block", fontSize: FS.warn, color: "#4B5563", marginTop: 2 };
const btnSmall: React.CSSProperties = { minHeight: 40, padding: "6px 14px", borderRadius: 8, border: "none", background: "#1D4ED8", color: "white", fontWeight: 700, fontSize: FS.body, cursor: "pointer" };
