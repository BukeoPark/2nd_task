import { AppIcon } from "../../components/DataVisuals";
import { Fold, Notice, Section, SourceNote } from "../../components/Notice";
import { Caveat } from "../../components/NoteHost";
import { ScopeTag } from "../../components/ScopeTag";
import type { CompetitorSummary, NearbyAnalysisResponse } from "../../lib/apiClient";
import { useNearbyAnalysis } from "./useStores";
import { Stat as KitStat } from "../../components/PanelKit";
import { firstSentence } from "../../lib/shortText";
import { FS } from "../../lib/typography";

/** '주변 상권 분석' — 같은 업종 인허가의 연도별 개폐업과 관찰기간을 맞춘 폐업 비율. 매장 개별 평가가 아니다. */
export function NearbyAnalysisSection({ storeId, radius }: { storeId: string; radius: number }) {
  const { data, isLoading, isError, error } = useNearbyAnalysis(storeId, radius);
  const r = radius >= 1000 ? `${radius / 1000}km` : `${radius}m`;
  return (
    <Section title={`주변 가게의 개업·폐업`} scope={<ScopeTag kind="compete" label={`반경 ${r}`} />}>
      {isLoading && <Notice tone="muted">분석 중...</Notice>}
      {isError && <Notice tone="error">조회 실패: {error.message}</Notice>}
      {data && (data.status === "unavailable" ? <Notice tone="muted">{data.reason}</Notice> : <Body data={data} />)}
      {data && <Caveat>{firstSentence(data.disclaimer)}</Caveat>}
    </Section>
  );
}

function Body({ data }: { data: NearbyAnalysisResponse }) {
  const c = data.closure_cohort!;
  const trend = data.trend ?? [];
  const maxVal = Math.max(1, ...trend.flatMap((t) => [t.opened, t.closed ?? 0]));
  const coordWarnings = (data.warnings ?? []).filter((w) => w.includes("좌표가 없"));
  const otherWarnings = (data.warnings ?? []).filter((w) => !w.includes("좌표가 없"));
  return (
    <div>
      <div style={{ fontSize: FS.caption, color: "#374151", marginBottom: 8 }}>
        반경 {data.radius_m}m · {data.scope?.license_names.join("·")}
        {data.scope?.uptae ? `(${data.scope.uptae.join("·")})` : ""} · 현재 영업 중 인허가 {data.active_count?.toLocaleString()}건
      </div>

      {data.competitors && <CompetitorBlock c={data.competitors} />}

      <div style={{ background: "#F9FAFB", borderRadius: 8, padding: "8px 10px", marginBottom: 10 }}>
        <div style={{ fontSize: FS.caption, color: "#6b7280" }}>{c.status === "ok" && c.rate !== null && c.horizon_years !== undefined ? `주변 동일 업종의 과거 ${c.horizon_years}년 이내 폐업 비율` : (c.name ?? "영업 지속 지표")}</div>
        {c.status === "ok" && c.rate !== null ? (
          <>
            <div style={{ fontWeight: 800, fontSize: FS.metric }}>{(c.rate * 100).toFixed(1)}%</div>
            <div style={{ fontSize: FS.caption, color: "#6B7280" }}>분자 {c.numerator} / 분모 {c.denominator}</div>
            <div style={{ fontSize: FS.caption, color: "#6B7280" }}>선택 매장의 미래 폐업 확률이 아니라, 주변 동일 업종 인허가의 과거 통계입니다.</div>
          </>
        ) : (
          <Notice tone="warn">{c.message ?? "분석 자료 부족"}</Notice>
        )}
      </div>

      <Fold title="연도별 개업(인허가)·폐업 건수 보기">
      <div style={{ fontSize: FS.caption, color: "#6b7280", marginBottom: 4 }}>
        연도별 개업(인허가)·폐업 건수 <Legend color="#3B82F6" label="개업" /> <Legend color="#EF4444" label="폐업" />
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 140 }}>
        {trend.map((t) => (
          <div key={t.year} style={{ flex: 1, textAlign: "center" }} title={`${t.year}${t.partial_year ? "(진행 중)" : ""} 개업 ${t.opened} / 폐업 ${t.closed ?? "알 수 없음"}`}>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 1, height: 110 }}>
              <Bar h={(t.opened / maxVal) * 110} color="#3B82F6" />
              {t.closed === null ? <span style={{ fontSize: FS.caption, color: "#9CA3AF" }}>?</span> : <Bar h={(t.closed / maxVal) * 110} color="#EF4444" />}
            </div>
            <div style={{ fontSize: FS.caption, color: t.partial_year ? "#9CA3AF" : "#6B7280" }}>{String(t.year).slice(2)}</div>
          </div>
        ))}
      </div>

      </Fold>

      {coordWarnings.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <Caveat>일부 위치정보 누락으로 주변 분석에서 제외된 인허가가 있습니다.</Caveat>
        </div>
      )}
      {otherWarnings.map((w) => (
        <div key={w} style={{ marginTop: 6 }}>
          <Notice tone="warn">{w}</Notice>
        </div>
      ))}
      <Fold title="분석 기준 보기">
        {c.definition && <div style={{ fontSize: FS.caption, color: "#6B7280" }}>{c.definition}</div>}
        {coordWarnings.map((w) => (
          <div key={w} style={{ fontSize: FS.caption, color: "#6B7280", marginTop: 4 }}>
            · {w}
          </div>
        ))}
      </Fold>
      {data.source && <SourceNote label="인허가 개폐업 자료" title={data.source.title} reference={data.source.reference} />}
    </div>
  );
}

/** 동종 점포 수 — 원본(상가정보)과 폐업 기록 확인 점포를 뺀 참고 수치를 구분해 보여준다. 영업 여부 미확인 점포는 빼지 않는다. */
function CompetitorBlock({ c }: { c: CompetitorSummary }) {
  const hasAdjust = c.adjusted_count !== null && c.excluded_closed_count !== null;
  return (
    <div style={{ background: "#F9FAFB", borderRadius: 8, padding: "8px 10px", marginBottom: 10 }}>
      <div style={{ fontSize: FS.caption, color: "#6b7280" }}>반경 {c.radius_m}m 같은 소분류 점포(선택 매장 제외 · 상가정보 기준)</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginTop: 4 }}>
        <Stat label="원본" value={`${c.raw_count}곳`} />
        <Stat label="폐업 기록 확인 제외" value={c.excluded_closed_count === null ? "자료 없음" : `${c.excluded_closed_count}곳`} />
        <Stat label="참고 보정" value={hasAdjust ? `${c.adjusted_count}곳` : "자료 없음"} />
      </div>
      <div style={{ fontSize: FS.caption, color: "#6B7280", marginTop: 4 }}>
        인허가상 영업 확인 {c.open_confirmed_count}곳 · 영업 여부 미확인 {c.unconfirmed_count}곳(제외하지 않음)
      </div>
      <Caveat>
        {firstSentence(c.caveat)} 기준일: 상가정보 {c.as_of.store_info ?? "자료 없음"} · 인허가 {c.as_of.license ?? "자료 없음"}
      </Caveat>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <KitStat onGray label={<span className="data-heading"><AppIcon name="store"/>{label}</span>} value={value} />;
}

function Bar({ h, color }: { h: number; color: string }) {
  return <div style={{ width: 12, height: Math.max(h, 1), background: color, opacity: 0.8, borderRadius: 1 }} />;
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ marginLeft: 6 }}>
      <span style={{ display: "inline-block", width: 8, height: 8, background: color, marginRight: 2 }} />
      {label}
    </span>
  );
}
