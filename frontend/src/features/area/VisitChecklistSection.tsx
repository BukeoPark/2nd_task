import { useState } from "react";
import { Notice } from "../../components/Notice";
import { MEMO_MAX, VISIT_ITEMS, doneCount, emptyVisit, loadVisit, saveVisit, type VisitState } from "../../lib/visitChecklist";

/** 예비 창업자 '현장 답사 체크리스트' — 지역별로 체크 상태와 짧은 메모만 이 브라우저에 저장한다(사진·계정·서버 저장 없음). */
export function VisitChecklistSection({ level, code, unitWord, onShowStores, onChange }: { level: "dong" | "trdar"; code: string; unitWord: string; onShowStores?: () => void; /** 저장할 때마다 알린다(검토함이 답사 진행을 다시 읽도록) */ onChange?: () => void }) {
  const [state, setState] = useState<VisitState>(() => loadVisit(level, code));
  const [saveFailed, setSaveFailed] = useState(false);
  const [openMemo, setOpenMemo] = useState<string | null>(null);
  const update = (next: VisitState) => {
    setState(next);
    setSaveFailed(!saveVisit(level, code, next));
    onChange?.();
  };
  const toggle = (id: string) => update({ ...state, checked: { ...state.checked, [id]: !state.checked[id] } });
  const setMemo = (id: string, v: string) => update({ ...state, memo: { ...state.memo, [id]: v.slice(0, MEMO_MAX) } });
  const done = doneCount(state);
  return (
    <div>
      <Notice tone="info">
        숫자로 보이지 않는 것을 직접 가서 확인하는 목록입니다. 체크와 메모는 이 {unitWord}별로 <strong>이 브라우저에만</strong> 저장되며 서버로 보내지 않습니다(사진 첨부는 지원하지 않아요).
      </Notice>
      <div role="status" style={{ fontSize: 13, fontWeight: 600, margin: "10px 0 6px" }}>{done}/{VISIT_ITEMS.length}개 확인함</div>
      {saveFailed && <div style={{ marginBottom: 6 }}><Notice tone="warn">이 브라우저가 저장을 막아 체크·메모가 새로고침하면 사라집니다.</Notice></div>}
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        {VISIT_ITEMS.map((it) => {
          const memo = state.memo[it.id] ?? "";
          const open = openMemo === it.id;
          return (
            <li key={it.id} style={{ border: "1px solid #E5E7EB", borderRadius: 8, padding: "6px 10px", background: state.checked[it.id] ? "#F0FDF4" : "white" }}>
              <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}>
                <input type="checkbox" checked={Boolean(state.checked[it.id])} onChange={() => toggle(it.id)} style={{ marginTop: 3 }} />
                <span>
                  <strong style={{ fontSize: 15 }}>{it.title}</strong>
                  <span style={{ display: "block", fontSize: 12.5, color: "#6B7280", lineHeight: 1.4 }}>{it.hint}</span>
                </span>
              </label>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginLeft: 24, marginTop: 2 }}>
                <button type="button" aria-expanded={open} onClick={() => setOpenMemo(open ? null : it.id)} style={linkBtn}>
                  {open ? "메모 접기" : memo.trim() ? "메모 보기" : "+ 메모"}
                </button>
                {it.id === "rivals" && onShowStores && <button type="button" onClick={onShowStores} style={linkBtn}>이 {unitWord}의 매장 목록 ›</button>}
                {!open && memo.trim() && <span style={{ fontSize: 12.5, color: "#4B5563", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>{memo}</span>}
              </div>
              {open && (
                <div style={{ marginLeft: 24, marginTop: 4 }}>
                  <textarea
                    aria-label={`${it.title} 메모`}
                    value={memo}
                    onChange={(e) => setMemo(it.id, e.target.value)}
                    maxLength={MEMO_MAX}
                    rows={2}
                    placeholder="간단한 메모(선택)"
                    style={{ display: "block", width: "100%", boxSizing: "border-box", padding: "4px 8px", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 16, resize: "vertical" }}
                  />
                  <div style={{ fontSize: 12, color: "#6B7280" }}>{memo.length}/{MEMO_MAX}자</div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {(done > 0 || Object.values(state.memo).some((m) => m.trim() !== "")) && (
        <button type="button" onClick={() => update(emptyVisit())} style={{ marginTop: 10, padding: "5px 10px", border: "1px solid #FCA5A5", borderRadius: 6, background: "white", color: "#991B1B", cursor: "pointer", fontSize: 13 }}>
          이 {unitWord}의 체크·메모 모두 지우기
        </button>
      )}
    </div>
  );
}

const linkBtn: React.CSSProperties = { padding: "2px 0", border: "none", background: "none", color: "#1D4ED8", cursor: "pointer", fontSize: 12.5, textDecoration: "underline" };
