import type { FoodCategoriesResponse, FoodMetric } from "../../lib/apiClient";
import { OVERLAY_Z_INDEX } from "../../lib/vizConfig";

const METRIC_OPTIONS: { value: FoodMetric; label: string }[] = [
  { value: "stores", label: "점포 수" },
  { value: "per_store_month", label: "점포당 월평균 매출" },
  { value: "sales_yoy_pct", label: "매출 증감률(전년 동기)" },
  { value: "sales_per_10k_flpop", label: "유동인구 대비 매출" },
  { value: "open_rate", label: "개업률" },
  { value: "close_rate", label: "폐업률" },
  { value: "frc_share", label: "프랜차이즈 비율" },
  { value: "stores_change_2y", label: "점포 수 증감률(2년)" },
  { value: "stores_volatility", label: "점포수 변동성" },
];

interface FoodTopBarProps {
  categories: FoodCategoriesResponse | undefined;
  svc: string | null;
  onSvcChange: (svc: string | null) => void;
  scls: string | null;
  onSclsChange: (scls: string | null) => void;
  metric: FoodMetric;
  onMetricChange: (m: FoodMetric) => void;
  unitLabel: string;
  rebZonesVisible: boolean;
  onRebZonesVisibleChange: (v: boolean) => void;
}

/** 요식업·카페 전용 GNB — 업종(서울시 외식 10개) → 세부 업종(소상공인 소분류), 지표. */
export function FoodTopBar(p: FoodTopBarProps) {
  const group = p.categories?.groups.find((g) => g.svc_cd === p.svc);
  return (
    <div
      style={{
        position: "absolute", zIndex: OVERLAY_Z_INDEX + 1, top: 0, left: 0, right: 0, height: 56, background: "white",
        boxShadow: "0 1px 6px rgba(0,0,0,0.12)", display: "flex", alignItems: "center", gap: 10, padding: "0 16px",
      }}
    >
      <strong style={{ fontSize: 16, color: "#111827", whiteSpace: "nowrap" }}>상권분석 · 요식업</strong>
      <Select
        value={p.svc ?? ""}
        onChange={(v) => {
          p.onSvcChange(v || null);
          p.onSclsChange(null);
        }}
        options={[{ value: "", label: "외식 전체" }, ...(p.categories?.groups ?? []).map((g) => ({ value: g.svc_cd, label: `${g.svc_nm} (${g.store_count.toLocaleString()})` }))]}
      />
      <Select
        value={p.scls ?? ""}
        disabled={!group}
        title={group ? "세부 업종은 점포 수·매장 위치만 거릅니다(매출 지표는 서울시 업종 단위)" : "업종을 먼저 고르세요"}
        onChange={(v) => p.onSclsChange(v || null)}
        options={[{ value: "", label: group ? `${group.svc_nm} 전체` : "세부 업종" }, ...(group?.details ?? []).map((d) => ({ value: d.code, label: `${d.name} (${d.store_count})` }))]}
      />
      <Select value={p.metric} onChange={(v) => p.onMetricChange(v as FoodMetric)} options={METRIC_OPTIONS} />
      <span style={{ fontSize: 12, color: "#6B7280", whiteSpace: "nowrap" }}>지도 단위: {p.unitLabel}</span>
      <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, color: "#374151", cursor: "pointer", marginLeft: "auto" }}>
        <input type="checkbox" checked={p.rebZonesVisible} onChange={(e) => p.onRebZonesVisibleChange(e.target.checked)} />
        임대료(R-ONE)
      </label>
    </div>
  );
}

function Select({ value, onChange, options, disabled, title }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
  title?: string;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      title={title}
      onChange={(e) => onChange(e.target.value)}
      style={{
        maxWidth: 220, padding: "6px 10px", borderRadius: 6, border: "1px solid #e5e7eb",
        background: disabled ? "#f3f4f6" : "white", color: disabled ? "#9ca3af" : "#111827", fontSize: 13,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
