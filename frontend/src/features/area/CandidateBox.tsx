import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NOTE_MAX, buildReviewRows, saveNote, type ReviewRow } from "../../lib/candidateReview";
import { favKey, type FavoriteArea } from "../../lib/favorites";
import { CostCheckModal } from "./CostCheckModal";
import { VisitChecklistSection } from "./VisitChecklistSection";

interface Props {
  favorites: FavoriteArea[];
  industryName: (svc: string | null, scls: string | null) => string;
  /** 비교에 담을 수 없는 이유(담을 수 있으면 null) */
  compareBlock: (f: FavoriteArea) => string | null;
  onOpenArea: (f: FavoriteArea) => void;
  onCompare: (f: FavoriteArea) => void;
  onRemove: (f: FavoriteArea) => void;
  onClose: () => void;
}

const manwon = (v: number) => `${Math.round(v).toLocaleString("ko-KR")}만원`;

/** 창업 후보지 검토함 — 담아 둔 후보마다 업종·상권 요약·비용 시뮬레이션·현장 답사·메모를 한 줄로 묶는다. 후보는 담은 순서 그대로이고 점수·순위·추천은 없다.
 * 새로 만드는 자료는 없고 기존 관심 지역·비용 점검·답사 체크리스트에 저장된 것을 읽는다(모두 이 브라우저에만). */
export function CandidateBox({ favorites, industryName, compareBlock, onOpenArea, onCompare, onRemove, onClose }: Props) {
  const [tick, setTick] = useState(0);
  const [costFor, setCostFor] = useState<FavoriteArea | null>(null);
  const [visitFor, setVisitFor] = useState<string | null>(null);
  const rows = useMemo(() => buildReviewRows(favorites), [favorites, tick]);   // eslint-disable-line react-hooks/exhaustive-deps -- tick 은 저장 뒤 다시 읽기용
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    back.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !costFor) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); opener?.focus?.(); };
  }, [onClose, costFor]);

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="창업 후보지 검토함" style={{ position: "fixed", inset: 0, zIndex: 1000, background: "#F3F4F6", overflowY: "auto", fontSize: 15 }}>
      <div style={{ position: "sticky", top: 0, zIndex: 2, background: "white", borderBottom: "1px solid #E5E7EB", padding: "10px 20px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button ref={back} type="button" onClick={onClose} style={{ border: "1px solid #3B82F6", background: "white", color: "#3B82F6", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontWeight: 600 }}>← 지도로 돌아가기</button>
        <strong style={{ fontSize: 22 }}>창업 후보지 검토함</strong>
        <span style={{ color: "#6B7280", fontSize: 13 }}>담은 순서대로 · 점수·순위·추천은 없어요 · 모두 이 브라우저에만 저장돼요</span>
      </div>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "16px 24px 32px" }}>
        {rows.length === 0 ? (
          <div style={{ background: "white", borderRadius: 12, padding: 20 }}>
            아직 담은 후보가 없어요. 지도에서 '조건으로 후보 찾기'를 하거나 지역을 열어 <strong>☆ 관심 지역에 담기</strong>를 누르세요.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: 14, alignItems: "start" }}>
            {rows.map((r) => (
              <Card key={r.key} row={r} industry={industryName(r.fav.svc, r.fav.scls)} block={compareBlock(r.fav)} showVisit={visitFor === r.key}
                onToggleVisit={() => setVisitFor(visitFor === r.key ? null : r.key)} onCost={() => setCostFor(r.fav)}
                onOpenArea={() => onOpenArea(r.fav)} onCompare={() => onCompare(r.fav)} onRemove={() => { onRemove(r.fav); }} onSaved={() => setTick((t) => t + 1)} />
            ))}
          </div>
        )}
      </div>
      {costFor && <CostCheckModal unitKey={favKey(costFor)} unitName={costFor.name} unitWord={costFor.level === "dong" ? "행정동" : "상권"} scopeLabel={industryName(costFor.svc, costFor.scls)} benchWon={null} onClose={() => { setCostFor(null); setTick((t) => t + 1); }} />}
    </div>,
    document.body,
  );
}

function Card({ row, industry, block, showVisit, onToggleVisit, onCost, onOpenArea, onCompare, onRemove, onSaved }: {
  row: ReviewRow; industry: string; block: string | null; showVisit: boolean;
  onToggleVisit: () => void; onCost: () => void; onOpenArea: () => void; onCompare: () => void; onRemove: () => void; onSaved: () => void;
}) {
  const f = row.fav;
  const [note, setNote] = useState(row.note);
  const [failed, setFailed] = useState(false);
  const c = row.cost;
  return (
    <section style={{ background: "white", borderRadius: 12, padding: "14px 16px", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
        <strong style={{ fontSize: 16 }}>{f.name}</strong>
        <span style={{ fontSize: 12.5, color: "#6B7280" }}>{f.type ?? (f.level === "dong" ? "행정동" : "상권")} · {industry}</span>
      </div>

      <Line label="상권 요약" value="업종 기준 요약·성장성·경쟁은 종합분석에서" action="종합분석 열기 ›" onClick={onOpenArea} />
      <Line label="비용 시뮬레이션"
        value={c === null ? "아직 안 했어요" : c.bepMan === null ? "입력은 있지만 계산을 보류했어요" : `손익분기 ${manwon(c.bepMan)}${c.profitMan !== null ? ` · 예상 영업손익 ${c.profitMan < 0 ? "-" : ""}${manwon(Math.abs(c.profitMan))}` : ""}`}
        action={c === null ? "비용 점검 시작 ›" : "비용 점검 이어서 ›"} onClick={onCost} />
      <Line label="현장 답사" value={`${row.visit.done}/${row.visit.total}개 확인`} action={showVisit ? "접기" : "체크리스트 열기 ›"} onClick={onToggleVisit} />
      {showVisit && <div style={{ marginTop: 8 }}><VisitChecklistSection level={f.level} code={f.code} unitWord={f.level === "dong" ? "행정동" : "상권"} onChange={onSaved} /></div>}

      <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginTop: 10 }}>
        이 후보 메모
        <textarea value={note} maxLength={NOTE_MAX} rows={2} placeholder="예: 역에서 도보 3분, 임대 조건 재확인"
          onChange={(e) => { const v = e.target.value.slice(0, NOTE_MAX); setNote(v); setFailed(!saveNote(favKey(f), v)); onSaved(); }}
          style={{ display: "block", width: "100%", boxSizing: "border-box", marginTop: 3, padding: "6px 8px", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 16, resize: "vertical" }} />
      </label>
      {failed && <div style={{ fontSize: 12.5, color: "#92400E" }}>이 브라우저가 저장을 막아 메모가 새로고침하면 사라집니다.</div>}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
        <button type="button" disabled={block !== null} title={block ?? undefined} onClick={onCompare} style={mini(block !== null)}>비교에 담기</button>
        <button type="button" onClick={onRemove} style={{ ...mini(false), color: "#991B1B", borderColor: "#FCA5A5" }}>검토함에서 빼기</button>
      </div>
      {block && <div style={{ fontSize: 12, color: "#B45309", marginTop: 2 }}>{block}</div>}
    </section>
  );
}

function Line({ label, value, action, onClick }: { label: string; value: string; action: string; onClick: () => void }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", borderTop: "1px solid #F3F4F6", padding: "8px 0 0", marginTop: 8 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, color: "#6B7280" }}>{label}</div>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{value}</div>
      </div>
      <button type="button" onClick={onClick} style={{ flexShrink: 0, padding: "4px 10px", border: "1px solid #BFDBFE", borderRadius: 8, background: "#EFF6FF", color: "#1E3A8A", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{action}</button>
    </div>
  );
}

const mini = (disabled: boolean): React.CSSProperties => ({ padding: "4px 10px", border: "1px solid #D1D5DB", borderRadius: 8, background: "white", color: disabled ? "#9CA3AF" : "#374151", fontSize: 13, cursor: disabled ? "not-allowed" : "pointer" });
