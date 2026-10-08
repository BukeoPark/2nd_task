import { useQuery } from "@tanstack/react-query";
import { Notice, Section, SourceNote } from "../../components/Notice";
import { apiClient } from "../../lib/apiClient";
import { formatKrw, parseManwon } from "../../lib/format";

/** '프랜차이즈 참고' — 이 상권 같은 업종의 프랜차이즈 비율(서울시)과, 상호로 연결된 브랜드의 전국 평균(공정위).
 * 전국·시도 평균은 상권 값이 아니므로 참고치로만 보여준다. */
export function FranchiseSection({ storeId, manwon }: { storeId: string; manwon: string }) {
  const fr = useQuery({ queryKey: ["franchise", storeId], queryFn: () => apiClient.getFranchise(storeId), staleTime: 10 * 60 * 1000 });
  const bm = useQuery({ queryKey: ["sales-benchmark", storeId], queryFn: () => apiClient.getSalesBenchmark(storeId), staleTime: 10 * 60 * 1000 });
  const share = bm.data?.status === "ok" ? bm.data.franchise_share : null;
  const mine = parseManwon(manwon);

  return (
    <Section title="프랜차이즈 참고">
      {share && share.share !== null && (
        <div style={{ fontSize: 12, marginBottom: 8 }}>
          이 {bm.data?.unit?.label} 같은 업종 {share.stores}곳 중 프랜차이즈 <strong>{share.frc_stores}곳({(share.share * 100).toFixed(0)}%)</strong>
          {share.peer_median !== null && (
            <span style={{ color: "#6B7280" }}> · {bm.data?.unit?.peer_label} 중앙값 {(share.peer_median * 100).toFixed(0)}%</span>
          )}
        </div>
      )}
      {fr.isLoading && <Notice tone="muted">불러오는 중...</Notice>}
      {fr.isError && <Notice tone="error">조회 실패: {fr.error.message}</Notice>}
      {fr.data && !fr.data.brand && <Notice tone="muted">{fr.data.message}</Notice>}
      {fr.data?.brand && (() => {
        const b = fr.data.brand;
        const maxCnt = Math.max(1, ...b.trend.map((t) => t.frcs_cnt ?? 0));
        return (
          <div>
            <div style={{ fontSize: 12, marginBottom: 6 }}>
              <strong>{b.brand}</strong> <span style={{ color: "#6B7280" }}>({b.corp} · {b.industry} · 상호로 추정한 연결)</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <Card label={`전국 가맹점 수 (${b.year})`} value={b.frcs_cnt === null ? "정보 없음" : `${b.frcs_cnt.toLocaleString()}곳`}
                    sub={`신규 ${b.new_cnt ?? 0} · 종료·해지 ${(b.end_cnt ?? 0) + (b.cancel_cnt ?? 0)}`} />
              <Card label="계약 종료·해지 비율" value={b.churn_rate === null ? "정보 없음" : `${(b.churn_rate * 100).toFixed(1)}%`} sub="해당 연도 ÷ 가맹점 수" />
              <Card label={`전국 가맹점 평균 매출${b.avg_sales_year_label ? ` (${b.avg_sales_year_label})` : ""}`}
                    value={b.avg_sales_month === null ? "공개 안 됨" : `월 ${formatKrw(b.avg_sales_month)}`} sub="연 평균 ÷ 12" />
              <Card label={fr.data.seoul_avg ? `서울 '${fr.data.seoul_avg.mlsfc}' 가맹점 평균` : "서울 업종 평균"}
                    value={fr.data.seoul_avg ? `월 ${formatKrw(fr.data.seoul_avg.avg_sales_month)}` : "정보 없음"}
                    sub={fr.data.seoul_avg ? `${fr.data.seoul_avg.year}년 · 시도 단위` : undefined} />
            </div>
            {mine !== null && b.avg_sales_month && (
              <div style={{ marginTop: 6, fontSize: 12 }}>
                입력한 월 매출은 이 브랜드 전국 평균의 <strong>{((mine / b.avg_sales_month) * 100).toFixed(0)}%</strong>
              </div>
            )}
            <div style={{ fontSize: 11, color: "#6b7280", margin: "8px 0 2px" }}>가맹점 수 추이</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 40 }}>
              {b.trend.map((t) => (
                <div key={t.year} style={{ flex: 1, textAlign: "center" }} title={`${t.year}: ${t.frcs_cnt ?? "-"}곳 (신규 ${t.new_cnt ?? 0}, 종료·해지 ${t.out_cnt ?? 0})`}>
                  <div style={{ height: Math.max(((t.frcs_cnt ?? 0) / maxCnt) * 30, 1), background: "#8B5CF6", opacity: 0.7, borderRadius: 2 }} />
                  <div style={{ fontSize: 9, color: "#6B7280" }}>{String(t.year).slice(2)}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
      {fr.data && (
        <>
          {fr.data.brand && <SourceNote title={fr.data.source.title} reference={fr.data.source.reference} />}
          {fr.data.brand && fr.data.caveats.map((c) => (
            <div key={c} style={{ fontSize: 11, color: "#6B7280" }}>· {c}</div>
          ))}
        </>
      )}
    </Section>
  );
}

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: "#F9FAFB", borderRadius: 8, padding: "8px 10px" }}>
      <div style={{ fontSize: 11, color: "#6b7280" }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 14 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#6B7280" }}>{sub}</div>}
    </div>
  );
}
