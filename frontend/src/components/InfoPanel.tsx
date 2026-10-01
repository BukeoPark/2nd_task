import type { ReactNode } from "react";
import { Drawer } from "./Drawer";

export interface InfoRow {
  label: string;
  value: string;
}

export interface TrendDot {
  quarter: string;
  label: string;
  color: string;
}

interface InfoPanelProps {
  title: string;
  brief: string;
  rows: InfoRow[];
  trend?: TrendDot[];
  onClose: () => void;
  children?: ReactNode;
}

/** 격자·행정동·상권 마커를 눌렀을 때의 서랍 내용: [3초 브리핑] -> [핵심 지표 카드] -> [상권 변화 추이] -> (매장 목록 등 children) -> [AI 리포트 버튼]. */
export function InfoPanel({ title, brief, rows, trend, onClose, children }: InfoPanelProps) {
  return (
    <Drawer title={title} onClose={onClose}>
      <div style={{ background: "#EFF6FF", color: "#1E3A8A", borderRadius: 8, padding: "10px 12px", marginBottom: 16 }}>{brief}</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
        {rows.map((row) => (
          <div key={row.label} style={{ background: "#F9FAFB", borderRadius: 8, padding: "8px 10px" }}>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>{row.label}</div>
            <div style={{ fontWeight: 600, color: "#111827" }}>{row.value}</div>
          </div>
        ))}
      </div>

      {trend && trend.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 6 }}>상권변화지표 추이(분기별 · 개폐업 흐름 기준, 매출 아님)</div>
          <div style={{ display: "flex", gap: 3 }}>
            {trend.map((dot) => (
              <span
                key={dot.quarter}
                title={`${dot.quarter} · ${dot.label}`}
                style={{ width: 14, height: 14, borderRadius: "50%", background: dot.color, opacity: 0.85 }}
              />
            ))}
          </div>
        </div>
      )}

      {children}

      <button
        type="button"
        disabled
        title="AI 창업 컨설팅 리포트 기능은 아직 준비 중입니다"
        style={{
          width: "100%",
          marginTop: 16,
          padding: "10px 0",
          borderRadius: 8,
          border: "1px solid #e5e7eb",
          background: "#F3F4F6",
          color: "#9ca3af",
          fontSize: 13,
          cursor: "not-allowed",
        }}
      >
        AI 창업 컨설팅 리포트 보기 (준비 중)
      </button>
    </Drawer>
  );
}
