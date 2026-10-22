// 분석 패널 조각(components/PanelKit)이 쓰는 색·간격·격자 — 컴포넌트가 아닌 값은 여기에 둔다(빠른 새로고침이 컴포넌트 파일만 있어야 동작).
// typography(글자 크기)만 import 한다.
import type { CSSProperties } from "react";
import { FS } from "./typography.ts";

export const PK = {
  ink: "#111827",
  sub: "#374151",
  mute: "#6B7280",
  warn: "#B45309",
  missing: "#9CA3AF",
  line: "#E5E7EB",
  faint: "#F3F4F6",
  soft: "#F9FAFB",
} as const;

/** 블록 사이의 세로 간격 */
export const BLOCK_GAP = 16;

/** 숫자 칸을 나란히 놓는 격자 */
export const grid2: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 10 };
export const grid3: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 };

/** 입력칸 — 휴대폰 자동 확대를 막으려고 16px. 이름표(label)는 labelStyle. */
export const inputStyle: CSSProperties = { display: "block", width: "100%", boxSizing: "border-box", marginTop: 4, padding: "8px 10px", border: `1px solid ${PK.line}`, borderRadius: 8, fontSize: FS.input, color: PK.ink, background: "#fff" };
export const labelStyle: CSSProperties = { display: "block", fontSize: FS.warn, fontWeight: 600, color: PK.sub };
