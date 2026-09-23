import { Notice, Section, SourceNote } from "../../components/Notice";
import type { NearbyAnalysisResponse } from "../../lib/apiClient";
import { useNearbyAnalysis } from "./useStores";

const RADIUS_M = 500;

/** '주변 상권 분석' — 같은 업종 인허가의 연도별 개폐업과 관찰기간을 맞춘 폐업 비율. 매장 개별 평가가 아니다. */
export function NearbyAnalysisSection({ storeId }: { storeId: string }) {
  const { data, isLoading, isError, error } = useNearbyAnalysis(storeId, RADIUS_M);
  return (
    <Section title="주변 상권 분석">
      {isLoading && <Notice tone="muted">분석 중...</Notice>}
      {isError && <Notice tone="error">조회 실패: {error.message}</Notice>}
      {data && (data.status === "unavailable" ? <Notice tone="muted">{data.reason}</Notice> : <Body data={data} />)}
      {data && <div style={{ fontSize: 11, color: "#6B7280", marginTop: 8 }}>{data.disclaimer}</div>}
    </Section>
  );
}

function Body({ data }: { data: NearbyAnalysisResponse }) {
  const c = data.closure_cohort!;
  const trend = data.trend ?? [];
  const maxVal = Math.max(1, ...trend.flatMap((t) => [t.opened, t.closed ?? 0]));
  return (
    <div>
      <div style={{ fontSize: 12, color: "#374151", marginBottom: 8 }}>
        반경 {data.radius_m}m · {data.scope?.license_names.join("·")}
        {data.scope?.uptae ? `(${data.scope.uptae.join("·")})` : ""} · 현재 영업 중 인허가 {data.active_count?.toLocaleString()}건
      </div>

      <div style={{ background: "#F9FAFB", borderRadius: 8, padding: "8px 10px", marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: "#6b7280" }}>{c.name ?? "영업 지속 지표"}</div>
        {c.status === "ok" && c.rate !== null ? (
          <>
            <div style={{ fontWeight: 700, fontSize: 18 }}>{(c.rate * 100).toFixed(1)}%</div>
            <div style={{ fontSize: 11, color: "#6B7280" }}>
              분자 {c.numerator} / 분모 {c.denominator} · {c.definition}
            </div>
          </>
        ) : (
          <Notice tone="warn">{c.message ?? "분석 자료 부족"}</Notice>
        )}
      </div>

      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>
        연도별 개업(인허가)·폐업 건수 <Legend color="#3B82F6" label="개업" /> <Legend color="#EF4444" label="폐업" />
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 70 }}>
        {trend.map((t) => (
          <div key={t.year} style={{ flex: 1, textAlign: "center" }} title={`${t.year}${t.partial_year ? "(진행 중)" : ""} 개업 ${t.opened} / 폐업 ${t.closed ?? "알 수 없음"}`}>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 1, height: 56 }}>
              <Bar h={(t.opened / maxVal) * 56} color="#3B82F6" />
              {t.closed === null ? <span style={{ fontSize: 9, color: "#9CA3AF" }}>?</span> : <Bar h={(t.closed / maxVal) * 56} color="#EF4444" />}
            </div>
            <div style={{ fontSize: 9, color: t.partial_year ? "#9CA3AF" : "#6B7280" }}>{String(t.year).slice(2)}</div>
          </div>
        ))}
      </div>

      {(data.warnings ?? []).map((w) => (
        <div key={w} style={{ marginTop: 6 }}>
          <Notice tone="warn">{w}</Notice>
        </div>
      ))}
      {data.source && <SourceNote title={data.source.title} reference={data.source.reference} />}
    </div>
  );
}

function Bar({ h, color }: { h: number; color: string }) {
  return <div style={{ width: 6, height: Math.max(h, 1), background: color, opacity: 0.8, borderRadius: 1 }} />;
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ marginLeft: 6 }}>
      <span style={{ display: "inline-block", width: 8, height: 8, background: color, marginRight: 2 }} />
      {label}
    </span>
  );
}
