import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { MyStoreEntry } from "../../lib/monthlyCheck";
import { FS } from "../../lib/typography";

/** 월간 점검할 가게 고르기 — 지도에서 연 적 있는 내 가게(이름·동만 이 브라우저에 남겨 둔 것) 중에서 고른다. 없으면 검색으로 안내한다. */
export function MonthlyPicker({ stores, onPick, onSearch, onClose }: { stores: MyStoreEntry[]; onPick: (storeId: string) => void; onSearch: () => void; onClose: () => void }) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="월간 점검할 가게 고르기" style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 14, padding: 18, width: "min(420px, 100%)", maxHeight: "80vh", overflowY: "auto", fontSize: FS.body }}>
        <strong style={{ fontSize: FS.cardTitle }}>어느 가게를 점검할까요?</strong>
        {stores.length === 0 ? (
          <p style={{ color: "#4B5563", margin: "10px 0" }}>아직 이 브라우저에서 연 가게가 없어요. 먼저 내 가게를 검색해서 열어 주세요.</p>
        ) : (
          <ul style={{ listStyle: "none", margin: "10px 0", padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            {stores.slice(0, 8).map((s, i) => (
              <li key={s.storeId}>
                <button ref={i === 0 ? first : undefined} type="button" onClick={() => onPick(s.storeId)} style={{ width: "100%", textAlign: "left", padding: "9px 12px", border: "1px solid #BFDBFE", borderRadius: 10, background: "#EFF6FF", color: "#1E3A8A", fontWeight: 700, cursor: "pointer" }}>
                  {s.name}{s.dong ? <span style={{ fontWeight: 400, color: "#4B5563" }}> · {s.dong}</span> : null} ›
                </button>
              </li>
            ))}
          </ul>
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
          <button ref={stores.length === 0 ? first : undefined} type="button" onClick={onSearch} style={{ border: "none", background: "none", color: "#1D4ED8", textDecoration: "underline", cursor: "pointer", fontSize: FS.body, padding: 0 }}>내 가게 검색하러 가기</button>
          <button type="button" onClick={onClose} style={{ padding: "6px 12px", border: "1px solid #D1D5DB", borderRadius: 8, background: "white", cursor: "pointer" }}>닫기</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
