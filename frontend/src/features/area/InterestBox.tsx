import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NOTE_MAX, buildReviewRows, saveNote, type ReviewRow } from "../../lib/candidateReview";
import { MAX_FAVORITES, favKey, type FavoriteArea } from "../../lib/favorites";
import type { Mode } from "../../lib/mode";
import { ModalNav } from "../nav/ModalNav";
import { useOverlayBack } from "../nav/useOverlayBack";
import { CostCheckModal } from "./CostCheckModal";

const MAX_COMPARE = 4;

interface Props {
  mode: Mode;
  favorites: FavoriteArea[];
  industryName: (svc: string | null, scls: string | null) => string;
  /** 종합분석을 지도에서 연다(작업 화면은 닫힌다) */
  onOpenArea: (f: FavoriteArea) => void;
  /** 그 지역의 상권분석 보고서 */
  onReport: (f: FavoriteArea) => void;
  /** 고른 지역(2~4곳, 같은 단위)을 나란히 비교 */
  onCompare: (picked: FavoriteArea[]) => void;
  onRemove: (f: FavoriteArea) => void;
  /** 공유 주소 — 모드·지역·업종 코드만 든다(내 입력은 없음) */
  shareUrl: (f: FavoriteArea) => string;
  /** 처음부터 골라 둘 지역(예: 지도에서 '비교하기'로 들어온 경우) */
  initialPicked?: string[];
  onClose: () => void;
}

const manwon = (v: number) => `${Math.round(v).toLocaleString("ko-KR")}만원`;

/** 내 관심 지역 — 저장한 지역 목록 하나로 ① 최대 4곳 골라 나란히 비교 ② 지역별 상권분석 보고서 ③ 종합분석 다시 열기 ④ (예비 창업자) 비용 점검 ⑤ 짧은 메모 ⑥ 공유 주소를 모두 한다.
 * 예전의 '관심 지역 목록'·'지역 비교 담기'·'후보지 검토함'을 하나로 합쳤다. 저장 데이터(관심 지역·비용·메모)와 공유 주소 형식은 그대로다.
 * 후보는 담은 순서 그대로이고 점수·순위·추천은 없다. 모두 이 브라우저에만 저장된다. */
export function InterestBox({ mode, favorites, industryName, onOpenArea, onReport, onCompare, onRemove, shareUrl, initialPicked = [], onClose }: Props) {
  const founder = mode === "founder";
  const requestClose = useOverlayBack(onClose);
  const [tick, setTick] = useState(0);
  const [picked, setPicked] = useState<string[]>(() => initialPicked.slice(0, MAX_COMPARE));
  const [costFor, setCostFor] = useState<FavoriteArea | null>(null);
  const rows = useMemo(() => buildReviewRows(favorites), [favorites, tick]);   // eslint-disable-line react-hooks/exhaustive-deps -- tick 은 저장 뒤 다시 읽기용
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    back.current?.focus();
  }, []);

  const pickedFavs = favorites.filter((f) => picked.includes(favKey(f)));
  const level = pickedFavs[0]?.level;
  const blockFor = (f: FavoriteArea): string | null => {
    const k = favKey(f);
    if (picked.includes(k)) return null;
    if (picked.length >= MAX_COMPARE) return `비교는 최대 ${MAX_COMPARE}곳까지예요`;
    if (level && f.level !== level) return "행정동과 상권은 크기가 달라 섞어 비교하지 않아요";
    return null;
  };
  const toggle = (f: FavoriteArea) => setPicked((p) => (p.includes(favKey(f)) ? p.filter((x) => x !== favKey(f)) : [...p, favKey(f)]));

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="내 관심 지역" style={{ position: "fixed", inset: 0, zIndex: 1000, background: "#F3F4F6", overflowY: "auto", fontSize: 15 }}>
      <div style={{ position: "sticky", top: 0, zIndex: 2, background: "white", borderBottom: "1px solid #E5E7EB", padding: "10px 20px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <ModalNav onBack={requestClose} backRef={back} />
        <strong style={{ fontSize: 22 }}>내 관심 지역</strong>
        <span style={{ color: "#6B7280", fontSize: 13 }}>{favorites.length}/{MAX_FAVORITES}곳 · 담은 순서대로 · 점수·순위·추천은 없어요 · 이 브라우저에만 저장돼요</span>
      </div>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "16px 24px 32px" }}>
        {rows.length === 0 ? (
          <div style={{ background: "white", borderRadius: 12, padding: 20, lineHeight: 1.7 }}>
            아직 저장한 지역이 없어요. 지도에서 지역을 열어 <strong>☆ 내 관심 지역에 담기</strong>를 누르거나, {founder ? "'조건으로 후보 찾기'에서 담아 보세요." : "내 가게가 속한 지역을 열어 보세요."}
          </div>
        ) : (
          <>
            <div style={{ background: "white", borderRadius: 12, padding: "12px 16px", marginBottom: 14, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
              <div style={{ flex: "1 1 260px" }}>
                <strong style={{ fontSize: 17 }}>지역을 나란히 비교해 볼까요?</strong>
                <div style={{ fontSize: 13, color: "#4B5563" }}>아래에서 2~{MAX_COMPARE}곳을 고르세요(같은 단위끼리). 같은 업종·기간의 값만 견줘요. 지금 {pickedFavs.length}곳 선택.</div>
              </div>
              <button type="button" disabled={pickedFavs.length < 2} onClick={() => onCompare(pickedFavs)} style={{ minHeight: 44, padding: "8px 18px", border: "none", borderRadius: 10, background: pickedFavs.length < 2 ? "#9CA3AF" : "#1D4ED8", color: "white", fontWeight: 800, fontSize: 15, cursor: pickedFavs.length < 2 ? "not-allowed" : "pointer" }}>
                선택한 {pickedFavs.length}곳 비교하기 ›
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: 14, alignItems: "start" }}>
              {rows.map((r) => (
                <Card key={r.key} row={r} founder={founder} industry={industryName(r.fav.svc, r.fav.scls)} checked={picked.includes(r.key)} block={blockFor(r.fav)}
                  onToggle={() => toggle(r.fav)} onCost={() => setCostFor(r.fav)}
                  onOpenArea={() => onOpenArea(r.fav)} onReport={() => onReport(r.fav)} onRemove={() => { setPicked((p) => p.filter((x) => x !== r.key)); onRemove(r.fav); }}
                  shareUrl={shareUrl(r.fav)} onSaved={() => setTick((t) => t + 1)} />
              ))}
            </div>
          </>
        )}
      </div>
      {costFor && <CostCheckModal unitKey={favKey(costFor)} unitName={costFor.name} unitWord={costFor.level === "dong" ? "행정동" : "상권"} scopeLabel={industryName(costFor.svc, costFor.scls)} benchWon={null} onClose={() => { setCostFor(null); setTick((t) => t + 1); }} />}
    </div>,
    document.body,
  );
}

function Card({ row, founder, industry, checked, block, onToggle, onCost, onOpenArea, onReport, onRemove, shareUrl, onSaved }: {
  row: ReviewRow; founder: boolean; industry: string; checked: boolean; block: string | null; shareUrl: string;
  onToggle: () => void; onCost: () => void; onOpenArea: () => void; onReport: () => void; onRemove: () => void; onSaved: () => void;
}) {
  const f = row.fav;
  const unitWord = f.level === "dong" ? "행정동" : "상권";
  const [note, setNote] = useState(row.note);
  const [failed, setFailed] = useState(false);
  const [share, setShare] = useState<{ copied: boolean } | null>(null);
  const c = row.cost;
  const copy = async () => {
    let copied = false;
    try { await navigator.clipboard.writeText(shareUrl); copied = true; } catch { /* 클립보드가 막히면 아래 칸에서 직접 복사 */ }
    setShare({ copied });
  };
  return (
    <section style={{ background: "white", borderRadius: 12, padding: "14px 16px", boxShadow: "0 1px 4px rgba(0,0,0,0.08)", outline: checked ? "2px solid #1D4ED8" : "none" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
        <strong style={{ fontSize: 17 }}>{f.name}</strong>
        <span style={{ fontSize: 13, color: "#6B7280" }}>{f.type ?? unitWord} · {industry}</span>
      </div>
      <label title={block ?? undefined} style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, fontSize: 14.5, fontWeight: 600, color: block && !checked ? "#9CA3AF" : "#1E3A8A", cursor: block && !checked ? "not-allowed" : "pointer" }}>
        <input type="checkbox" checked={checked} disabled={block !== null && !checked} onChange={onToggle} style={{ width: 18, height: 18 }} />
        비교에 넣기
        {block && !checked && <span style={{ fontWeight: 400, fontSize: 12.5, color: "#B45309" }}>{block}</span>}
      </label>

      <button type="button" onClick={onReport} style={{ width: "100%", marginTop: 10, minHeight: 44, padding: "8px 12px", border: "none", borderRadius: 10, background: "#C2410C", color: "white", fontWeight: 800, fontSize: 15, cursor: "pointer", textAlign: "left" }}>
        상권분석 보고서 보기 ›
        <span style={{ display: "block", fontSize: 12.5, fontWeight: 500, opacity: 0.9 }}>{unitWord} 전체 · {founder ? "예비 창업자용" : "자영업자용"} · 지역 보고서</span>
      </button>
      <Line label="종합분석" value="성장성·경쟁·수요·입지를 지도와 함께" action="열기 ›" onClick={onOpenArea} />
      {founder && (
        <>
          <Line label="비용 시뮬레이션"
            value={c === null ? "아직 안 했어요" : c.bepMan === null ? "입력은 있지만 계산을 보류했어요" : `손익분기 ${manwon(c.bepMan)}${c.profitMan !== null ? ` · 예상 영업손익 ${c.profitMan < 0 ? "-" : ""}${manwon(Math.abs(c.profitMan))}` : ""}`}
            action={c === null ? "시작 ›" : "이어서 ›"} onClick={onCost} />
        </>
      )}

      <label style={{ display: "block", fontSize: 13.5, fontWeight: 600, marginTop: 10 }}>
        메모
        <textarea value={note} maxLength={NOTE_MAX} rows={2} placeholder={founder ? "예: 역에서 도보 3분, 임대 조건 재확인" : "예: 우리 가게와 같은 동"}
          onChange={(e) => { const v = e.target.value.slice(0, NOTE_MAX); setNote(v); setFailed(!saveNote(favKey(f), v)); onSaved(); }}
          style={{ display: "block", width: "100%", boxSizing: "border-box", marginTop: 3, padding: "6px 8px", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 16, resize: "vertical" }} />
      </label>
      {failed && <div style={{ fontSize: 12.5, color: "#92400E" }}>이 브라우저가 저장을 막아 메모가 새로고침하면 사라집니다.</div>}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
        <button type="button" onClick={() => void copy()} style={mini}>공유 링크 복사</button>
        <button type="button" onClick={onRemove} style={{ ...mini, color: "#991B1B", borderColor: "#FCA5A5" }}>빼기</button>
      </div>
      {share && (
        <div style={{ marginTop: 6 }}>
          <div role="status" style={{ fontSize: 12.5, color: share.copied ? "#047857" : "#92400E" }}>{share.copied ? "링크를 복사했어요. 주소에는 모드·지역·업종만 들어 있고 메모·비용은 없어요." : "자동 복사가 막혀 있어요. 아래 주소를 직접 복사하세요."}</div>
          <input readOnly value={shareUrl} aria-label="공유 주소" onFocus={(e) => e.currentTarget.select()} style={{ width: "100%", boxSizing: "border-box", fontSize: 12.5, padding: "4px 6px", border: "1px solid #D1D5DB", borderRadius: 4 }} />
        </div>
      )}
    </section>
  );
}

function Line({ label, value, action, onClick }: { label: string; value: string; action: string; onClick: () => void }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", borderTop: "1px solid #F3F4F6", padding: "8px 0 0", marginTop: 8 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, color: "#6B7280" }}>{label}</div>
        <div style={{ fontSize: 14.5, fontWeight: 600 }}>{value}</div>
      </div>
      <button type="button" onClick={onClick} style={{ flexShrink: 0, minHeight: 36, padding: "4px 12px", border: "1px solid #BFDBFE", borderRadius: 8, background: "#EFF6FF", color: "#1E3A8A", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>{action}</button>
    </div>
  );
}

const mini: React.CSSProperties = { minHeight: 36, padding: "4px 12px", border: "1px solid #D1D5DB", borderRadius: 8, background: "white", color: "#374151", fontSize: 14, cursor: "pointer" };
