import type { FoodCategoriesResponse, FoodMetric, SearchResult } from "../../lib/apiClient";
import { MODES, MODE_HINT, MODE_LABEL, type Mode } from "../../lib/mode";
import { AppLink } from "../../components/AppLink";
import { HOME_PATH } from "../../lib/route";
import { useNarrow } from "../../lib/useNarrow";
import { useEffect, useState } from "react";
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
  onPickPlace: (r: SearchResult, typed: string) => void;
  pickedPlaceName: string | null;
  onClearPlace: () => void;
  mode: Mode;
  onModeChange: (m: Mode) => void;
  /** 도움말 — 튜토리얼 다시 보기 */
  onHelp: () => void;
  /** 내 관심 지역 — 저장한 곳 수와 작업 화면 열기(저장 목록·지역 비교·보고서·비용 점검·메모를 한곳에서) */
  interestCount: number;
  onOpenInterest: () => void;
  /** 자영업자 전용 메뉴 — 우리 가게 월간 점검(예비 창업자에게는 없다) */
  ownerMenu?: { label: string; onClick: () => void };
  /** 앱 안에서 이전 화면으로(되돌아갈 화면이 있을 때만 보인다) */
  onBack?: () => void;
}

function useWide(min: number): boolean {
  const q = `(min-width: ${min}px)`;
  const [on, setOn] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const f = () => setOn(m.matches);
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, [q]);
  return on;
}

/** 요식업·카페 전용 GNB — 업종(서울시 외식 10개) → 세부 업종(소상공인 소분류), 지표. */
export function FoodTopBar(p: FoodTopBarProps) {
  const group = p.categories?.groups.find((g) => g.svc_cd === p.svc);
  const narrow = useNarrow();
  const wide = useWide(1600);   // 아주 넓은 화면에서만 '지도 단위' 글자를 보인다 — 좁으면 모드별 주요 메뉴가 잘리지 않게 비운다
  const [menuOpen, setMenuOpen] = useState(false);
  const svcOptions = [{ value: "", label: "외식 전체" }, ...(p.categories?.groups ?? []).map((g) => ({ value: g.svc_cd, label: `${g.svc_nm} (${g.store_count.toLocaleString()})` }))];
  const sclsOptions = [{ value: "", label: group ? `${group.svc_nm} 전체` : "세부 업종" }, ...(group?.details ?? []).map((d) => ({ value: d.code, label: `${d.name} (${d.store_count})` }))];
  const changeSvc = (v: string) => { p.onSvcChange(v || null); p.onSclsChange(null); };
  // 휴대폰 폭: 한 줄에 다 담으면 업종·지표·월간 점검·내 관심 지역·도움말이 화면 밖으로 밀려 보이지 않는다 →
  // 바에는 로고·검색·내 관심 지역·'메뉴'만 두고, 모드·업종·지표·월간 점검·도움말은 '메뉴' 시트에 모은다.
  if (narrow) {
    const sheetBtn: React.CSSProperties = { width: "100%", minHeight: 44, padding: "10px 12px", borderRadius: 10, border: "1px solid #D1D5DB", background: "white", color: "#111827", fontSize: 15, fontWeight: 700, cursor: "pointer", textAlign: "left" };
    return (
      <>
        <div
          style={{ position: "absolute", zIndex: OVERLAY_Z_INDEX + 1, top: 0, left: 0, right: 0, height: 56, background: "white", boxShadow: "0 1px 6px rgba(0,0,0,0.12)", display: "flex", alignItems: "center", gap: 6, padding: "0 10px", overflow: "hidden" }}
        >
          {p.onBack && (
            <button type="button" onClick={p.onBack} aria-label="이전 화면으로" style={{ width: 40, height: 40, flexShrink: 0, border: "1px solid #D1D5DB", borderRadius: 8, background: "white", color: "#1D4ED8", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>←</button>
          )}
          <AppLink to={HOME_PATH} aria-label="상권분석 홈(랜딩페이지)으로" style={{ fontSize: 15, fontWeight: 700, color: "#111827", textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0 }}>상권분석</AppLink>
          <SearchBox onPick={p.onPickPlace} pickedName={p.pickedPlaceName} onClear={p.onClearPlace} mode={p.mode} />
          <button type="button" data-tour="favorites" onClick={p.onOpenInterest} aria-label={`내 관심 지역 ${p.interestCount}곳`} style={{ ...barBtn, background: "#EFF6FF", color: "#1E3A8A", border: "1px solid #1D4ED8" }}>
            <span aria-hidden="true">★</span> {p.interestCount}
          </button>
          <button type="button" data-tour="menu" aria-expanded={menuOpen} aria-controls="topbar-menu" aria-label={`메뉴 — 현재 모드 ${MODE_LABEL[p.mode]}`} onClick={() => setMenuOpen((o) => !o)} style={{ ...barBtn, background: menuOpen ? "#1D4ED8" : "white", color: menuOpen ? "white" : "#374151" }}>
            <span aria-hidden="true">☰</span> 메뉴
          </button>
        </div>
        {menuOpen && <MenuSheet onClose={() => setMenuOpen(false)}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#4B5563" }}>이용 모드</div>
          <ModeSwitch mode={p.mode} onChange={p.onModeChange} stretch />
          <div style={{ fontSize: 13, color: "#6B7280", marginTop: -4 }}>{MODE_HINT[p.mode]}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#4B5563", marginTop: 6 }}>지도에서 보기</div>
          <SheetSelect tour="svc" label="업종" value={p.svc ?? ""} onChange={changeSvc} options={svcOptions} />
          <SheetSelect tour="scls" label="세부 업종" value={p.scls ?? ""} disabled={!group} onChange={(v) => p.onSclsChange(v || null)} options={sclsOptions} />
          <SheetSelect tour="metric" label="지도 지표" value={p.metric} onChange={(v) => p.onMetricChange(v as FoodMetric)} options={METRIC_OPTIONS} />
          {p.ownerMenu && (
            <button type="button" data-tour="mode-menu" onClick={() => { setMenuOpen(false); p.ownerMenu?.onClick(); }} style={{ ...sheetBtn, marginTop: 6, border: "1px solid #1D4ED8", background: "#EFF6FF", color: "#1E3A8A" }}>{p.ownerMenu.label}</button>
          )}
          <button type="button" data-tour="help" onClick={() => { setMenuOpen(false); p.onHelp(); }} style={{ ...sheetBtn, fontWeight: 600 }}><span aria-hidden="true">? </span>도움말 (튜토리얼 다시 보기)</button>
          <button type="button" onClick={() => setMenuOpen(false)} style={{ ...sheetBtn, textAlign: "center", background: "#1D4ED8", color: "white", border: "1px solid #1D4ED8" }}>닫고 지도 보기</button>
        </MenuSheet>}
      </>
    );
  }
  return (
    <div
      style={{
        position: "absolute", zIndex: OVERLAY_Z_INDEX + 1, top: 0, left: 0, right: 0, height: 56, background: "white",
        boxShadow: "0 1px 6px rgba(0,0,0,0.12)", display: "flex", alignItems: "center", gap: 10, padding: "0 16px",
        // 좁은 화면: 줄이 넘치면 바 안에서 옆으로 밀어 본다(페이지 전체가 옆으로 넓어지지 않게)
        overflowX: "auto", overflowY: "hidden", scrollbarWidth: "none",
      }}
    >
      {p.onBack && (
        <button type="button" onClick={p.onBack} aria-label="이전 화면으로" style={{ padding: "6px 10px", border: "1px solid #D1D5DB", borderRadius: 8, background: "white", color: "#1D4ED8", fontSize: 14, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>← 뒤로</button>
      )}
      <AppLink to={HOME_PATH} aria-label="상권분석 홈(랜딩페이지)으로" style={{ fontSize: narrow ? 15 : 17, fontWeight: 700, color: "#111827", textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0 }}>{narrow || !wide ? "상권분석" : "상권분석 · 요식업"}</AppLink>
      <ModeSwitch mode={p.mode} onChange={p.onModeChange} />
      <SearchBox onPick={p.onPickPlace} pickedName={p.pickedPlaceName} onClear={p.onClearPlace} mode={p.mode} />
      <Select
        tour="svc"
        label="업종"
        value={p.svc ?? ""}
        onChange={changeSvc}
        options={svcOptions}
      />
      <Select
        tour="scls"
        label="세부 업종"
        value={p.scls ?? ""}
        disabled={!group}
        title={group ? "세부 업종은 점포 수·매장 위치에만 적용됩니다. 매출 지표가 어느 업종 기준인지는 범례와 요약 패널에 항상 표시됩니다." : "업종을 먼저 고르세요"}
        onChange={(v) => p.onSclsChange(v || null)}
        options={sclsOptions}
      />
      <Select tour="metric" label="지도 지표" value={p.metric} onChange={(v) => p.onMetricChange(v as FoodMetric)} options={METRIC_OPTIONS} />
      {wide && <span style={{ fontSize: 12, color: "#6B7280", whiteSpace: "nowrap", flexShrink: 0 }}>지도 단위: {p.unitLabel}</span>}
      {p.ownerMenu && (
        <button type="button" data-tour="mode-menu" onClick={p.ownerMenu.onClick} style={{ marginLeft: "auto", padding: "6px 10px", border: "1px solid #1D4ED8", borderRadius: 8, background: "#EFF6FF", color: "#1E3A8A", fontSize: 14, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
          {p.ownerMenu.label}
        </button>
      )}
      <button type="button" data-tour="favorites" onClick={p.onOpenInterest} style={{ marginLeft: p.ownerMenu ? 0 : "auto", padding: "6px 10px", border: "1px solid #1D4ED8", borderRadius: 8, background: "#EFF6FF", color: "#1E3A8A", fontSize: 14, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
        <span aria-hidden="true">★ </span>내 관심 지역 {p.interestCount}
      </button>
      <button type="button" data-tour="help" onClick={p.onHelp} style={{ padding: "6px 10px", border: "1px solid #D1D5DB", borderRadius: 8, background: "white", color: "#374151", fontSize: 14, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
        <span aria-hidden="true">? </span>도움말
      </button>
    </div>
  );
}

/** 자영업자 / 예비 창업자 — 모드에 따라 이용 순서 안내와 매장 상세의 구성이 달라진다. */
function ModeSwitch({ mode, onChange, stretch }: { mode: Mode; onChange: (m: Mode) => void; stretch?: boolean }) {
  return (
    <div data-tour="mode" role="radiogroup" aria-label="이용 모드" style={{ display: stretch ? "flex" : "inline-flex", border: "1px solid #D1D5DB", borderRadius: 8, overflow: "hidden", flexShrink: 0 }}>
      {MODES.map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={m === mode}
          title={MODE_HINT[m]}
          onClick={() => onChange(m)}
          style={{ flex: stretch ? 1 : undefined, minHeight: stretch ? 44 : undefined, padding: "6px 10px", border: "none", cursor: "pointer", fontSize: stretch ? 15 : 14, fontWeight: m === mode ? 700 : 500, background: m === mode ? "#1D4ED8" : "white", color: m === mode ? "white" : "#374151", whiteSpace: "nowrap" }}
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
        maxWidth: 160, flexShrink: 0, padding: "6px 10px", borderRadius: 6, border: "1px solid #e5e7eb",
        background: disabled ? "#f3f4f6" : "white", color: disabled ? "#9ca3af" : "#111827", fontSize: 14,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

const barBtn: React.CSSProperties = { height: 40, padding: "0 10px", flexShrink: 0, border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" };

/** 휴대폰 폭의 '메뉴' 시트 — 바 아래로 내려오고, 바깥(어두운 곳)·Esc·'닫고 지도 보기'로 닫는다. 고른 업종·지표는 바로 지도에 적용된다. */
function MenuSheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <>
      <div onClick={onClose} aria-hidden="true" style={{ position: "fixed", inset: "56px 0 0 0", zIndex: OVERLAY_Z_INDEX + 6, background: "rgba(17,24,39,0.35)" }} />
      <div id="topbar-menu" role="dialog" aria-label="메뉴" style={{ position: "fixed", top: 56, left: 0, right: 0, zIndex: OVERLAY_Z_INDEX + 7, maxHeight: "calc(100dvh - 56px)", overflowY: "auto", background: "white", padding: "12px 14px 16px", boxShadow: "0 8px 16px rgba(0,0,0,0.18)", display: "flex", flexDirection: "column", gap: 8 }}>
        {children}
      </div>
    </>
  );
}

function SheetSelect({ label, value, onChange, options, disabled, tour }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; disabled?: boolean; tour?: string }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 13, color: "#4B5563" }}>
      {label}
      <select data-tour={tour} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}
        style={{ width: "100%", minHeight: 44, padding: "8px 10px", borderRadius: 8, border: "1px solid #D1D5DB", background: disabled ? "#f3f4f6" : "white", color: disabled ? "#9ca3af" : "#111827", fontSize: 16 }}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
