import { useMemo, useState } from "react";
import { Notice } from "../../components/Notice";
import { Term } from "../../components/Term";
import { COST_CHECK_EXCLUDED, COST_CHECK_FIELDS, clearDraft, computeCostCheck, loadDraft, saveDraft, type CostCheckDraft, type CostCheckKey } from "../../lib/costCheck";
import { formatKrw } from "../../lib/format";

const manwon = (v: number) => `${Math.round(v).toLocaleString("ko-KR")}만원`;
const signedManwon = (v: number) => `${v < 0 ? "-" : v > 0 ? "+" : ""}${manwon(Math.abs(v))}`;

/** 예비 창업자 '창업 비용 점검' — 내가 입력한 값으로 영업손익·손익분기를 계산하는 시뮬레이션. 기존 손익분기 계산(lib/breakeven)을 쓴다.
 * 입력은 이 브라우저에만 저장하고('내 가게' 실제 기록과 다른 저장 공간) 서버로 보내지 않는다. 실제 매출 예측이 아니다. */
export function CostCheckSection({ unitWord, scopeLabel, benchWon }: { unitWord: string; scopeLabel: string; benchWon: number | null }) {
  const [draft, setDraft] = useState<CostCheckDraft>(() => loadDraft());
  const [saveFailed, setSaveFailed] = useState(false);
  const benchMan = benchWon !== null ? benchWon / 1e4 : null;
  const res = useMemo(() => computeCostCheck(draft, benchMan), [draft, benchMan]);
  const set = (k: CostCheckKey, v: string) => {
    const next = { ...draft, [k]: v };
    setDraft(next);
    setSaveFailed(!saveDraft(next));
  };
  const hasAny = Object.values(draft).some((v) => v !== "");
  return (
    <div>
      <Notice tone="info">
        입력한 값으로 계산해 보는 <strong>시뮬레이션</strong>입니다. 이 서비스가 매출을 예측한 것이 아니며, 입력값은 이 브라우저에만 저장되고 서버로 보내지 않습니다.
      </Notice>
      {benchMan !== null && (
        <div style={{ fontSize: 11, color: "#6B7280", marginTop: 6 }}>
          참고: 이 {unitWord} {scopeLabel} 점포당 월평균 추정매출은 {formatKrw(benchWon)}입니다(서울시 카드 결제 기반 추정 평균 — 내 매출의 예측이 아닙니다).
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
        {COST_CHECK_FIELDS.map((f) => (
          <label key={f.key} style={{ fontSize: 11, color: "#4B5563", gridColumn: f.key === "revenue" ? "1 / -1" : undefined }}>
            {f.label} ({f.unit})
            <input type="text" inputMode="decimal" value={draft[f.key]} onChange={(e) => set(f.key, e.target.value)} placeholder={`예: ${f.placeholder}`} aria-describedby={`cc-help-${f.key}`} style={inputStyle} />
            <span id={`cc-help-${f.key}`} style={{ display: "block", fontSize: 10, color: "#9CA3AF", lineHeight: 1.4 }}>{f.help}</span>
          </label>
        ))}
      </div>
      {saveFailed && <div style={{ marginTop: 6 }}><Notice tone="warn">이 브라우저가 저장을 막아 입력값이 새로고침하면 사라집니다.</Notice></div>}

      <div style={{ marginTop: 12 }}>
        {res.status === "empty" && <Notice tone="muted">비용과 예상 월매출을 넣으면 영업손익과 손익분기를 계산해 드려요(아직 입력 없음).</Notice>}
        {res.status === "invalid" && <Notice tone="warn">금액은 0 이상의 숫자로, 비율(%)은 0~100 사이로 입력해 주세요. 계산을 보류합니다.</Notice>}
        {res.status === "no_margin" && <Notice tone="warn">원가율과 수수료율의 합이 100% 이상이면 매출이 늘어도 고정비를 갚을 수 없어 손익분기가 없습니다. 비율을 다시 확인해 주세요(계산 보류).</Notice>}
        {(res.status === "ok" || res.status === "no_revenue") && res.bep !== null && (
          <div role="status" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Card label="월 고정비 합" value={manwon(res.fixed)} />
            <Card label={<Term id="breakeven" />} value={manwon(res.bep)} sub={res.vsBenchPct === null ? undefined : `이 ${unitWord} 점포당 추정 평균의 ${res.vsBenchPct.toFixed(0)}%`} />
            {res.status === "ok" && res.profit !== null && (
              <Card label="입력값 기준 예상 영업손익(월)" value={`${res.profit < 0 ? "-" : ""}${manwon(Math.abs(res.profit))}`} sub={res.profit < 0 ? "적자(입력한 매출이 손익분기보다 낮음)" : "흑자(입력값 기준)"} />
            )}
            {res.status === "ok" && res.gap !== null && (
              <Card label="예상 월매출 − 손익분기" value={signedManwon(res.gap)} sub={res.gap >= 0 ? "손익분기보다 높게 잡은 매출" : "손익분기에 못 미치게 잡은 매출"} />
            )}
            {res.status === "ok" && res.safetyPct !== null && <Card label={<Term id="safetyMargin" />} value={`${res.safetyPct.toFixed(0)}%`} sub="입력 매출이 이만큼 줄어도 적자가 아닌 정도(음수면 이미 적자)" />}
          </div>
        )}
        {res.status === "no_revenue" && <div style={{ marginTop: 6 }}><Notice tone="muted">예상 월매출을 넣으면 영업손익과 손익분기와의 차이도 계산합니다.</Notice></div>}
      </div>

      <div style={{ marginTop: 12, fontSize: 11, color: "#6B7280", lineHeight: 1.6 }}>
        <strong style={{ color: "#374151" }}>포함하지 않은 항목</strong>
        <ul style={{ margin: "2px 0 0", paddingLeft: 16 }}>{COST_CHECK_EXCLUDED.map((x) => <li key={x}>{x}</li>)}</ul>
        손익분기 월매출 = 월 고정비 ÷ (1 − 원가율 − 수수료율). 필요한 항목은 '기타 고정비'에 직접 넣으세요.
      </div>
      {hasAny && (
        <button type="button" onClick={() => { clearDraft(); setDraft(loadDraft()); setSaveFailed(false); }} style={{ marginTop: 10, padding: "5px 10px", border: "1px solid #FCA5A5", borderRadius: 6, background: "white", color: "#991B1B", cursor: "pointer", fontSize: 12 }}>
          입력값 모두 지우기
        </button>
      )}
    </div>
  );
}

function Card({ label, value, sub }: { label: React.ReactNode; value: string; sub?: string }) {
  return (
    <div style={{ background: "#F9FAFB", borderRadius: 8, padding: "8px 10px" }}>
      <div style={{ fontSize: 11, color: "#6B7280" }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 15 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "#6B7280" }}>{sub}</div>}
    </div>
  );
}

const inputStyle: React.CSSProperties = { display: "block", width: "100%", boxSizing: "border-box", marginTop: 2, padding: "5px 8px", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 13 };
