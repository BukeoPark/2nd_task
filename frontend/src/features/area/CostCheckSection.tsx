import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { InfoTip } from "../../components/InfoTip";
import { Notice } from "../../components/Notice";
import { Term } from "../../components/Term";
import { COST_CHECK_EXCLUDED, COST_CHECK_FIELDS, clearDraft, computeCostCheck, loadDraft, saveDraft, type CostCheckDraft, type CostCheckKey } from "../../lib/costCheck";
import { formatKrw } from "../../lib/format";
import { useNarrow } from "../../lib/useNarrow";

const manwon = (v: number) => `${Math.round(v).toLocaleString("ko-KR")}만원`;
const signedManwon = (v: number) => `${v < 0 ? "-" : v > 0 ? "+" : ""}${manwon(Math.abs(v))}`;

interface Props {
  /** 후보 지역별로 저장하는 키('dong:11560535') — 없으면 전역 하나만 쓴다 */
  unitKey?: string;
  unitWord: string;
  scopeLabel: string;
  benchWon: number | null;
}

/** 예비 창업자 '창업 비용 점검' 작업 화면 — 내가 입력한 값으로 영업손익·손익분기를 계산하는 시뮬레이션. 기존 손익분기 계산(lib/breakeven)을 쓴다.
 * 넓은 화면에서는 입력(왼쪽)과 결과(오른쪽)를 나란히, 좁은 화면에서는 위아래로 둔다. 입력은 바로 결과에 반영된다.
 * 입력은 이 브라우저에만 저장하고('내 가게' 실제 기록과 다른 저장 공간) 서버로 보내지 않는다. 실제 매출 예측이 아니다. */
export function CostCheckSection({ unitKey, unitWord, scopeLabel, benchWon }: Props) {
  const [draft, setDraft] = useState<CostCheckDraft>(() => loadDraft(unitKey));
  const [saveFailed, setSaveFailed] = useState(false);
  const narrow = useNarrow();
  const benchMan = benchWon !== null ? benchWon / 1e4 : null;
  const res = useMemo(() => computeCostCheck(draft, benchMan), [draft, benchMan]);
  const set = (k: CostCheckKey, v: string) => {
    const next = { ...draft, [k]: v };
    setDraft(next);
    setSaveFailed(!saveDraft(next, unitKey));
  };
  const hasAny = Object.values(draft).some((v) => v !== "");
  const showResult = (res.status === "ok" || res.status === "no_revenue") && res.bep !== null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Notice tone="info">
        입력한 값으로 계산해 보는 <strong>시뮬레이션</strong>입니다. 서비스가 매출을 예측한 것이 아니며, 입력값은 이 브라우저에만 저장되고 서버로 보내지 않습니다.
      </Notice>
      {/* 좁은 화면: 입력 위에 결과 요약을 먼저 둔다(스크롤하면 올라가는 일반 영역 — 입력칸·키보드를 가리는 고정 UI 는 쓰지 않는다) */}
      {narrow && (
        <section aria-label="결과 요약" aria-live="polite" style={{ ...card, padding: "10px 12px" }}>
          {showResult && res.bep !== null ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <Mini label="예상 영업손익(월)" value={res.status === "ok" && res.profit !== null ? `${res.profit < 0 ? "-" : ""}${manwon(Math.abs(res.profit))}` : "매출을 넣으면"} color={res.profit !== null && res.profit < 0 ? "#B91C1C" : res.profit !== null ? "#047857" : "#6B7280"} />
              <Mini label="손익분기 월매출" value={manwon(res.bep)} color="#1D4ED8" />
            </div>
          ) : (
            <div style={{ fontSize: 13, color: res.status === "invalid" || res.status === "no_margin" ? "#92400E" : "#4B5563" }}>
              {res.status === "invalid" ? "입력값을 확인해 주세요(금액은 0 이상, 비율은 0~100%). 계산을 보류합니다." : res.status === "no_margin" ? "원가율+수수료율이 100% 이상이라 손익분기가 없습니다." : "값을 넣으면 영업손익과 손익분기 월매출이 여기에 바로 나와요."}
            </div>
          )}
        </section>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: 14, alignItems: "start" }}>
        {/* 입력 */}
        <section aria-label="입력" style={card}>
          <strong style={{ fontSize: 17 }}>내가 넣는 값</strong>
          {benchMan !== null && (
            <div style={{ fontSize: 13, color: "#4B5563", margin: "4px 0 0" }}>
              참고: 이 {unitWord} {scopeLabel} 점포당 월평균 추정매출은 <strong>{formatKrw(benchWon)}</strong>입니다(카드 결제 기반 추정 평균 — 내 매출의 예측이 아닙니다).
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 136px), 1fr))", gap: 10, marginTop: 12 }}>
            {COST_CHECK_FIELDS.map((f) => (
              <label key={f.key} style={{ fontSize: 13, color: "#374151", fontWeight: 600, gridColumn: f.key === "revenue" ? "1 / -1" : undefined }}>
                {f.label} <span style={{ fontWeight: 400, color: "#6B7280" }}>({f.unit})</span>{narrow && <> <InfoTip label={`${f.label} 설명`}>{f.help}</InfoTip></>}
                <input type="text" inputMode="decimal" value={draft[f.key]} onChange={(e) => set(f.key, e.target.value)} placeholder={`예: ${f.placeholder}`} aria-describedby={`cc-help-${f.key}`} style={inputStyle} />
                <span id={`cc-help-${f.key}`} style={narrow ? srOnly : { display: "block", fontSize: 12.5, color: "#6B7280", fontWeight: 400, lineHeight: 1.4 }}>{f.help}</span>
              </label>
            ))}
          </div>
          {saveFailed && <div style={{ marginTop: 8 }}><Notice tone="warn">이 브라우저가 저장을 막아 입력값이 새로고침하면 사라집니다.</Notice></div>}
          {hasAny && (
            <button type="button" onClick={() => { clearDraft(unitKey); setDraft(loadDraft(unitKey)); setSaveFailed(false); }} style={{ marginTop: 12, padding: "6px 12px", border: "1px solid #FCA5A5", borderRadius: 6, background: "white", color: "#991B1B", cursor: "pointer", fontSize: 13 }}>
              입력값 모두 지우기
            </button>
          )}
        </section>

        {/* 결과 — 넓은 화면에서는 스크롤해도 따라온다 */}
        <section aria-label="계산 결과" style={{ ...card, position: narrow ? "static" : "sticky", top: 76 }}>
          <strong style={{ fontSize: 17 }}>계산 결과</strong>
          <div style={{ marginTop: 10 }}>
            {res.status === "empty" && <Notice tone="muted">비용과 예상 월매출을 넣으면 영업손익과 손익분기를 바로 계산해 드려요(아직 입력 없음).</Notice>}
            {res.status === "invalid" && <Notice tone="warn">금액은 0 이상의 숫자로, 비율(%)은 0~100 사이로 입력해 주세요. 계산을 보류합니다.</Notice>}
            {res.status === "no_margin" && <Notice tone="warn">원가율과 수수료율의 합이 100% 이상이면 매출이 늘어도 고정비를 갚을 수 없어 손익분기가 없습니다. 비율을 다시 확인해 주세요(계산 보류).</Notice>}
            {showResult && res.bep !== null && (
              <div role="status" aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {res.status === "ok" && res.profit !== null && (
                  <Big label="예상 영업손익(월)" value={`${res.profit < 0 ? "-" : ""}${manwon(Math.abs(res.profit))}`} color={res.profit < 0 ? "#B91C1C" : "#047857"} sub={res.profit < 0 ? "적자 — 입력한 매출이 손익분기보다 낮습니다" : "흑자 — 입력값 기준"} />
                )}
                <Big label={<Term id="breakeven" />} value={manwon(res.bep)} color="#1D4ED8" sub={res.vsBenchPct === null ? "월 고정비 ÷ (1 − 원가율 − 수수료율)" : `이 ${unitWord} 점포당 추정 평균의 ${res.vsBenchPct.toFixed(0)}%`} />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }}>
                  <Small label="월 고정비 합" value={manwon(res.fixed)} />
                  {res.status === "ok" && res.gap !== null && <Small label="예상 월매출 − 손익분기" value={signedManwon(res.gap)} sub={res.gap >= 0 ? "손익분기보다 높게 잡음" : "손익분기에 못 미침"} />}
                  {res.status === "ok" && res.safetyPct !== null && <Small label={<Term id="safetyMargin" />} value={`${res.safetyPct.toFixed(0)}%`} sub="음수면 이미 적자" />}
                </div>
                {res.status === "no_revenue" && <Notice tone="muted">예상 월매출을 넣으면 영업손익과 손익분기와의 차이도 계산합니다.</Notice>}
              </div>
            )}
          </div>
          <div style={{ marginTop: 14, fontSize: 12.5, color: "#6B7280", lineHeight: 1.6 }}>
            <strong style={{ color: "#374151" }}>포함하지 않은 항목</strong>
            <ul style={{ margin: "2px 0 0", paddingLeft: 16 }}>{COST_CHECK_EXCLUDED.map((x) => <li key={x}>{x}</li>)}</ul>
            필요한 항목은 '기타 고정비'에 직접 넣으세요.
          </div>
        </section>
      </div>
    </div>
  );
}

/** 지도 옆 좁은 패널에서는 계산하지 않고, 저장된 값의 결과 한 줄과 작업 화면으로 가는 단추만 둔다. */
export function CostCheckLauncher({ unitKey, unitWord, benchWon, onOpen }: { unitKey?: string; unitWord: string; benchWon: number | null; onOpen: () => void }) {
  const res = computeCostCheck(loadDraft(unitKey), benchWon !== null ? benchWon / 1e4 : null);
  const has = res.bep !== null;
  return (
    <div>
      <Notice tone="info">내가 넣은 비용으로 영업손익·손익분기를 계산해 보는 <strong>시뮬레이션</strong>이에요(매출 예측이 아닙니다). 넓은 작업 화면에서 입력과 결과를 함께 볼 수 있어요.</Notice>
      {has && res.bep !== null && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
          <Small label="저장된 값 기준 손익분기 월매출" value={manwon(res.bep)} />
          {res.profit !== null && <Small label="예상 영업손익(월)" value={`${res.profit < 0 ? "-" : ""}${manwon(Math.abs(res.profit))}`} />}
        </div>
      )}
      <button type="button" onClick={onOpen} style={{ width: "100%", marginTop: 12, padding: "10px 12px", border: "none", borderRadius: 8, background: "#1D4ED8", color: "white", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
        {has ? "비용 점검 이어서 하기" : "비용 점검 작업 화면 열기"} ›
        <span style={{ display: "block", fontSize: 12.5, fontWeight: 500, opacity: 0.9 }}>이 {unitWord} 기준 참고값과 함께 · 입력값은 이 브라우저에만 저장</span>
      </button>
    </div>
  );
}

function Big({ label, value, sub, color }: { label: ReactNode; value: string; sub?: string; color: string }) {
  return (
    <div style={{ background: "#F9FAFB", borderRadius: 12, padding: "12px 14px" }}>
      <div style={{ fontSize: 13, color: "#4B5563" }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: 28, lineHeight: 1.2, color }}>{value}</div>
      {sub && <div style={{ fontSize: 12.5, color: "#6B7280" }}>{sub}</div>}
    </div>
  );
}

function Mini({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div style={{ fontSize: 12.5, color: "#4B5563" }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: 26, lineHeight: 1.3, color }}>{value}</div>
    </div>
  );
}

function Small({ label, value, sub }: { label: ReactNode; value: string; sub?: string }) {
  return (
    <div style={{ background: "#F9FAFB", borderRadius: 10, padding: "8px 10px" }}>
      <div style={{ fontSize: 12.5, color: "#4B5563" }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: 20 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#6B7280" }}>{sub}</div>}
    </div>
  );
}

const card: CSSProperties = { background: "white", borderRadius: 12, padding: "14px 16px", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" };
const inputStyle: CSSProperties = { display: "block", width: "100%", boxSizing: "border-box", marginTop: 3, padding: "8px 10px", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 16 };

/** 화면에서는 가리고 스크린리더에는 읽히게(좁은 화면에서는 설명을 '?' 말풍선으로 옮겼다) */
const srOnly: CSSProperties = { position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" };
