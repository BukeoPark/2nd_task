import { useQuery } from "@tanstack/react-query";
import { Notice, Section, SourceNote } from "../../components/Notice";
import { Term } from "../../components/Term";
import { apiClient, type SalesBenchmarkResponse } from "../../lib/apiClient";
import { compareBasis } from "../../lib/compareBasis";
import { openSection, SECTION_IDS } from "../../lib/sections";
import { buildSummary, type SummaryInput } from "../../lib/summary";
import { PEER_RING_COLOR, SELECTED_RING_COLOR, STORE_POINT_COLOR } from "../../lib/vizConfig";
import { usePeerStores } from "./useStores";

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
  const peers = usePeerStores(storeId);
  const peerCount = peers.data?.status === "ok" ? peers.data.count : null;

  return (
    <Section title="한눈에 보기">
      {isLoading && <Notice tone="muted">불러오는 중...</Notice>}
      {isError && <Notice tone="error">조회 실패: {error.message}</Notice>}
      {data && data.status !== "ok" && <Notice tone="muted">{data.message ?? "이 매장은 동네 매출 자료와 연결되지 않아 요약을 만들 수 없습니다."}</Notice>}
      {data?.status === "ok" && (
        <>
          {data.unit && data.svc_nm && (
            <BasisBox
              basis={compareBasis({
                level: data.unit.level, unitName: data.unit.name, unitType: data.unit.type, fallbackReason: data.unit.fallback_reason,
                svcNm: data.svc_nm, sclsNm: data.scls_nm ?? null, peerCount,
              })}
              quarter={data.quarter_label}
              showLegend={peerCount !== null}
            />
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

/** 비교 기준 — 어떤 단위·업종과 견준 숫자인지와, 지도에서 무엇이 강조되는지(점 모양 범례 포함). */
function BasisBox({ basis, quarter, showLegend }: { basis: ReturnType<typeof compareBasis>; quarter?: string; showLegend: boolean }) {
  return (
    <div style={{ background: "#F9FAFB", borderRadius: 8, padding: "8px 10px", marginBottom: 8, fontSize: 12, color: "#374151", lineHeight: 1.6 }}>
      <strong>비교 기준</strong>
      {quarter && <span style={{ color: "#6B7280" }}> · {quarter}</span>}
      <div>
        비교 단위: <strong>{basis.unit}</strong>
      </div>
      <div style={{ color: "#6B7280" }}>{basis.why}</div>
      <div>비교 업종: {basis.category}</div>
      {basis.map && <div style={{ color: "#6B7280", marginTop: 2 }}>{basis.map}</div>}
      {showLegend && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 12px", marginTop: 4, color: "#374151" }}>
          <Swatch ring={SELECTED_RING_COLOR} label="선택한 매장" />
          <Swatch ring={PEER_RING_COLOR} label="같은 단위·업종 매장" />
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span aria-hidden="true" style={{ width: 16, height: 10, border: `2px solid ${PEER_RING_COLOR}`, background: "rgba(29,78,216,0.08)", borderRadius: 2 }} />
            비교 단위 경계
          </span>
        </div>
      )}
    </div>
  );
}

function Swatch({ ring, label }: { ring: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span aria-hidden="true" style={{ boxSizing: "border-box", width: 14, height: 14, borderRadius: "50%", background: STORE_POINT_COLOR, border: "2px solid white", boxShadow: `0 0 0 2px ${ring}` }} />
      {label}
    </span>
  );
}
