import type { FoodCategoriesResponse, FoodMetric, SearchResult } from "../../lib/apiClient";
import { MODES, MODE_HINT, MODE_LABEL, type Mode } from "../../lib/mode";
import { SearchBox } from "./SearchBox";
import { OVERLAY_Z_INDEX } from "../../lib/vizConfig";

const METRIC_OPTIONS: { value: FoodMetric; label: string }[] = [
  { value: "stores", label: "점포 수" },
  { value: "per_store_month", label: "점포당 월평균 추정매출" },
  { value: "sales_yoy_pct", label: "총매출 증감률(전년 동기·명목)" },
  { value: "sales_per_10k_flpop", label: "유동인구 대비 매출" },
  { value: "open_rate", label: "개업률" },
  { value: "close_rate", label: "폐업률" },
  { value: "frc_share", label: "프랜차이즈 비율" },
  { value: "starbucks_zone_share", label: "스세권 매장 비율" },
  { value: "daiso_zone_share", label: "다세권 매장 비율" },
  { value: "stores_change_2y", label: "점포 수 증감률(약 2년·7분기)" },
  { value: "stores_volatility", label: "점포 수 변동성" },
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
  onPickPlace: (r: SearchResult) => void;
  pickedPlaceName: string | null;
  onClearPlace: () => void;
  mode: Mode;
  onModeChange: (m: Mode) => void;
  /** 도움말 — 튜토리얼 다시 보기 */
  onHelp: () => void;
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
      <ModeSwitch mode={p.mode} onChange={p.onModeChange} />
      <SearchBox onPick={p.onPickPlace} pickedName={p.pickedPlaceName} onClear={p.onClearPlace} mode={p.mode} />
      <Select
        tour="svc"
        label="업종"
        value={p.svc ?? ""}
        onChange={(v) => {
          p.onSvcChange(v || null);
          p.onSclsChange(null);
        }}
        options={[{ value: "", label: "외식 전체" }, ...(p.categories?.groups ?? []).map((g) => ({ value: g.svc_cd, label: `${g.svc_nm} (${g.store_count.toLocaleString()})` }))]}
      />
      <Select
        tour="scls"
        label="세부 업종"
        value={p.scls ?? ""}
        disabled={!group}
        title={group ? "세부 업종은 점포 수·매장 위치에만 적용됩니다. 매출 지표가 어느 업종 기준인지는 범례와 요약 패널에 항상 표시됩니다." : "업종을 먼저 고르세요"}
        onChange={(v) => p.onSclsChange(v || null)}
        options={[{ value: "", label: group ? `${group.svc_nm} 전체` : "세부 업종" }, ...(group?.details ?? []).map((d) => ({ value: d.code, label: `${d.name} (${d.store_count})` }))]}
      />
      <Select tour="metric" label="지도 지표" value={p.metric} onChange={(v) => p.onMetricChange(v as FoodMetric)} options={METRIC_OPTIONS} />
      <span style={{ fontSize: 12, color: "#6B7280", whiteSpace: "nowrap" }}>지도 단위: {p.unitLabel}</span>
      <button type="button" data-tour="help" onClick={p.onHelp} style={{ marginLeft: "auto", padding: "6px 10px", border: "1px solid #D1D5DB", borderRadius: 8, background: "white", color: "#374151", fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
        <span aria-hidden="true">? </span>도움말
      </button>
    </div>
  );
}

/** 자영업자 / 예비 창업자 — 모드에 따라 이용 순서 안내와 매장 상세의 구성이 달라진다. */
function ModeSwitch({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div data-tour="mode" role="radiogroup" aria-label="이용 모드" style={{ display: "inline-flex", border: "1px solid #D1D5DB", borderRadius: 8, overflow: "hidden", flexShrink: 0 }}>
      {MODES.map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={m === mode}
          title={MODE_HINT[m]}
          onClick={() => onChange(m)}
          style={{ padding: "6px 10px", border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: m === mode ? 700 : 500, background: m === mode ? "#1D4ED8" : "white", color: m === mode ? "white" : "#374151", whiteSpace: "nowrap" }}
        >
          {MODE_LABEL[m]}
        </button>
      ))}
    </div>
  );
}

function Select({ label, value, onChange, options, disabled, title, tour }: {
  /** 튜토리얼이 이 칸을 가리킬 때 쓰는 이름(data-tour) */
  tour?: string;
  /** 화면에는 보이지 않지만 스크린리더가 '무엇을 고르는 칸인지' 읽는 이름 — 이게 없으면 현재 선택값만 읽힌다 */
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
  title?: string;
}) {
  return (
    <select
      data-tour={tour}
      aria-label={label}
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
