import { useState } from "react";
import { GLOSSARY, type GlossaryKey } from "../lib/glossary";

/** 어려운 말 옆의 '?' 버튼 — 눌러서 한두 문장 풀이를 펼친다(마우스 올리기에만 기대지 않아 휴대폰·키보드에서도 된다). */
export function Term({ id, label }: { id: GlossaryKey; label?: string }) {
  const [open, setOpen] = useState(false);
  const g = GLOSSARY[id];
  return (
    <span>
      {label ?? g.term}
      <button
        type="button"
        aria-label={`${g.term} 설명 ${open ? "닫기" : "보기"}`}
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        style={{
          marginLeft: 3,
          width: 14,
          height: 14,
          padding: 0,
          border: "1px solid #9CA3AF",
          borderRadius: "50%",
          background: open ? "#E5E7EB" : "#fff",
          color: "#6B7280",
          fontSize: 9,
          lineHeight: "12px",
          cursor: "pointer",
          verticalAlign: "middle",
        }}
      >
        ?
      </button>
      {open && (
        <span role="note" style={{ display: "block", marginTop: 2, fontSize: 11, lineHeight: 1.5, color: "#374151", background: "#F3F4F6", borderRadius: 6, padding: "4px 8px" }}>
          {g.help}
        </span>
      )}
    </span>
  );
}
