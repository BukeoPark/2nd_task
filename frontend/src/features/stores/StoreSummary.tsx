import { useQuery } from "@tanstack/react-query";
import { Notice, Section, SourceNote } from "../../components/Notice";
import { Term } from "../../components/Term";
import { apiClient, type SalesBenchmarkResponse } from "../../lib/apiClient";
import { openSection, SECTION_IDS } from "../../lib/sections";
import { buildSummary, type SummaryInput } from "../../lib/summary";

function toInput(d: SalesBenchmarkResponse): SummaryInput {
  const c = d.churn ?? null;
  const h = d.hinterland ?? null;
  return {
    peerLabel: d.unit?.peer_label ?? "파일럿",
    rank: d.rank ?? null,
    peerCount: d.peer_count ?? null,
    perStoreYoyPct: d.per_store_yoy_pct ?? null,
    churn: c && {
      status: c.status,
      message: c.message,
      openRate: c.open_rate ?? null,
      closeRate: c.close_rate ?? null,
      peerMedianOpen: c.peer_median_open ?? null,
      peerMedianClose: c.peer_median_close ?? null,
    },
    floating: d.floating ? { rank: d.floating.rank, peerCount: d.floating.peer_count } : null,
    workplace: h?.workplace ? { total: h.workplace.total, peerMedian: h.peer_median.workplace } : null,
    resident: h?.resident ? { total: h.resident.total, peerMedian: h.peer_median.resident } : null,
  };
}

const linkStyle = { padding: "5px 10px", border: "1px solid #D1D5DB", borderRadius: 6, background: "#fff", fontSize: 12, cursor: "pointer" } as const;

/** 매장 상세 맨 위 '한눈에 보기' — 동네 매출 비교의 핵심 사실만 먼저 보여 주고, 나머지는 아래 접힌 섹션에서 펼친다.
 * 점수·판정은 만들지 않고 순위와 비교 단위 중앙값 대비 방향만 말한다. */
export function StoreSummary({ storeId }: { storeId: string }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["sales-benchmark", storeId],
    queryFn: () => apiClient.getSalesBenchmark(storeId),
    staleTime: 10 * 60 * 1000,
  });
  const lines = data?.status === "ok" ? buildSummary(toInput(data)) : [];

  return (
    <Section title="한눈에 보기">
      {isLoading && <Notice tone="muted">불러오는 중...</Notice>}
      {isError && <Notice tone="error">조회 실패: {error.message}</Notice>}
      {data && data.status !== "ok" && <Notice tone="muted">{data.message ?? "이 매장은 동네 매출 자료와 연결되지 않아 요약을 만들 수 없습니다."}</Notice>}
      {data?.status === "ok" && (
        <>
          {data.unit && (
            <div style={{ fontSize: 12, color: "#374151", marginBottom: 6 }}>
              비교 단위: <strong>{data.unit.name}</strong> ({data.unit.type ?? data.unit.label}) · 서울시 업종 '{data.svc_nm}' 전체 기준 · {data.quarter_label}
            </div>
          )}
          {lines.length === 0 ? (
            <Notice tone="muted">요약할 만큼 자료가 모이지 않았습니다. 아래 접힌 항목에서 있는 자료를 볼 수 있어요.</Notice>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
              {lines.map((l) => (
                <li key={l.key}>{l.text}</li>
              ))}
            </ul>
          )}
          <div style={{ fontSize: 11, color: "#6B7280", marginTop: 6 }}>
            서울시 추정 자료를 비교 단위와 견준 사실 요약이에요. 점수나 좋고 나쁨의 판정이 아니고, 원인이나 개선 방향을 뜻하지 않아요.
          </div>
          <div style={{ fontSize: 11, color: "#6B7280", marginTop: 4 }}>
            <Term id="peerMedian" label="중앙값이란" />
          </div>
          <SourceNote title={data.source.title} reference={data.source.reference ?? "-"} />
        </>
      )}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
        <button type="button" style={linkStyle} onClick={() => openSection(SECTION_IDS.sales)}>
          동네 매출 자세히 보기
        </button>
        <button type="button" style={linkStyle} onClick={() => openSection(SECTION_IDS.checkup)}>
          내 가게 점검하기
        </button>
      </div>
    </Section>
  );
}
