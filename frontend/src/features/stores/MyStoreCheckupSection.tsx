import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Notice, Section, SourceNote } from "../../components/Notice";
import { apiClient } from "../../lib/apiClient";
import { breakeven, parseNum, type CostInput } from "../../lib/breakeven";
import { assess, buildRows, checkupText, GAP_PP, quarterLabel } from "../../lib/checkup";
import { formatKrw } from "../../lib/format";
import { clearRecord, loadRecord, saveRecord, type CostKey, type StoreRecord } from "../../lib/myStoreStorage";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const COST_FIELDS: { key: CostKey; label: string; unit: string; placeholder: string }[] = [
  { key: "rent", label: "임대료·관리비", unit: "만원/월", placeholder: "300" },
  { key: "labor", label: "인건비", unit: "만원/월", placeholder: "500" },
  { key: "otherFixed", label: "기타 고정비", unit: "만원/월", placeholder: "100" },
  { key: "cogsPct", label: "재료비·원가율", unit: "% (매출 대비)", placeholder: "35" },
  { key: "feePct", label: "카드·배달앱 수수료율", unit: "% (매출 대비)", placeholder: "5" },
];

const inputStyle = { width: "100%", padding: "6px 8px", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 13, boxSizing: "border-box" } as const;
const buttonStyle = { padding: "6px 12px", border: "1px solid #D1D5DB", borderRadius: 6, background: "#fff", fontSize: 12, cursor: "pointer" } as const;

function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function manwon(v: number): string {
  return `${Math.round(v).toLocaleString("ko-KR")}만원`;
}

/** '내 가게 점검' — 월 매출을 기록해 동네 같은 업종의 변화와 견주고, 비용을 넣어 손익분기 매출을 본다.
 * 입력한 값은 이 브라우저(localStorage)에만 저장하고 서버로 보내지 않는다. 가게마다 따로 저장한다. */
export function MyStoreCheckupSection({ storeId }: { storeId: string }) {
  const { data } = useQuery({
    queryKey: ["sales-benchmark", storeId],
    queryFn: () => apiClient.getSalesBenchmark(storeId),
    staleTime: 10 * 60 * 1000,
  });
  const [record, setRecord] = useState<StoreRecord>(() => loadRecord(storeId));
  const [saveFailed, setSaveFailed] = useState(false);
  const [month, setMonth] = useState(thisMonth);
  const [amount, setAmount] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const update = (next: StoreRecord) => {
    setRecord(next);
    setSaveFailed(!saveRecord(storeId, next));
  };

  const bench = data?.status === "ok" ? data : null;
  const unitLabel = bench?.unit?.label ?? "동네";
  const benchWon = bench?.per_store_month ?? null;

  const addMonth = (e: FormEvent) => {
    e.preventDefault();
    const v = parseNum(amount);
    if (!MONTH_RE.test(month)) return setFormError("월은 2026-06 형식으로 골라 주세요.");
    if (v === null || !Number.isFinite(v) || v < 0) return setFormError("매출은 0 이상의 숫자(만원)로 입력해 주세요.");
    setFormError(null);
    update({ ...record, months: { ...record.months, [month]: v } });
    setAmount("");
  };

  const removeMonth = (m: string) => {
    const { [m]: _removed, ...rest } = record.months;
    update({ ...record, months: rest });
  };

  const setCost = (key: CostKey, value: string) => update({ ...record, costs: { ...record.costs, [key]: value } });

  const resetAll = () => {
    if (!window.confirm("이 가게의 매출 기록과 비용 입력을 모두 지울까요? 되돌릴 수 없습니다.")) return;
    clearRecord(storeId);
    setRecord(loadRecord(storeId));
    setSaveFailed(false);
  };

  const monthKeys = Object.keys(record.months).sort().reverse();
  const rows = buildRows(record.months, bench?.trend ?? []);
  const checkup = assess(rows);

  const cost: CostInput = {
    rent: parseNum(record.costs.rent),
    labor: parseNum(record.costs.labor),
    otherFixed: parseNum(record.costs.otherFixed),
    cogsPct: parseNum(record.costs.cogsPct),
    feePct: parseNum(record.costs.feePct),
  };
  const latestMonth = monthKeys[0] ?? null;
  const latestRevenue = latestMonth ? record.months[latestMonth] : null;
  const bep = breakeven(cost, latestRevenue, benchWon === null ? null : benchWon / 1e4);

  return (
    <Section title="내 가게 점검" right={<span style={{ fontSize: 11, color: "#6B7280" }}>이 브라우저에만 저장</span>}>
      {saveFailed && (
        <div style={{ marginBottom: 8 }}>
          <Notice tone="warn">이 브라우저에서 저장이 막혀 있어(시크릿 창·저장 차단 등) 지금 화면에서만 계산됩니다. 새로고침하면 사라져요.</Notice>
        </div>
      )}

      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>1. 월 매출 기록 — 동네 흐름과 비교</div>
      <form onSubmit={addMonth} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 6, alignItems: "end" }}>
        <label style={{ fontSize: 11, color: "#6B7280" }}>
          월
          <input type="month" value={month} max={thisMonth()} onChange={(e) => setMonth(e.target.value)} style={inputStyle} />
        </label>
        <label style={{ fontSize: 11, color: "#6B7280" }}>
          매출 (만원)
          <input type="text" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="예: 3500" style={inputStyle} />
        </label>
        <button type="submit" style={buttonStyle}>
          기록
        </button>
      </form>
      {formError && (
        <div style={{ marginTop: 4 }}>
          <Notice tone="warn">{formError}</Notice>
        </div>
      )}
      <div style={{ fontSize: 11, color: "#6B7280", marginTop: 4 }}>같은 달을 다시 기록하면 덮어씁니다. 달마다 쌓을수록 비교가 정확해져요.</div>

      {monthKeys.length > 0 && (
        <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
          {monthKeys.slice(0, 12).map((m) => (
            <span key={m} style={{ fontSize: 11, background: "#F3F4F6", borderRadius: 12, padding: "2px 4px 2px 8px" }}>
              {m} · {manwon(record.months[m])}
              <button
                type="button"
                aria-label={`${m} 기록 삭제`}
                onClick={() => removeMonth(m)}
                style={{ border: "none", background: "none", cursor: "pointer", color: "#6B7280", fontSize: 12 }}
              >
                ×
              </button>
            </span>
          ))}
          {monthKeys.length > 12 && <span style={{ fontSize: 11, color: "#6B7280" }}>외 {monthKeys.length - 12}개월</span>}
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        {!bench && data && <Notice tone="muted">{data.message ?? "이 매장은 동네 매출 자료와 연결되지 않아 비교할 수 없습니다. 비용 계산은 아래에서 쓸 수 있어요."}</Notice>}
        {!data && <Notice tone="muted">동네 매출 자료를 불러오는 중...</Notice>}
        {bench && (
          <Notice tone={checkup.verdict === "lagging" ? "warn" : "info"}>
            {checkupText(checkup, unitLabel)}
            {checkup.partial && " (기록이 3개월 미만인 분기는 기록한 달만의 평균이에요.)"}
          </Notice>
        )}
      </div>

      {bench && rows.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 11 }}>
          <div style={{ display: "grid", gridTemplateColumns: "52px 1fr 1fr", gap: 4, color: "#6B7280", marginBottom: 2 }}>
            <span>분기</span>
            <span>내 월평균</span>
            <span>{unitLabel} 같은 업종 평균</span>
          </div>
          {[...rows].reverse().slice(0, 6).map((r) => (
            <div key={r.quarter} style={{ display: "grid", gridTemplateColumns: "52px 1fr 1fr", gap: 4, padding: "2px 0", borderTop: "1px solid #F3F4F6" }}>
              <span>{quarterLabel(r.quarter)}</span>
              <span>
                {manwon(r.mine / 1e4)} <span style={{ color: "#9CA3AF" }}>({r.months}개월)</span>
              </span>
              <span>{r.bench === null ? "아직 공개 전" : formatKrw(r.bench)}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 4 }}>
        동네 값은 서울시 카드 결제 기반 추정이라 현금·배달 매출이 섞인 내 매출과 금액 수준은 다를 수 있어요. 그래서 금액이 아니라 같은 기간의 변화율을 견줍니다.
        차이가 {GAP_PP}%p 이상일 때만 더 낮아짐·높아짐으로 말하며, 원인이나 개선 방향을 뜻하지는 않습니다.
      </div>
      {bench && <SourceNote title={bench.source.title} reference={bench.source.reference ?? "-"} />}

      <div style={{ fontSize: 12, fontWeight: 600, margin: "16px 0 4px" }}>2. 간이 손익분기 계산</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {COST_FIELDS.map((f) => (
          <label key={f.key} style={{ fontSize: 11, color: "#6B7280" }}>
            {f.label} ({f.unit})
            <input
              type="text"
              inputMode="decimal"
              value={record.costs[f.key]}
              onChange={(e) => setCost(f.key, e.target.value)}
              placeholder={`예: ${f.placeholder}`}
              style={inputStyle}
            />
          </label>
        ))}
      </div>
      <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 4 }}>
        손익분기 매출 = 월 고정비 ÷ (1 − 재료비율 − 수수료율). 세금·대출 원리금은 '기타 고정비'에 넣어야 반영됩니다. 사장님 본인 몫을 인건비에 넣을지는 직접 정하세요.
        동네 평균 비용 자료는 없어 입력한 값만으로 계산한 참고용 숫자입니다.
      </div>

      <div style={{ marginTop: 8 }}>
        {bep.status === "empty" && <Notice tone="muted">비용을 입력하면 손익분기 매출을 계산해 드려요.</Notice>}
        {bep.status === "invalid" && <Notice tone="warn">비용은 0 이상의 숫자로, 비율(%)은 0~100 사이로 입력해 주세요.</Notice>}
        {bep.status === "no_margin" && <Notice tone="warn">재료비율과 수수료율의 합이 100% 이상이면 매출이 늘어도 고정비를 갚을 수 없어 손익분기가 없습니다. 비율을 다시 확인해 주세요.</Notice>}
        {bep.status === "ok" && bep.bep !== null && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Card label="월 고정비 합" value={manwon(bep.fixed)} />
            <Card label="손익분기 월 매출" value={manwon(bep.bep)} sub={bep.vsBenchPct === null ? undefined : `${unitLabel} 같은 업종 점포당 평균의 ${bep.vsBenchPct.toFixed(0)}%`} />
            {bep.profit !== null && latestMonth && (
              <Card
                label={`예상 월 이익 (${latestMonth} 매출 ${manwon(latestRevenue ?? 0)} 기준)`}
                value={`${bep.profit < 0 ? "-" : ""}${manwon(Math.abs(bep.profit))}`}
                sub={bep.profit < 0 ? "손익분기보다 매출이 낮은 달" : undefined}
              />
            )}
            {bep.safetyPct !== null && <Card label="안전마진" value={`${bep.safetyPct.toFixed(0)}%`} sub="매출이 이만큼 줄어도 적자가 아닌 정도(음수면 이미 적자)" />}
          </div>
        )}
      </div>

      {(monthKeys.length > 0 || Object.values(record.costs).some((v) => v !== "")) && (
        <div style={{ marginTop: 12 }}>
          <button type="button" onClick={resetAll} style={{ ...buttonStyle, color: "#991B1B" }}>
            이 가게 기록 모두 지우기
          </button>
        </div>
      )}
    </Section>
  );
}

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: "#F9FAFB", borderRadius: 8, padding: "8px 10px" }}>
      <div style={{ fontSize: 11, color: "#6b7280" }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 15 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#6B7280" }}>{sub}</div>}
    </div>
  );
}
