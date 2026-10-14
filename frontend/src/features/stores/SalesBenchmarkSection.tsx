import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Fold, Notice, Section, SourceNote } from "../../components/Notice";
import { ScopeTag } from "../../components/ScopeTag";
import { Term } from "../../components/Term";
import { compareBasis } from "../../lib/compareBasis";
import { CompareBasisBox } from "./CompareBasisBox";
import { usePeerStores } from "./useStores";
import { apiClient, type GrowthCell, type SalesBenchmarkResponse } from "../../lib/apiClient";
import { formatKrw, formatSignedPct, parseManwon } from "../../lib/format";

/** '내 매출 비교' — 매장이 속한 상권(없으면 행정동)·같은 업종의 점포당 월평균 추정매출과 사장님 매출을 비교한다.
 * 입력한 매출은 이 화면 안에서만 계산하고 서버로 보내거나 저장하지 않는다. */
export function SalesBenchmarkSection({
  storeId,
  manwon,
  latestMonth,
}: {
  storeId: string;
  /** 기록한 가장 최근 달의 월 매출(만원). 기록이 없으면 빈 문자열 */
  manwon: string;
  latestMonth: string | null;
}) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["sales-benchmark", storeId],
    queryFn: () => apiClient.getSalesBenchmark(storeId),
    staleTime: 10 * 60 * 1000,
  });
  const peers = usePeerStores(storeId);
  const peerCount = peers.data?.status === "ok" ? peers.data.count : null;
  return (
    <Section title="내 매출 비교 — 소속 상권 동일 업종 추정 평균" scope={<ScopeTag kind="area" label="소속 상권" />}>
      <Notice tone="info">아래 숫자는 이 매장의 실제 매출이 아니라 <strong>소속 상권(없으면 행정동)의 같은 업종 점포당 추정 평균</strong>입니다. '내 가게 점검'에 기록한 월 매출(가장 최근 달)을 이 평균과 견줘 봅니다.</Notice>
      {isLoading && <Notice tone="muted">불러오는 중...</Notice>}
      {isError && <Notice tone="error">조회 실패: {error.message}</Notice>}
      {data && data.status !== "ok" && <Notice tone="muted">{data.message}</Notice>}
      {data && data.status === "ok" && <Body data={data} peerCount={peerCount} manwon={manwon} latestMonth={latestMonth} />}
      {data && data.status !== "ok" && <SourceNote title={data.source.title} reference={data.source.reference ?? "-"} />}
    </Section>
  );
}

function Body({
  data,
  peerCount,
  manwon,
  latestMonth,
}: {
  data: SalesBenchmarkResponse;
  peerCount: number | null;
  manwon: string;
  latestMonth: string | null;
}) {
  const avg = data.per_store_month ?? null;
  const mismatch = data.scls_nm && data.scls_nm !== data.svc_nm;
  return (
    <div>
      <div style={{ marginTop: 10 }}>
        <Card
          label={<Term id="perStoreMonth" label="소속 상권 동일 업종 점포당 월평균 추정매출(이 매장의 매출 아님)" />}
          value={formatKrw(avg)}
          sub={`${data.unit?.name} · '${data.svc_nm}' 전체 · 점포 ${data.stores}곳 평균 · ${data.quarter_label}`}
        />
      </div>
      {data.unit && data.svc_nm && (
        <CompareBasisBox
          basis={compareBasis({
            level: data.unit.level, unitName: data.unit.name, unitType: data.unit.type, fallbackReason: data.unit.fallback_reason,
            svcNm: data.svc_nm, sclsNm: data.scls_nm ?? null, peerCount,
          })}
          quarter={data.quarter_label}
          showLegend={peerCount !== null}
        />
      )}
      {(data.warnings ?? []).map((w) => (
        <div key={w} style={{ marginTop: 6 }}>
          <Notice tone="warn">{w}</Notice>
        </div>
      ))}

      <RevenueComparison
        manwon={manwon}
        latestMonth={latestMonth}
        dongAvg={avg}
        peers={data.peers ?? []}
        unitLabel={data.unit?.label ?? "동네"}
        peerLabel={data.unit?.peer_label ?? "파일럿"}
      />

      <Fold title="상권 평균의 순위·증감 보기">
        <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 6 }}>
          {data.unit?.peer_label ?? "파일럿"} 중 순위: <strong>{data.rank} / {data.peer_count}위</strong> (같은 업종 점포당 평균 기준)
        </div>
        {data.growth ? (
          <>
            <GrowthRow title="전년 동기 대비" pair={data.growth.yoy} />
            <GrowthRow title="직전 분기 대비(계절 영향 있음)" pair={data.growth.qoq} />
            <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 4 }}>
              총매출 증감은 점포 수 변화가 섞인 값이고, 점포당 평균매출 증감은 점포 수로 나눈 값이라 서로 다른 지표입니다. 둘 다 명목값이며, 비교하는 두 분기의 점포 수 중 작은 쪽이 10곳 미만이면 계산하지 않고 10~19곳이면 변동성 주의를 붙입니다.
            </div>
          </>
        ) : (
          <Notice tone="muted">증감 자료 없음</Notice>
        )}
      </Fold>

      <Fold title="계산 기준 보기">
        <div style={{ fontSize: 12, color: "#374151" }}>
          비교 단위: <strong>{data.unit?.name}</strong> ({data.unit?.type ?? data.unit?.label}) · 서울시 업종 '{data.svc_nm}' 전체 기준 · {data.quarter_label}
          {data.crosswalk_note && <span style={{ color: "#6B7280" }}> ({data.crosswalk_note})</span>}
        </div>
        {mismatch && (
          <div style={{ fontSize: 11, color: "#92400E", marginTop: 4 }}>
            이 매장의 세부 업종은 '{data.scls_nm}'이지만 서울시는 '{data.svc_nm}' 단위로만 매출을 제공해, 위 매출 숫자는 '{data.svc_nm}' 전체 평균입니다('{data.scls_nm}'만의 값이 아님).
          </div>
        )}
        <SourceNote title={data.source.title} reference={data.source.reference ?? "-"} />
        {data.caveats.map((c) => (
          <div key={c} style={{ fontSize: 11, color: "#6B7280" }}>
            · {c}
          </div>
        ))}
      </Fold>
    </div>
  );
}

/** 사장님 월 매출 입력 → 동네 평균·다른 동네 평균들과 비교. 값은 이 컴포넌트 상태에만 있고 네트워크로 나가지 않는다. */
function GrowthRow({ title, pair }: { title: string; pair: { compare_label: string; total_sales: GrowthCell; per_store: GrowthCell } }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 600 }}>
        {title} <span style={{ fontWeight: 400, color: "#6B7280" }}>· 비교 {pair.compare_label}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 4 }}>
        <GrowthCard label="총매출 증감" cell={pair.total_sales} />
        <GrowthCard label="점포당 평균매출 증감" cell={pair.per_store} />
      </div>
    </div>
  );
}

function GrowthCard({ label, cell }: { label: string; cell: GrowthCell }) {
  const shown = cell.value !== null;
  return (
    <div style={{ background: "#F9FAFB", borderRadius: 8, padding: "8px 10px" }}>
      <div style={{ fontSize: 11, color: "#6b7280" }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 15, color: shown ? "#111827" : "#9CA3AF" }}>{shown ? formatSignedPct(cell.value) : cell.status === "too_few" ? "표본 작음" : "자료 없음"}</div>
      {cell.message && <div style={{ fontSize: 10, color: cell.status === "caution" ? "#B45309" : "#6B7280" }}>{cell.message}</div>}
    </div>
  );
}

/** 내 월 매출(기록한 가장 최근 달)을 동네 평균·다른 동네 평균들과 견준다. 입력은 '내 가게 점검'에서만 받고 여기서는 읽기만 한다. */
function RevenueComparison({
  manwon,
  latestMonth,
  dongAvg,
  peers,
  unitLabel,
  peerLabel,
}: {
  manwon: string;
  latestMonth: string | null;
  dongAvg: number | null;
  peers: { name: string; per_store_month: number | null }[];
  unitLabel: string;
  peerLabel: string;
}) {
  const value = parseManwon(manwon);
  const peerValues = peers.map((p) => p.per_store_month).filter((v): v is number => v !== null);
  const above = value !== null ? peerValues.filter((v) => value >= v).length : 0;

  return (
    <div style={{ marginTop: 12, background: "#F9FAFB", borderRadius: 8, padding: "8px 10px" }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>내 월 매출과 견주기</div>
      {value === null ? (
        <div style={{ fontSize: 12, color: "#6B7280" }}>위 '내 가게 점검'에 월 매출을 기록하면 이 평균과 견줘 드려요. 입력은 한 곳에서만 받고, 가장 최근 달의 값을 씁니다.</div>
      ) : (
        <div style={{ fontSize: 11, color: "#6B7280" }}>기록한 가장 최근 달{latestMonth ? ` ${latestMonth}` : ""} · {formatKrw(value)} 기준</div>
      )}
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

function Card({ label, value, sub }: { label: ReactNode; value: string; sub?: string }) {
  return (
    <div style={{ background: "#F9FAFB", borderRadius: 8, padding: "8px 10px" }}>
      <div style={{ fontSize: 11, color: "#6b7280" }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 15 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#6B7280" }}>{sub}</div>}
    </div>
  );
}
