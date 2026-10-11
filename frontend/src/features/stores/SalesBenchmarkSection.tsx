import { useQuery } from "@tanstack/react-query";
import { Notice, Section, SourceNote } from "../../components/Notice";
import { apiClient, type SalesBenchmarkResponse } from "../../lib/apiClient";
import { formatKrw, formatSignedPct, parseManwon } from "../../lib/format";

/** '내 매출 벤치마킹' — 매장이 속한 상권(없으면 행정동)·같은 업종의 점포당 월평균 추정매출과 사장님 매출을 비교한다.
 * 입력한 매출은 이 화면 안에서만 계산하고 서버로 보내거나 저장하지 않는다. */
export function SalesBenchmarkSection({
  storeId,
  manwon,
  onManwonChange,
}: {
  storeId: string;
  manwon: string;
  onManwonChange: (value: string) => void;
}) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["sales-benchmark", storeId],
    queryFn: () => apiClient.getSalesBenchmark(storeId),
    staleTime: 10 * 60 * 1000,
  });
  return (
    <Section title="내 매출 벤치마킹">
      <Notice tone="info">아래 숫자는 이 매장의 실제 매출이 아니라 <strong>소속 상권(없으면 행정동)의 같은 업종 점포당 추정 평균</strong>입니다. 내 실제 월매출을 입력하면 이 평균과 견줘 봅니다.</Notice>
      {isLoading && <Notice tone="muted">불러오는 중...</Notice>}
      {isError && <Notice tone="error">조회 실패: {error.message}</Notice>}
      {data && data.status !== "ok" && <Notice tone="muted">{data.message}</Notice>}
      {data && data.status === "ok" && <Body data={data} manwon={manwon} onManwonChange={onManwonChange} />}
      {data && (
        <>
          <SourceNote title={data.source.title} reference={data.source.reference ?? "-"} />
          {data.status === "ok" &&
            data.caveats.map((c) => (
              <div key={c} style={{ fontSize: 11, color: "#6B7280" }}>
                · {c}
              </div>
            ))}
        </>
      )}
    </Section>
  );
}

function Body({
  data,
  manwon,
  onManwonChange,
}: {
  data: SalesBenchmarkResponse;
  manwon: string;
  onManwonChange: (value: string) => void;
}) {
  const avg = data.per_store_month ?? null;
  return (
    <div>
      <div style={{ fontSize: 12, color: "#374151", marginBottom: 8 }}>
        비교 단위: <strong>{data.unit?.name}</strong> ({data.unit?.type ?? data.unit?.label}) · 서울시 업종 '{data.svc_nm}' 전체 기준 · {data.quarter_label}
        {data.crosswalk_note && <span style={{ color: "#6B7280" }}> ({data.crosswalk_note})</span>}
      </div>
      {data.scls_nm && data.scls_nm !== data.svc_nm && (
        <div style={{ fontSize: 11, color: "#92400E", background: "#FFFBEB", borderRadius: 6, padding: "4px 8px", marginBottom: 8 }}>
          이 매장의 세부 업종은 '{data.scls_nm}'이지만 서울시는 '{data.svc_nm}' 단위로만 매출을 제공해, 아래 매출 숫자는 '{data.svc_nm}' 전체 평균입니다('{data.scls_nm}'만의 값이 아님).
        </div>
      )}
      {data.unit?.fallback_reason && (
        <div style={{ marginBottom: 8 }}>
          <Notice tone="muted">{data.unit.fallback_reason}</Notice>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <Card label="점포당 월평균 추정매출" value={formatKrw(avg)} sub={`점포 ${data.stores}곳 평균`} />
        <Card label={`${data.unit?.peer_label ?? "파일럿"} 중 순위`} value={`${data.rank} / ${data.peer_count}위`} sub="같은 업종 점포당 평균 기준" />
        <Card label="전년 동기 대비" value={formatSignedPct(data.per_store_yoy_pct)} sub="점포당 평균" />
        <Card label="전 분기 대비" value={formatSignedPct(data.per_store_qoq_pct)} sub="계절 영향 있음" />
      </div>

      {(data.warnings ?? []).map((w) => (
        <div key={w} style={{ marginTop: 6 }}>
          <Notice tone="warn">{w}</Notice>
        </div>
      ))}

      <MyRevenueInput
        manwon={manwon}
        onManwonChange={onManwonChange}
        dongAvg={avg}
        peers={data.peers ?? []}
        unitLabel={data.unit?.label ?? "동네"}
        peerLabel={data.unit?.peer_label ?? "파일럿"}
      />

    </div>
  );
}

/** 사장님 월 매출 입력 → 동네 평균·다른 동네 평균들과 비교. 값은 이 컴포넌트 상태에만 있고 네트워크로 나가지 않는다. */
function MyRevenueInput({
  manwon,
  onManwonChange,
  dongAvg,
  peers,
  unitLabel,
  peerLabel,
}: {
  manwon: string;
  onManwonChange: (value: string) => void;
  dongAvg: number | null;
  peers: { name: string; per_store_month: number | null }[];
  unitLabel: string;
  peerLabel: string;
}) {
  const value = parseManwon(manwon);
  const valid = value !== null;
  const peerValues = peers.map((p) => p.per_store_month).filter((v): v is number => v !== null);
  const above = valid ? peerValues.filter((v) => value >= v).length : 0;

  return (
    <div style={{ marginTop: 12, background: "#F9FAFB", borderRadius: 8, padding: "8px 10px" }}>
      <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>
        내 가게 월 매출 입력 (만원)
      </label>
      <input
        type="text"
        inputMode="numeric"
        value={manwon}
        onChange={(e) => onManwonChange(e.target.value)}
        placeholder="예: 3500"
        style={{ width: "100%", padding: "6px 8px", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 13, boxSizing: "border-box" }}
      />
      <div style={{ fontSize: 11, color: "#6B7280", marginTop: 4 }}>입력한 값은 서버로 보내거나 저장하지 않고 이 화면에서만 계산합니다.</div>
      {manwon.trim() !== "" && !valid && <Notice tone="warn">숫자만 입력해 주세요.</Notice>}
      {value !== null && dongAvg !== null && dongAvg > 0 && (
        <div style={{ marginTop: 6, fontSize: 12 }}>
          <div>
            이 {unitLabel} 같은 업종 점포당 평균의 <strong>{((value / dongAvg) * 100).toFixed(0)}%</strong> 수준
            ({value >= dongAvg ? "+" : "-"}
            {formatKrw(Math.abs(value - dongAvg))})
          </div>
          <div style={{ color: "#374151" }}>
            {peerLabel} {peerValues.length}곳의 점포당 평균 중 {above}곳보다 높거나 같음
          </div>
          <div style={{ fontSize: 11, color: "#6B7280" }}>
            비교 대상은 개별 매장이 아니라 {unitLabel}별 평균입니다. 카드 결제 외 현금·배달앱 정산 방식에 따라 기준이 다를 수 있습니다.
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: "#F9FAFB", borderRadius: 8, padding: "8px 10px" }}>
      <div style={{ fontSize: 11, color: "#6b7280" }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 15 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#6B7280" }}>{sub}</div>}
    </div>
  );
}
