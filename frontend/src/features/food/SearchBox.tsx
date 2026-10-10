import { useEffect, useRef, useState } from "react";
import type { SearchKind, SearchResult } from "../../lib/apiClient";
import { OVERLAY_Z_INDEX } from "../../lib/vizConfig";
import { useSearch } from "./useFood";

const KIND_LABEL: Record<SearchKind, string> = { station: "역", trdar: "상권", dong: "행정동", address: "주소", store: "매장" };
const DEBOUNCE_MS = 250;

interface SearchBoxProps {
  onPick: (result: SearchResult) => void;
  /** 이미 고른 위치 이름 — 입력 칸에 보여 준다 */
  pickedName: string | null;
  onClear: () => void;
}

/** 주소·역명·상권·행정동·매장명 검색. 결과를 고르면 지도가 그 위치로 가고 관련 정보로 이어진다(MapPage). */
export function SearchBox({ onPick, pickedName, onClear }: SearchBoxProps) {
  const [text, setText] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const q = useSearch(debounced);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(text), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [text]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const results = q.data?.results ?? [];
  const typed = text.trim();
  const waiting = typed.length >= 2 && typed !== debounced.trim(); // 입력은 바뀌었는데 검색어가 아직 반영되지 않음 — 이전 결과를 현재 입력의 결과처럼 보이지 않게

  const pick = (r: SearchResult) => {
    setText(r.name);
    setDebounced("");
    setOpen(false);
    onPick(r);
  };

  return (
    <div ref={boxRef} style={{ position: "relative", width: 280 }}>
      <input
        type="search"
        value={text}
        placeholder={pickedName ? `검색 위치: ${pickedName}` : "주소·역·상권·매장 검색"}
        aria-label="위치·매장 검색"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setText(e.target.value);
          setActive(0);
          setOpen(true);
          if (pickedName) onClear();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          else if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, results.length - 1));
          else if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
          else if (e.key === "Enter" && !waiting && results[active]) pick(results[active]);
        }}
        style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", borderRadius: 6, border: "1px solid #D1D5DB", fontSize: 13 }}
      />
      {open && typed.length > 0 && (
        <div
          role="listbox"
          style={{
            position: "absolute", top: 40, left: 0, width: 380, maxHeight: 360, overflowY: "auto", background: "white", borderRadius: 8,
            boxShadow: "0 6px 20px rgba(0,0,0,0.2)", zIndex: OVERLAY_Z_INDEX + 3, fontSize: 13,
          }}
        >
          {typed.length < 2 && <Hint>2자 이상 입력하세요.</Hint>}
          {typed.length >= 2 && (waiting || q.isFetching) && <Hint>찾는 중...</Hint>}
          {typed.length >= 2 && !waiting && q.isError && (
            <Hint>
              검색에 실패했습니다: {q.error.message}{" "}
              <button type="button" onClick={() => void q.refetch()} style={{ border: "1px solid #DC2626", background: "white", color: "#DC2626", borderRadius: 4, cursor: "pointer" }}>
                다시 시도
              </button>
            </Hint>
          )}
          {typed.length >= 2 && !waiting && !q.isFetching && !q.isError && results.length === 0 && (
            <Hint>
              '{typed}'에 맞는 역·상권·행정동·주소·외식 매장이 없습니다. 다른 이름이나 도로명으로 찾아 보세요.
            </Hint>
          )}
          {!waiting &&
            results.map((r, i) => (
              <button
                key={`${r.kind}-${r.store_id ?? r.code ?? r.name}`}
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(r)}
                style={{ display: "block", width: "100%", textAlign: "left", border: "none", padding: "8px 12px", background: i === active ? "#EFF6FF" : "white", cursor: "pointer" }}
              >
                <span style={{ fontSize: 10, color: "white", background: "#6B7280", borderRadius: 4, padding: "1px 5px", marginRight: 6 }}>{KIND_LABEL[r.kind]}</span>
                <strong>{r.name}</strong>
                <div style={{ fontSize: 11, color: "#6B7280" }}>{r.subtitle}</div>
              </button>
            ))}
          {!waiting && q.data?.note && results.length > 0 && <div style={{ fontSize: 10, color: "#9CA3AF", padding: "6px 12px" }}>{q.data.note}</div>}
        </div>
      )}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: "10px 12px", color: "#6B7280", fontSize: 12 }}>{children}</div>;
}
