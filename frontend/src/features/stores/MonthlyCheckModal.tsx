import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Notice } from "../../components/Notice";
import { ModalNav } from "../nav/ModalNav";
import { useOverlayBack } from "../nav/useOverlayBack";
import { apiClient } from "../../lib/apiClient";
import { MONTHLY_ITEMS, MEMO_MAX, loadMonth, monthOf, monthlyDone, recordSummary, saveMonth, type MonthState } from "../../lib/monthlyCheck";
import type { StoreRecord } from "../../lib/myStoreStorage";
import { useNearbyAnalysis } from "./useStores";
import { FS } from "../../lib/typography";

interface Props {
  storeId: string;
  storeName: string;
  record: StoreRecord;
  onClose: () => void;
  /** 닫고 '내 가게'(기록 입력) 묶음으로 */
  onGoMine: () => void;
  /** 닫고 '주변'(경쟁 가게 목록) 묶음으로 */
  onGoRadius: () => void;
  /** 닫고 '상권'(시간대별 수요) 묶음으로 */
  onGoArea: () => void;
}

const manwon = (v: number) => `${Math.round(v).toLocaleString("ko-KR")}만원`;

/** 우리 가게 월간 점검 — 한 화면에서 ① 내 기록(월 매출·손익분기) ② 주변 경쟁 변화 ③ 상권 변화 ④ 이번 달 확인사항을 차례로 돌아본다.
 * 계산은 기존 손익분기·내 가게 기록·반경 인허가·동네 매출 비교를 그대로 읽고, 원인을 단정하거나 경영 처방을 내리지 않는다. 체크·메모는 이 브라우저에만 저장한다. */
export function MonthlyCheckModal({ storeId, storeName, record, onClose, onGoMine, onGoRadius, onGoArea }: Props) {
  const now = useMemo(() => new Date(), []);
  const month = monthOf(now);
  const sum = useMemo(() => recordSummary(record, now), [record, now]);
  const [state, setState] = useState<MonthState>(() => loadMonth(storeId, month));
  const [saveFailed, setSaveFailed] = useState(false);
  const nearby = useNearbyAnalysis(storeId, 500);
  const bench = useQuery({ queryKey: ["sales-benchmark", storeId], queryFn: () => apiClient.getSalesBenchmark(storeId), staleTime: 10 * 60 * 1000 });
  const back = useRef<HTMLButtonElement>(null);
  const requestClose = useOverlayBack(onClose);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    back.current?.focus();
    return () => { opener?.focus?.(); };
  }, []);

  const update = (next: MonthState) => { setState(next); setSaveFailed(!saveMonth(storeId, month, next)); };
  const done = monthlyDone(state, sum.hasThisMonth);
  const trend = nearby.data?.status === "ok" ? (nearby.data.trend ?? []).filter((t) => !t.partial_year && t.closed !== null).slice(-2) : [];
  const yoy = bench.data?.status === "ok" ? bench.data.growth?.yoy.total_sales : undefined;

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="우리 가게 월간 점검" style={{ position: "fixed", inset: 0, zIndex: 1000, background: "#F3F4F6", overflowY: "auto", fontSize: FS.body }}>
      <div style={{ position: "sticky", top: 0, zIndex: 2, background: "white", borderBottom: "1px solid #E5E7EB", padding: "10px 20px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <ModalNav onBack={requestClose} backRef={back} />
        <strong style={{ fontSize: FS.screenTitle }}>우리 가게 월간 점검</strong>
        <span style={{ color: "#6B7280", fontSize: FS.warn }}>{storeName} · {month}</span>
      </div>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "16px 24px 32px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: 14, alignItems: "start" }}>
        {/* ① 내 기록 */}
        <Card title="① 우리 가게 숫자는 어땠을까?" sub="내가 기록한 값 · 이 브라우저에만 저장돼요">
          {sum.months.length === 0 ? (
            <Notice tone="muted">아직 기록한 월 매출이 없어요(0원이라는 뜻이 아니에요). 기록하면 상권 같은 업종의 변화율과 견줄 수 있어요.</Notice>
          ) : (
            <>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                <Big label={`최근 기록(${sum.latest?.month})`} value={manwon(sum.latest?.value ?? 0)} />
                <Big label="직전 달 대비" value={sum.momPct === null ? "비교 불가" : `${sum.momPct > 0 ? "+" : ""}${sum.momPct.toFixed(1)}%`} note={sum.momPct === null ? "연속한 두 달이 기록돼야 비교해요" : undefined} />
              </div>
              <ul style={{ listStyle: "none", margin: "10px 0 0", padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 4, fontSize: FS.warn }}>
                {sum.months.map((m) => <li key={m.month}><span style={{ color: "#6B7280" }}>{m.month}</span> <strong>{manwon(m.value)}</strong></li>)}
              </ul>
            </>
          )}
          {sum.costsFilled > 0 ? (
            sum.bepMan !== null ? (
              <div style={{ marginTop: 10, background: "#F9FAFB", borderRadius: 10, padding: "8px 10px" }}>
                <div style={{ fontSize: FS.warn, color: "#4B5563" }}>손익분기 월매출 (입력한 비용 기준)</div>
                <div style={{ fontWeight: 800, fontSize: FS.metric, color: "#1D4ED8" }}>{manwon(sum.bepMan)}</div>
                {sum.profitMan !== null && sum.latest && <div style={{ fontSize: FS.warn }}>최근 기록({sum.latest.month}) 기준 예상 영업손익 <strong>{sum.profitMan < 0 ? "-" : ""}{manwon(Math.abs(sum.profitMan))}</strong></div>}
                <div style={{ fontSize: FS.caption, color: "#6B7280" }}>세금·대출 원리금은 '기타 고정비'에 넣은 만큼만 반영돼요.</div>
              </div>
            ) : <Notice tone="warn">입력한 비용으로는 손익분기를 계산하지 못했어요(비율이 100% 이상이거나 값이 올바르지 않아요).</Notice>
          ) : <div style={{ marginTop: 10 }}><Notice tone="muted">비용을 넣으면 손익분기 월매출을 계산해 드려요(비용 입력 없음).</Notice></div>}
          <button type="button" onClick={onGoMine} style={cta}>{sum.hasThisMonth ? "기록 고치거나 비용 바꾸기" : "이번 달 매출 기록하러 가기"} ›</button>
        </Card>

        {/* ② 주변 경쟁 변화 */}
        <Card title="② 주변 같은 업종 가게에 변화가 있었을까?" sub="반경 500m · 인허가 기록 기준">
          {nearby.isPending ? <Notice tone="muted">불러오는 중...</Notice> : nearby.data?.status !== "ok" ? (
            <Notice tone="muted">{nearby.data?.reason ?? "이 매장은 인허가 자료와 연결되지 않아 주변 변화를 보여 드릴 수 없어요(자료 없음)."}</Notice>
          ) : (
            <>
              <div style={{ fontSize: FS.body }}>영업 중으로 확인되는 같은 업종 인허가 <strong style={{ fontSize: FS.cardTitle }}>{nearby.data.active_count ?? "자료 없음"}{nearby.data.active_count != null ? "곳" : ""}</strong></div>
              {trend.length > 0 ? (
                <ul style={{ margin: "6px 0 0", paddingLeft: 18, lineHeight: 1.7 }}>
                  {trend.map((t) => <li key={t.year}>{t.year}년: 새로 열린 곳 {t.opened}곳 · 문 닫은 곳 {t.closed}곳</li>)}
                </ul>
              ) : <div style={{ fontSize: FS.warn, color: "#6B7280", marginTop: 4 }}>연도별 개폐업 기록이 충분하지 않아요.</div>}
              <div style={{ fontSize: FS.caption, color: "#6B7280", marginTop: 6 }}>인허가 기록 기준이라 실제 영업과 다를 수 있고, 이유는 이 자료로 알 수 없어요.</div>
            </>
          )}
          <button type="button" onClick={onGoRadius} style={cta}>가까운 경쟁 가게 목록 보기 ›</button>
        </Card>

        {/* ③ 상권 변화 */}
        <Card title="③ 우리 상권의 매출 흐름은 어땠을까?" sub="같은 업종 · 서울시 추정매출(카드 결제 기반)">
          {bench.isPending ? <Notice tone="muted">불러오는 중...</Notice> : !yoy || yoy.value === null ? (
            <Notice tone="muted">{yoy?.message ?? bench.data?.message ?? "상권 매출 변화를 계산할 자료가 없어요(분석 보류 또는 자료 없음)."}</Notice>
          ) : (
            <>
              <Big label="전년 같은 분기 대비 총매출" value={`${yoy.value > 0 ? "+" : ""}${yoy.value.toFixed(1)}%`} />
              <div style={{ fontSize: FS.caption, color: "#6B7280", marginTop: 4 }}>점포 수 변화가 섞인 값이고 물가는 보정하지 않았어요. 카드 결제 기반 추정이라 우리 가게의 실제 매출이 아니에요.{yoy.status === "caution" ? " 소규모 상권이라 값이 크게 흔들릴 수 있어요." : ""}</div>
            </>
          )}
          <button type="button" onClick={onGoArea} style={cta}>시간대별 상권 수요 보기 ›</button>
        </Card>

        {/* ④ 이번 달 확인사항 */}
        <Card title="④ 이번 달에 확인할 것" sub={`${done}/${MONTHLY_ITEMS.length}개 확인함`}>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {MONTHLY_ITEMS.map((it) => {
              const checked = it.id === "record" ? sum.hasThisMonth : state.done[it.id] === true;
              return (
                <li key={it.id} style={{ border: "1px solid #E5E7EB", borderRadius: 10, padding: "8px 10px", background: checked ? "#F0FDF4" : "white" }}>
                  <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: it.auto ? "default" : "pointer" }}>
                    <input type="checkbox" checked={checked} disabled={it.auto} onChange={() => update({ ...state, done: { ...state.done, [it.id]: !state.done[it.id] } })} style={{ marginTop: 3 }} />
                    <span><strong style={{ fontSize: FS.body }}>{it.title}</strong><span style={{ display: "block", fontSize: FS.caption, color: "#6B7280" }}>{it.hint}{it.auto ? " (이번 달 기록이 있으면 자동으로 확인돼요)" : ""}</span></span>
                  </label>
                </li>
              );
            })}
          </ul>
          <label style={{ display: "block", fontSize: FS.warn, fontWeight: 600, marginTop: 10 }}>
            이번 달 메모
            <textarea value={state.memo} maxLength={MEMO_MAX} rows={2} onChange={(e) => update({ ...state, memo: e.target.value.slice(0, MEMO_MAX) })} placeholder="예: 점심 세트 가격 점검" style={{ display: "block", width: "100%", boxSizing: "border-box", marginTop: 3, padding: "6px 8px", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: FS.input, resize: "vertical" }} />
          </label>
          <div style={{ fontSize: FS.caption, color: "#6B7280" }}>{state.memo.length}/{MEMO_MAX}자</div>
          {saveFailed && <div style={{ marginTop: 6 }}><Notice tone="warn">이 브라우저가 저장을 막아 체크·메모가 새로고침하면 사라집니다.</Notice></div>}
        </Card>
      </div>
    </div>,
    document.body,
  );
}

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section style={{ background: "white", borderRadius: 12, padding: "14px 16px", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
      <strong style={{ fontSize: FS.cardTitle }}>{title}</strong>
      {sub && <div style={{ fontSize: FS.caption, color: "#6B7280", marginBottom: 8 }}>{sub}</div>}
      <div style={{ marginTop: 6 }}>{children}</div>
    </section>
  );
}

function Big({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <div style={{ fontSize: FS.warn, color: "#4B5563" }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: FS.metric, lineHeight: 1.3 }}>{value}</div>
      {note && <div style={{ fontSize: FS.caption, color: "#6B7280" }}>{note}</div>}
    </div>
  );
}

const cta: React.CSSProperties = { marginTop: 12, padding: "7px 12px", border: "1px solid #BFDBFE", borderRadius: 8, background: "#EFF6FF", color: "#1E3A8A", fontWeight: 700, fontSize: FS.body, cursor: "pointer", textAlign: "left" };
