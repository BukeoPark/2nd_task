import { useQuery } from "@tanstack/react-query";
import { Notice, Section, SourceNote } from "../../components/Notice";
import { apiClient } from "../../lib/apiClient";
import { formatKrw, parseManwon } from "../../lib/format";

const AREA_COLOR: Record<string, string> = {
  영업시간: "#2563EB",
  요일: "#7C3AED",
  손님층: "#DB2777",
  "상권 흐름": "#B45309",
  "유입 전환": "#059669",
  경쟁: "#DC2626",
  브랜드: "#8B5CF6",
};

/** '매출 개선 리포트' — 외부 AI 없이 규칙 + 같은 업종 상위 25% 비교군으로 만든 점검 후보.
 * 사장님 매출(manwon)은 진단 한 줄에만 쓰고 서버로 보내지 않는다. */
export function ImprovementReportSection({ storeId, manwon }: { storeId: string; manwon: string }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["improvement-report", storeId],
    queryFn: () => apiClient.getImprovementReport(storeId),
    staleTime: 10 * 60 * 1000,
  });
  const mine = parseManwon(manwon);
  const avg = data?.benchmark?.per_store_month ?? null;

  return (
    <Section title="매출 개선 리포트">
      {isLoading && <Notice tone="muted">리포트를 만드는 중...</Notice>}
      {isError && <Notice tone="error">조회 실패: {error.message}</Notice>}
      {data && data.status !== "ok" && <Notice tone="muted">{data.message}</Notice>}
      {data && data.status === "ok" && (
        <div>
          <div style={{ fontSize: 12, color: "#374151", marginBottom: 8 }}>
            {data.unit?.name}({data.unit?.type ?? data.unit?.label}) · '{data.svc_nm}' · {data.quarter_label} 기준
            {data.top_group && (
              <div style={{ fontSize: 11, color: "#6B7280" }}>
                비교 기준: 같은 업종 {data.top_group.peers}곳 중 점포당 매출 상위 {data.top_group.count}곳(월 {formatKrw(data.top_group.per_store_month_min)} 이상,
                예: {data.top_group.names.join(", ")})
              </div>
            )}
          </div>
          {data.top_group_note && <Notice tone="muted">{data.top_group_note}</Notice>}

          {mine !== null && avg !== null && avg > 0 && (
            <div style={{ background: "#FFF7ED", borderRadius: 8, padding: "8px 10px", fontSize: 12, marginBottom: 8 }}>
              <strong>내 매출 진단</strong> — 입력한 월 매출 {formatKrw(mine)}은 이 {data.unit?.label} 같은 업종 점포당 평균의{" "}
              <strong>{((mine / avg) * 100).toFixed(0)}%</strong>
              {mine < avg ? ". 아래 점검 후보부터 살펴보세요." : ". 평균 이상이지만 아래 차이를 참고해 보세요."}
            </div>
          )}
          {mine === null && (
            <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 8 }}>
              위 '동네 매출 비교'에 월 매출을 입력하면 내 매출 진단이 함께 표시됩니다(서버로 보내지 않음).
            </div>
          )}

          {(data.recommendations ?? []).length === 0 ? (
            <Notice tone="info">같은 업종 상위 비교군과 매출 구성에서 뚜렷한 차이(5%p 이상)가 보이지 않습니다.</Notice>
          ) : (
            <ol style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 8 }}>
              {data.recommendations!.map((r) => (
                <li key={r.title} style={{ fontSize: 12 }}>
                  <span
                    style={{
                      fontSize: 10,
                      color: "white",
                      background: AREA_COLOR[r.area] ?? "#6B7280",
                      borderRadius: 4,
                      padding: "1px 5px",
                      marginRight: 4,
                    }}
                  >
                    {r.area}
                  </span>
                  <strong>{r.title}</strong>
                  {r.evidence.map((e) => (
                    <div key={e} style={{ fontSize: 11, color: "#4B5563" }}>
                      · {e}
                    </div>
                  ))}
                  <div style={{ marginTop: 2 }}>→ {r.suggestion}</div>
                </li>
              ))}
            </ol>
          )}
          {data.source && <SourceNote title={data.source.title} reference={data.source.reference ?? "-"} />}
        </div>
      )}
      {data && <div style={{ fontSize: 11, color: "#6B7280", marginTop: 6 }}>{data.disclaimer}</div>}
    </Section>
  );
}
