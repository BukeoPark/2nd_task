import { useMemo, useState } from "react";
import { InfoTip } from "../../components/InfoTip";
import { Fold, Notice } from "../../components/Notice";
import { ActionButton, Block, Caption, Stat, SubHead } from "../../components/PanelKit";
import { inputStyle, labelStyle } from "../../lib/panelStyle";
import { COST_CHECK_EXCLUDED, COST_CHECK_FIELDS, clearDraft, computeCostCheck, computeRentDetail, loadDraft, saveDraft, type CostCheckDraft, type CostCheckKey } from "../../lib/costCheck";
import { STARTUP_FIELDS, ORDER_FIELDS, computeStartupPlan } from "../../lib/startupPlan";
import { BENCH_LEVEL_TEXT, costFill, orderHint, salesBenchmark } from "../../lib/costSummary";
import { formatKrw } from "../../lib/format";
import { FS } from "../../lib/typography";

const manwon = (v: number) => `${Math.round(v).toLocaleString("ko-KR")}만원`;
const inputGrid = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 };
interface Props { unitKey?: string; unitWord: string; scopeLabel: string; benchWon: number | null }

/** 월 비용 → 필요한 매출·주문 수를 먼저 보여주고 초기 자금과 목표 매출은 선택 입력으로 분리한다. */
export function CostCheckSection({ unitKey, unitWord, scopeLabel, benchWon }: Props) {
  const [draft, setDraft] = useState<CostCheckDraft>(() => loadDraft(unitKey));
  const [saveFailed, setSaveFailed] = useState(false);
  const res = useMemo(() => computeCostCheck(draft, benchWon === null ? null : benchWon / 1e4), [draft, benchWon]);
  const plan = useMemo(() => computeStartupPlan(draft, res.bep), [draft, res.bep]);
  const cashPlan = useMemo(() => computeStartupPlan(draft, res.cashBep), [draft, res.cashBep]);
  const rentDetail = computeRentDetail(draft);
  const hasAny = Object.values(draft).some(v => v !== "");
  const usable = (res.status === "ok" || res.status === "no_revenue") && res.bep !== null;
  const set = (key: CostCheckKey, value: string) => {
    const next = { ...draft, [key]: value, ...(["rent", "maintenance"].includes(key) ? { legacyRentCombined: "" } : {}) };
    setDraft(next); setSaveFailed(!saveDraft(next, unitKey));
  };
  const field = (f: { key: CostCheckKey; label: string; unit: string; placeholder: string; help?: string }) => <label key={f.key} style={labelStyle}>
    {f.label} <span style={{ color: "#6B7280", fontWeight: 400 }}>({f.unit})</span>{f.help && <> <InfoTip label={`${f.label} 설명`}>{f.help}</InfoTip></>}
    <input type="text" inputMode={f.key === "openDays" ? "numeric" : "decimal"} value={draft[f.key]} onChange={e => set(f.key, e.target.value)} placeholder={`예: ${f.placeholder}`} style={{ ...inputStyle, width: "100%", boxSizing: "border-box", marginTop: 5 }}/>
  </label>;
  const monthly = COST_CHECK_FIELDS.filter(f => !["revenue", "ownerPay", "loanPayment"].includes(f.key));
  const revenueField = COST_CHECK_FIELDS.find(f => f.key === "revenue")!;
  return <div>
    <Caption style={{ margin: "0 0 14px" }}>내가 넣은 비용으로 필요한 매출과 주문 수를 계산합니다. <InfoTip label="계산·저장 안내">매출 예측이 아닌 입력값 기준 계산입니다. 입력은 이 브라우저에만 저장되며 서버로 보내지 않습니다.</InfoTip></Caption>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: 18, alignItems: "start" }}>
      <Block surface="card" title="내 가게 비용 입력">
        <SubHead>점포 면적</SubHead>
        {field({ key: "floorArea", label: "전용면적", unit: "㎡", placeholder: "33", help: "검토 중인 점포의 전용면적을 입력하세요. 월세 단가 계산에만 사용합니다." })}
        {rentDetail.invalidArea ? <Caption tone="warn">면적은 0보다 큰 숫자로 입력해 주세요.</Caption> : rentDetail.area !== null && <Caption>약 {(rentDetail.area / 3.305785).toFixed(1)}평{rentDetail.rentPerSqm !== null ? ` · 월세 ㎡당 ${Math.round(rentDetail.rentPerSqm).toLocaleString()}원 (관리비 제외)` : ""}</Caption>}
        <SubHead>매달 나가는 돈</SubHead>
        {draft.legacyRentCombined === "1" && <Caption tone="warn">기존 월세·관리비 합계가 월세 칸에 보관돼 있어요. 두 금액을 나눠 입력해 주세요.</Caption>}
        <div style={inputGrid}>{monthly.map(f => field(f))}</div>
        <div style={{ marginTop: 10 }}><Fold title="내 월급·대출 상환액 (선택)">
          <div style={inputGrid}>{COST_CHECK_FIELDS.filter(f => ["ownerPay", "loanPayment"].includes(f.key)).map(f => field(f))}</div>
        </Fold></div>
        <SubHead>하루 판매량 계산</SubHead>
        <div style={inputGrid}>{ORDER_FIELDS.map(f => field({ ...f, label: f.key === "averageTicket" ? "주문당 평균 금액" : f.label }))}</div>
        <div style={{ marginTop: 18, paddingTop: 8, borderTop: "1px solid #E5E7EB" }}>
          <Fold title="초기 준비 자금 계산 (선택)">
            <Caption>보증금은 묶이는 돈, 나머지는 개업 준비비·운영자금으로 구분합니다.</Caption>
            <div style={{ ...inputGrid, marginTop: 10 }}>{STARTUP_FIELDS.map(f => field(f))}</div>
          </Fold>
          <Fold title="목표 매출과 비교 (선택)">
            {field({ ...revenueField, label: "목표 월매출" })}
          </Fold>
        </div>
        {saveFailed ? <Notice tone="warn">입력값을 저장하지 못했어요.</Notice> : <Caption>입력값 자동 저장</Caption>}
        {hasAny && <div style={{ marginTop: 12 }}><ActionButton variant="ghost" onClick={() => { clearDraft(unitKey); setDraft(loadDraft(unitKey)); setSaveFailed(false); }}>입력값 초기화</ActionButton></div>}
      </Block>
      <div>
        <Block surface="card" title="운영비를 감당하려면">
          {res.status === "empty" && <Notice tone="muted">왼쪽에 월비용을 입력해 주세요.</Notice>}
          {res.status === "invalid" && <Notice tone="warn">금액은 0 이상, 비율은 0~100%로 입력해 주세요.</Notice>}
          {res.status === "no_margin" && <Notice tone="warn">원가율과 수수료율의 합을 100% 미만으로 입력해 주세요.</Notice>}
          {usable && <div role="status" aria-live="polite">
            <div style={inputGrid}>
              <Stat big label="필요한 월매출" value={manwon(res.bep!)} valueColor="#1D4ED8"/>
              <Stat big label="하루 필요 주문" value={plan.dailyOrders === null ? "—" : `${plan.dailyOrders.toLocaleString()}건`} valueColor={plan.dailyOrders === null ? "#9CA3AF" : "#1D4ED8"}/>
            </div>
            {plan.invalidOrders ? <Caption tone="warn">영업일은 1~31일, 주문 금액은 0원 초과로 입력해 주세요.</Caption> : plan.dailyOrders === null ? <Caption>영업일·주문당 금액을 넣으면 하루 주문 수가 나와요.</Caption> : <Caption>월 {draft.openDays}일 영업 · 주문당 {Number(draft.averageTicket.replace(/,/g, "")).toLocaleString()}원 기준</Caption>}
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #E5E7EB", display: "flex", justifyContent: "space-between", gap: 12, fontSize: FS.body }}><span>입력한 월 고정비</span><strong>{manwon(res.fixed)}</strong></div>
            <Caption>{res.ownerPay !== null ? `내 월급 ${manwon(res.ownerPay)} 포함` : "내 월급 미입력"} · 비워 둔 비용 제외</Caption>
          </div>}
          {usable && res.loanPayment !== null && res.loanPayment > 0 && res.cashBep !== null && <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid #E5E7EB" }}>
            <SubHead>대출 상환까지 감당하려면</SubHead>
            <div style={inputGrid}>
              <Stat big label="필요한 월매출" value={manwon(res.cashBep)} valueColor="#1D4ED8"/>
              <Stat big label="하루 필요 주문" value={cashPlan.dailyOrders === null ? "—" : `${cashPlan.dailyOrders.toLocaleString()}건`} valueColor={cashPlan.dailyOrders === null ? "#9CA3AF" : "#1D4ED8"}/>
            </div>
            <Caption>대출 월 상환액 {manwon(res.loanPayment)} 추가 반영</Caption>
          </div>}
          {res.status === "ok" && res.profit !== null && <div style={{ marginTop: 16 }}>
            <SubHead>목표 매출을 달성하면</SubHead>
            <Stat big label={res.ownerPay !== null ? "내 월급 반영 후 월 잔여액" : "월 예상 영업손익"} value={`${res.profit < 0 ? "−" : ""}${manwon(Math.abs(res.profit))}`} valueColor={res.profit < 0 ? "#B91C1C" : "#047857"}/>
          </div>}
          {res.status === "ok" && res.cashSurplus !== null && res.loanPayment !== null && res.loanPayment > 0 && <div style={{ marginTop: 10 }}><Stat label="대출 상환 후 월 잔여액" value={`${res.cashSurplus < 0 ? "−" : ""}${manwon(Math.abs(res.cashSurplus))}`} valueColor={res.cashSurplus < 0 ? "#B91C1C" : "#047857"}/></div>}
          {plan.hasStartup && <div style={{ marginTop: 16 }}>
            <SubHead>처음 준비할 자금</SubHead>
            {plan.invalid ? <Caption tone="warn">초기 자금은 0 이상의 숫자로 입력해 주세요.</Caption> : <>
              <Stat big label="준비 자금 합계" value={manwon(plan.total ?? 0)} sub={plan.partial ? "입력한 항목만 합산" : undefined}/>
              <Caption>보증금 {plan.deposit === null ? "미입력" : manwon(plan.deposit)} · 개업 준비비 {manwon(plan.setup ?? 0)} · 운영자금 {plan.reserve === null ? "미입력" : manwon(plan.reserve)}</Caption>
            </>}
          </div>}
          <div style={{ marginTop: 18 }}><Fold title="계산 기준·빠진 비용">
            <Caption>필요 월매출 = 월 고정비(입력한 내 월급 포함) ÷ (1 − 원가율 − 수수료율). 대출 상환 필요 매출은 월 고정비에 월 상환액을 더해 계산합니다. 하루 주문 수는 월매출을 영업일과 주문 금액으로 나누고 올림합니다.</Caption>
            <ul style={{ paddingLeft: 18, fontSize: FS.caption, lineHeight: 1.6, color: "#6B7280" }}>{COST_CHECK_EXCLUDED.map(x => <li key={x}>{x}</li>)}</ul>
            <Caption>대출 상환 후 잔여액은 현금 기준 계산으로 회계상 영업이익과 다릅니다. 초기 자금은 월비용에 중복 입력하지 마세요.</Caption>
            {benchWon !== null && <Caption>이 {unitWord} {scopeLabel} 점포당 월평균 추정매출: {formatKrw(benchWon)}. 참고 평균이며 내 매출 예측은 아닙니다.</Caption>}
          </Fold></div>
        </Block>
      </div>
    </div>
  </div>;
}

/** 지도 패널에서는 저장된 결과와 계산 화면 진입만 보여준다. */
export function CostCheckLauncher({ unitKey, unitWord, benchWon, benchNote, onOpen }: { unitKey?: string; unitWord: string; benchWon: number | null; /** 평균의 업종 범위·기준 분기('외식 전체 기준 · 2026년 2분기') */ benchNote?: string; onOpen: () => void }) {
  const draft = loadDraft(unitKey);
  const res = computeCostCheck(draft, benchWon !== null ? benchWon / 1e4 : null);
  const hasLoan = (res.loanPayment ?? 0) > 0;
  const required = hasLoan ? res.cashBep : res.bep;
  const plan = computeStartupPlan(draft, required);
  const valid = (res.status === "ok" || res.status === "no_revenue") && required !== null;
  const fill = costFill(draft);
  const bench = valid ? salesBenchmark(required, benchWon) : null;
  const orderNote = orderHint(draft.openDays, draft.averageTicket, plan.invalidOrders, plan.dailyOrders);
  const avgTip = <InfoTip label="지역 평균 기준">{benchNote ? <>{benchNote}<br/></> : null}서울시 카드결제 기반 추정이라 현금·배달 매출이 빠져 있고, 개별 점포의 매출이나 내 매출 예측이 아닙니다.</InfoTip>;
  return <div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
      <Stat onGray big label="필요한 월매출" value={valid ? manwon(required!) : "—"} missing={!valid} sub={valid ? undefined : "월 비용을 넣으면 계산돼요."}/>
      <Stat onGray big label="하루 필요 주문" value={plan.dailyOrders === null ? "—" : `${plan.dailyOrders.toLocaleString()}건`} missing={plan.dailyOrders === null} sub={valid ? orderNote ?? undefined : "영업일·주문 금액도 넣어 주세요."} subTone={valid && plan.invalidOrders ? "warn" : undefined}/>
    </div>
    {valid
      ? <Caption>{hasLoan ? "대출 상환 포함 · " : ""}{res.ownerPay !== null ? "내 월급 포함 · " : ""}저장한 입력값 기준{fill.missing.length === 0 ? ` · 월 비용 ${fill.total}칸 모두 입력` : ""}</Caption>
      : <Caption>월세·관리비·인건비·내 월급·기타 고정비·원가율·수수료율({fill.total}칸)을 넣으면 필요한 매출과 주문 수를 계산해요.</Caption>}
    {valid && fill.missing.length > 0 && <Caption tone="warn">월 비용 {fill.total}칸 중 {fill.filled}칸만 입력했어요. 비어 있는 {fill.missing.join("·")}만큼 필요한 매출이 낮게 계산돼요.</Caption>}
    {benchWon !== null && benchWon > 0 && <div style={{ marginTop: 10 }}>
      <Stat onGray
        label={<>이 {unitWord} 같은 업종 점포당 월평균 추정매출 {avgTip}</>}
        value={manwon(benchWon / 1e4)}
        sub={bench ? `필요한 월매출은 이 평균의 ${bench.pct.toLocaleString()}% · ${BENCH_LEVEL_TEXT[bench.level]}` : "월 비용을 넣으면 필요한 월매출을 이 평균과 견줘 드려요."}/>
    </div>}
    <div style={{ marginTop: 12 }}><ActionButton variant="primary" full onClick={onOpen}>{!valid ? "필요한 매출 계산하기" : fill.missing.length > 0 ? "비어 있는 비용 입력하기" : "입력값 수정·다시 계산하기"} ›</ActionButton></div>
  </div>;
}
