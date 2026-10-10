import type { ReactNode } from "react";
import { Drawer } from "./Drawer";

export interface InfoRow {
  label: string;
  value: string;
}

interface InfoPanelProps {
  title: string;
  brief: string;
  rows: InfoRow[];
  onClose: () => void;
  children?: ReactNode;
}

/** 버블·임대료 마커를 눌렀을 때의 서랍 내용: [3초 브리핑] -> [핵심 지표 카드] -> (확대·비교·매장 목록 등 children) -> [리포트 안내]. */
export function InfoPanel({ title, brief, rows, onClose, children }: InfoPanelProps) {
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

      {children}

      <div style={{ marginTop: 16, fontSize: 12, color: "#6B7280", background: "#F9FAFB", borderRadius: 8, padding: "8px 10px" }}>
        목록에서 매장을 고르면 '상권 운영 점검'를 볼 수 있어요.
      </div>
    </Drawer>
  );
}
