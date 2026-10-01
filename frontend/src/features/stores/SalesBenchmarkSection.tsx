import { useQuery } from "@tanstack/react-query";
import { Notice, Section, SourceNote } from "../../components/Notice";
import { apiClient, type FloatingComparison, type SalesBenchmarkResponse } from "../../lib/apiClient";
import { formatKrw, formatSignedPct, parseManwon } from "../../lib/format";

/** '동네 매출 비교' — 매장이 속한 상권(없으면 행정동)·같은 업종의 점포당 월평균 추정매출과 사장님 매출을 비교한다.
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
    <Section title="동네 매출 비교">
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
  const trend = data.trend ?? [];
  const maxTrend = Math.max(1, ...trend.map((t) => t.per_store_month ?? 0));
  return (
    <div>
      <div style={{ fontSize: 12, color: "#374151", marginBottom: 8 }}>
        비교 단위: <strong>{data.unit?.name}</strong> ({data.unit?.type ?? data.unit?.label}) · 서울시 업종 '{data.svc_nm}' · {data.quarter_label}
        {data.crosswalk_note && <span style={{ color: "#6B7280" }}> ({data.crosswalk_note})</span>}
      </div>
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

      <div style={{ fontSize: 11, color: "#6b7280", margin: "12px 0 4px" }}>점포당 월평균 추정매출 추이</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 56 }}>
        {trend.map((t) => (
          <div key={t.quarter} style={{ flex: 1, textAlign: "center" }} title={`${t.label} ${formatKrw(t.per_store_month)}`}>
            <div
              style={{
                height: Math.max(((t.per_store_month ?? 0) / maxTrend) * 44, 1),
                background: "#3B82F6",
                opacity: 0.75,
                borderRadius: 2,
              }}
            />
            <div style={{ fontSize: 9, color: "#6B7280" }}>{t.quarter.slice(2, 4)}.{t.quarter[4]}Q</div>
          </div>
        ))}
      </div>

      {(data.insights ?? []).length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>
            이 {data.unit?.label ?? "동네"} 같은 업종 매출의 특징 ({data.unit?.peer_label ?? "파일럿"} 평균과 비교)
          </div>
          {data.insights!.map((i) => (
            <div key={i.label} style={{ fontSize: 12 }}>
              · {i.text}
            </div>
          ))}
          <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>
            내 가게의 주력 시간대·손님층과 비교해 영업시간·메뉴·홍보 대상을 점검해 보세요.
          </div>
        </div>
      )}

      {data.floating ? (
        <FloatingBlock fl={data.floating} />
      ) : (
        <div style={{ marginTop: 10 }}>
          <Notice tone="muted">이 동네·업종은 유동인구 대비 매출을 계산할 자료가 없습니다.</Notice>
        </div>
      )}

      {(data.composition ?? []).map((g) => (
        <div key={g.group} style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>
            {g.group} 매출 비중 <Swatch color="#3B82F6" /> 이 {data.unit?.label ?? "동네"} <Swatch color="#D1D5DB" /> {data.unit?.peer_label ?? "파일럿"} 평균
          </div>
          {g.items.map((it) => (
            <div key={it.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
              <span style={{ width: 52, color: "#374151" }}>{it.label}</span>
              <div style={{ flex: 1 }}>
                <ShareBar value={it.dong} color="#3B82F6" />
                <ShareBar value={it.pilot} color="#D1D5DB" />
              </div>
              <span style={{ width: 70, textAlign: "right", color: "#374151" }}>
                {pct(it.dong)} / {pct(it.pilot)}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function FloatingBlock({ fl }: { fl: FloatingComparison }) {
  const times = fl.mix.find((g) => g.group === "시간대별")?.items ?? [];
  return (
    <div style={{ marginTop: 12, borderTop: "1px dashed #E5E7EB", paddingTop: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>유동인구 대비 매출</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <Card label="분기 유동인구(상대 지수)" value={fl.flpop === null ? "정보 없음" : `${Math.round(fl.flpop / 1e4).toLocaleString()}만`} sub={`전년 동기 대비 ${formatSignedPct(fl.flpop_yoy_pct)}`} />
        <Card
          label="유동인구 1만 명당 분기 매출"
          value={formatKrw(fl.sales_per_10k)}
          sub={`${fl.rank} / ${fl.peer_count}위 · 비교군 중앙값 ${formatKrw(fl.pilot_median_per_10k)}`}
        />
      </div>

      <div style={{ fontSize: 11, color: "#6b7280", margin: "10px 0 2px" }}>
        시간대별 비중 <Swatch color="#10B981" /> 유동인구 <Swatch color="#3B82F6" /> 이 업종 매출
      </div>
      {times.map((it) => (
        <div key={it.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
          <span style={{ width: 52, color: "#374151" }}>{it.label}</span>
          <div style={{ flex: 1 }}>
            <ShareBar value={it.flpop} color="#10B981" />
            <ShareBar value={it.sales} color="#3B82F6" />
          </div>
          <span style={{ width: 70, textAlign: "right", color: "#374151" }}>
            {pct(it.flpop)} / {pct(it.sales)}
          </span>
        </div>
      ))}

      {fl.gaps.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {fl.gaps.map((g) => (
            <div key={g.label} style={{ fontSize: 12 }}>
              · {g.text}
            </div>
          ))}
          <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>
            사람은 많은데 매출로 덜 이어지는 시간대·손님층은 영업시간·메뉴·홍보를 점검해 볼 만한 후보입니다.
          </div>
        </div>
      )}
      <SourceNote title={fl.source.title} reference={fl.source.reference} />
      {fl.caveats.map((c) => (
        <div key={c} style={{ fontSize: 11, color: "#6B7280" }}>
          · {c}
        </div>
      ))}
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

function ShareBar({ value, color }: { value: number | null; color: string }) {
  return <div style={{ height: 4, width: `${Math.round((value ?? 0) * 100)}%`, background: color, borderRadius: 2, marginBottom: 1 }} />;
}

function Swatch({ color }: { color: string }) {
  return <span style={{ display: "inline-block", width: 8, height: 8, background: color, margin: "0 2px 0 6px" }} />;
}

function pct(v: number | null): string {
  return v === null ? "-" : `${(v * 100).toFixed(0)}%`;
}
