import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { SearchKind, SearchResult } from "../../lib/apiClient";
import type { Mode } from "../../lib/mode";
import { addRecent, groupByKind, highlight, parseRecent, RECENT_KEY } from "../../lib/searchUi";
import { glyphFor } from "../../lib/storeGlyph";
import { useNarrow } from "../../lib/useNarrow";
import { OVERLAY_Z_INDEX } from "../../lib/vizConfig";
import { useSearch } from "./useFood";

const KIND_LABEL: Record<SearchKind, string> = { station: "역", trdar: "상권", dong: "행정동", address: "주소", store: "매장", brand: "여러 지점" };
const KIND_ICON: Record<Exclude<SearchKind, "store">, string> = { station: "🚇", trdar: "📍", dong: "🏘️", address: "🏠", brand: "🗺️" };
const DEBOUNCE_MS = 200;
const EXAMPLES = ["본죽", "영등포역", "문래동", "당산로 132"];

interface SearchBoxProps {
  onPick: (result: SearchResult, typed: string) => void;
  /** 이미 고른 위치 이름 — 입력 칸에 보여 준다 */
  pickedName: string | null;
  onClear: () => void;
  mode: Mode;
}

function loadRecent(): string[] {
  try { return parseRecent(localStorage.getItem(RECENT_KEY)); } catch { return []; }
}
function saveRecent(list: string[]) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* 저장이 막혀도 검색은 된다 */ }
}

/** 주소·역명·상권·행정동·매장명 검색. 입력하는 동안 아래에 바로 후보가 뜨고(일치한 글자 강조·종류별 묶음), 같은 이름의 매장이 여러 곳이면 '지도에 모두 보기'가 나온다.
 * 비어 있을 때는 최근 검색어와 예시를 보여 주고, 위·아래 화살표·Enter·Esc 로 키보드만으로도 고를 수 있다. */
export function SearchBox({ onPick, pickedName, onClear, mode }: SearchBoxProps) {
  const narrow = useNarrow();
  const wideBar = typeof window !== "undefined" && window.matchMedia("(min-width: 1600px)").matches;   // 좁은 PC 화면에서는 검색창을 줄여 상단 메뉴가 잘리지 않게 한다
  const listId = useId();
  const [text, setText] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<string[]>(loadRecent);
  // 상단바는 옆으로 밀리며 아래·위를 잘라내므로(overflow) 후보 목록은 화면에 고정(fixed)해 그 밖으로 꺼낸다.
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
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
  const showResults = typed.length >= 2 && !waiting && !q.isFetching && !q.isError && results.length > 0;

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = boxRef.current?.getBoundingClientRect();
      if (r) setPos((p) => (p.left === r.left && p.top === r.bottom + 6 ? p : { left: r.left, top: r.bottom + 6 }));
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open]);

  useEffect(() => {
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, listId, showResults]);

  const remember = (term: string) => {
    const next = addRecent(recent, term);
    setRecent(next);
    saveRecent(next);
  };

  const pick = (r: SearchResult) => {
    const label = r.kind === "brand" ? typed : r.name;
    remember(label);
    setText(label);
    setDebounced("");
    setOpen(false);
    inputRef.current?.blur();
    onPick(r, typed);
  };

  const fill = (term: string) => {
    setText(term);
    setDebounced(term);
    setActive(0);
    setOpen(true);
    inputRef.current?.focus();
  };

  const clearAll = () => {
    setText("");
    setDebounced("");
    setActive(0);
    if (pickedName) onClear();
    inputRef.current?.focus();
  };

  const forget = (term: string | null) => {
    const next = term === null ? [] : recent.filter((x) => x !== term);
    setRecent(next);
    saveRecent(next);
  };

  const groups = groupByKind(results);
  const moreStores = (q.data?.counts.store ?? 0) - results.filter((r) => r.kind === "store").length;

  return (
    <div data-tour="search" ref={boxRef} style={{ position: "relative", width: narrow ? 190 : wideBar ? 280 : 210, flexShrink: 0 }}>
      <span aria-hidden style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", fontSize: 13, opacity: 0.55, pointerEvents: "none" }}>🔍</span>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showResults ? `${listId}-${active}` : undefined}
        autoComplete="off"
        value={text}
        placeholder={pickedName ? `검색 위치: ${pickedName}` : mode === "owner" ? "내 가게 이름·주소 검색" : "관심 지역·역·상권 검색"}
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
          else if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, Math.max(results.length - 1, 0))); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter" && showResults && results[active]) pick(results[active]);
        }}
        style={{ width: "100%", boxSizing: "border-box", padding: "7px 28px 7px 28px", borderRadius: 6, border: "1px solid #D1D5DB", fontSize: 13 }}
      />
      {text !== "" && (
        <button type="button" aria-label="검색어 지우기" onClick={clearAll} style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", border: "none", background: "transparent", color: "#6B7280", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "4px 6px" }}>×</button>
      )}
      {open && (
        <div
          id={listId}
          role="listbox"
          style={{
            position: "fixed", top: pos.top, left: Math.max(8, Math.min(pos.left, window.innerWidth - (narrow ? 340 : 400) - 8)), width: narrow ? "min(340px, calc(100vw - 16px))" : 400, maxHeight: "min(440px, calc(100vh - 120px))", overflowY: "auto", background: "white", borderRadius: 10,
            boxShadow: "0 8px 28px rgba(0,0,0,0.25)", zIndex: OVERLAY_Z_INDEX + 3, fontSize: 13, color: "#111827",
          }}
        >
          {typed.length === 0 && (
            <div style={{ padding: "10px 12px 12px" }}>
              {recent.length > 0 && (
                <>
                  <GroupHead right={<button type="button" onClick={() => forget(null)} style={linkBtn}>모두 지우기</button>}>최근 검색</GroupHead>
                  {recent.map((t) => (
                    <div key={t} style={{ display: "flex", alignItems: "center" }}>
                      <button type="button" onClick={() => fill(t)} style={{ ...rowBtn, flex: 1, padding: "6px 8px" }}><span aria-hidden style={{ marginRight: 8, opacity: 0.6 }}>🕘</span>{t}</button>
                      <button type="button" aria-label={`${t} 최근 검색에서 지우기`} onClick={() => forget(t)} style={{ ...linkBtn, padding: "4px 8px", fontSize: 15 }}>×</button>
                    </div>
                  ))}
                </>
              )}
              <GroupHead>이렇게 찾아 보세요</GroupHead>
              <div style={{ fontSize: 12, color: "#4B5563", lineHeight: 1.6 }}>가게 이름, 역 이름, 지역(행정동·상권), 도로명 주소로 찾을 수 있어요.</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {EXAMPLES.map((t) => (
                  <button key={t} type="button" onClick={() => fill(t)} style={{ border: "1px solid #D1D5DB", background: "#F9FAFB", borderRadius: 999, padding: "4px 10px", fontSize: 12, cursor: "pointer", color: "#374151" }}>{t}</button>
                ))}
              </div>
            </div>
          )}
          {typed.length === 1 && <Hint>한 글자만 더 입력하세요. (2자 이상)</Hint>}
          {typed.length >= 2 && (waiting || q.isFetching) && (
            <div aria-live="polite" style={{ padding: "10px 12px" }}>
              <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 8 }}>'{typed}' 찾는 중…</div>
              {[70, 55, 62].map((w) => <div key={w} style={{ height: 12, width: `${w}%`, background: "#E5E7EB", borderRadius: 4, margin: "8px 0" }} />)}
            </div>
          )}
          {typed.length >= 2 && !waiting && q.isError && (
            <Hint>
              검색에 실패했어요: {q.error.message}{" "}
              <button type="button" onClick={() => void q.refetch()} style={{ border: "1px solid #DC2626", background: "white", color: "#DC2626", borderRadius: 4, cursor: "pointer" }}>다시 시도</button>
            </Hint>
          )}
          {typed.length >= 2 && !waiting && !q.isFetching && !q.isError && results.length === 0 && (
            <div style={{ padding: "12px" }}>
              <div style={{ fontWeight: 700 }}>'{typed}'에 맞는 결과가 없어요</div>
              <div style={{ fontSize: 12, color: "#4B5563", lineHeight: 1.6, marginTop: 4 }}>철자를 확인하거나 더 짧게 입력해 보세요. 가게 이름 대신 도로명(예: 당산로 132)이나 지역 이름으로도 찾을 수 있어요. 찾는 범위는 양천구·영등포구 외식 매장이에요.</div>
            </div>
          )}
          {showResults && groups.map((g) => (
            <div key={g.kind}>
              <GroupHead pad>{KIND_LABEL[g.kind as SearchKind]}</GroupHead>
              {g.items.map(({ item: r, index: i }) => (
                <ResultRow key={`${r.kind}-${r.store_id ?? r.code ?? r.name}`} id={`${listId}-${i}`} r={r} typed={typed} active={i === active} onHover={() => setActive(i)} onPick={() => pick(r)} />
              ))}
            </div>
          ))}
          {showResults && moreStores > 0 && (
            <div style={{ padding: "6px 12px", fontSize: 11.5, color: "#4B5563", background: "#F9FAFB" }}>매장 {moreStores.toLocaleString("ko-KR")}곳이 더 있어요 — 지점명이나 지역을 덧붙이면 좁혀져요.</div>
          )}
          {showResults && !narrow && (
            <div style={{ padding: "6px 12px", fontSize: 11, color: "#6B7280", borderTop: "1px solid #F3F4F6" }}>↑↓ 이동 · Enter 선택 · Esc 닫기</div>
          )}
        </div>
      )}
    </div>
  );
}

function ResultRow({ id, r, typed, active, onHover, onPick }: { id: string; r: SearchResult; typed: string; active: boolean; onHover: () => void; onPick: () => void }) {
  const brand = r.kind === "brand";
  const icon = r.kind === "store" ? glyphFor(r.svc).glyph : KIND_ICON[r.kind];
  const title = brand ? <>'<Marked text={typed} q={typed} />' 매장 <b style={{ color: "#1D4ED8" }}>{(r.count ?? 0).toLocaleString("ko-KR")}곳</b> 모두 보기</> : <Marked text={r.name} q={typed} />;
  return (
    <button
      id={id}
      type="button"
      role="option"
      aria-selected={active}
      onMouseEnter={onHover}
      onClick={onPick}
      style={{ ...rowBtn, display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: active ? "#EFF6FF" : brand ? "#F5F8FF" : "white", borderLeft: active ? "3px solid #1D4ED8" : "3px solid transparent" }}
    >
      <span aria-hidden style={{ width: 28, height: 28, flexShrink: 0, borderRadius: 8, background: brand ? "#DBEAFE" : "#F3F4F6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontFamily: '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif' }}>{icon}</span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
        <span style={{ display: "block", fontSize: 11.5, color: "#4B5563", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.subtitle}</span>
      </span>
    </button>
  );
}

function Marked({ text, q }: { text: string; q: string }) {
  return <>{highlight(text, q).map((s, i) => (s.hit ? <mark key={i} style={{ background: "#FEF08A", color: "inherit", borderRadius: 2, padding: 0 }}>{s.text}</mark> : <span key={i}>{s.text}</span>))}</>;
}

function GroupHead({ children, right, pad }: { children: ReactNode; right?: ReactNode; pad?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, fontWeight: 700, color: "#6B7280", letterSpacing: "0.02em", margin: pad ? 0 : "8px 0 4px", padding: pad ? "8px 12px 2px" : 0 }}>
      <span>{children}</span>
      {right}
    </div>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <div style={{ padding: "10px 12px", color: "#4B5563", fontSize: 12 }}>{children}</div>;
}

const rowBtn: React.CSSProperties = { display: "block", width: "100%", textAlign: "left", border: "none", background: "transparent", cursor: "pointer", font: "inherit", color: "inherit" };
const linkBtn: React.CSSProperties = { border: "none", background: "transparent", color: "#6B7280", cursor: "pointer", fontSize: 11 };
