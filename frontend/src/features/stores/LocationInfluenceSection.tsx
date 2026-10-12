import { useState } from "react";
import { Fold, Notice, Section, SourceNote } from "../../components/Notice";
import { Term } from "../../components/Term";
import type { DemandType, LocationFactor, LocationInfluenceResponse } from "../../lib/apiClient";
import { formatDistance } from "../../lib/format";
import { effectSentence, factorValueText, percentileText, radiusLabel } from "../../lib/locationText";
import { ZONE_COLORS } from "../../lib/vizConfig";
import { useLocationInfluence } from "./useStores";

const DEFAULT_RADIUS_M = 500;
const TYPE_STYLE: Record<DemandType, { bg: string; fg: string }> = {
  업무형: { bg: "#DBEAFE", fg: "#1E3A8A" },
  혼합형: { bg: "#F3E8FF", fg: "#6B21A8" },
  주거형: { bg: "#DCFCE7", fg: "#166534" },
};

/** '입지 영향력 분석' — ① 반경 안 앵커·경쟁 점포(공간분석) ② 상권 수요 유형 ③ 입지 요인과 점포당 추정매출의 관계(상관, 인과 아님).
 * 매장 개별 매출 예측이나 점수는 만들지 않는다. */
export function LocationInfluenceSection({ storeId }: { storeId: string }) {
  const [radius, setRadius] = useState(DEFAULT_RADIUS_M);
  const { data, isLoading, isError, error, isPlaceholderData, refetch } = useLocationInfluence(storeId, radius);
  const options = data?.radius_options ?? [250, 500, 1000];
  return (
    <Section
      title="입지 영향력 분석"
      right={
        <div role="group" aria-label="분석 반경" style={{ display: "flex", gap: 4 }}>
          {options.map((m) => (
            <button key={m} type="button" aria-pressed={m === radius} onClick={() => setRadius(m)} style={m === radius ? radiusOn : radiusOff}>
              {radiusLabel(m)}
            </button>
          ))}
        </div>
      }
    >
      {isLoading && <Notice tone="muted">입지를 분석하는 중...</Notice>}
      {isError && (
        <Notice tone="error">
          조회 실패: {error.message}{" "}
          <button type="button" onClick={() => refetch()} style={{ marginLeft: 4, cursor: "pointer" }}>다시 시도</button>
        </Notice>
      )}
      {data && (
        <div aria-busy={isPlaceholderData} style={{ opacity: isPlaceholderData ? 0.5 : 1, pointerEvents: isPlaceholderData ? "none" : "auto" }}>
          {isPlaceholderData && <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 4 }}>{radiusLabel(radius)} 기준으로 다시 계산하는 중...</div>}
          <Body data={data} />
        </div>
      )}
    </Section>
  );
}

function Body({ data }: { data: LocationInfluenceResponse }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "#374151", marginBottom: 8 }}>
        매장 주변을 숫자로 바꾼 값이에요. 상관 관계이며 <strong>이 매장의 매출을 예측하지 않아요.</strong>
      </div>
      <RadiusBlock data={data} />
      <AreaBlock data={data} />
      <ModelBlock data={data} />
      <Fold title="해석 한계 보기">
        <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: "#6B7280", lineHeight: 1.6 }}>
          {data.caveats.map((c) => <li key={c}>{c}</li>)}
        </ul>
      </Fold>
      <SourceNote title={data.source.title} reference={data.source.reference} />
    </div>
  );
}

function RadiusBlock({ data }: { data: LocationInfluenceResponse }) {
  const { anchors, competitors } = data.radius_metrics;
  const r = radiusLabel(data.radius_m);
  return (
    <div style={card}>
      <div style={cardTitle}>① 반경 {r} 안 주변 환경(직선거리)</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 6 }}>
        {anchors.status === "ok" ? (
          anchors.brands.map((b) => (
            <Stat key={b.brand} accent={ZONE_COLORS[b.brand]} label={b.label} value={`${b.count}곳`} sub={`가장 가까운 곳 ${b.nearest_m === null ? "자료 없음" : formatDistance(b.nearest_m)}`} />
          ))
        ) : (
          <div style={{ gridColumn: "1 / -1" }}><Notice tone="muted">{anchors.message}</Notice></div>
        )}
        <Stat label={`같은 ${competitors.same_category.level}(${competitors.same_category.label})`} value={`${competitors.same_category.count}곳`}
          sub={competitors.same_category.nearest_m === null ? "가장 가까운 곳 없음" : competitors.same_category.nearest_m === 0 ? "가장 가까운 곳 같은 건물(0m)" : `가장 가까운 곳 ${formatDistance(competitors.same_category.nearest_m)}`} />
        <Stat label={`같은 ${competitors.same_large_category.level}(${competitors.same_large_category.label})`} value={`${competitors.same_large_category.count}곳`} sub={`반경 안 전체 업소 ${competitors.all_stores.count.toLocaleString("ko-KR")}곳`} />
      </div>
      <div style={fine}>{competitors.basis}. 선택 매장은 제외했어요.{anchors.note ? ` ${anchors.note}` : ""}</div>
    </div>
  );
}

function AreaBlock({ data }: { data: LocationInfluenceResponse }) {
  const a = data.area;
  return (
    <div style={card}>
      <div style={cardTitle}>② {a.level_label} 수요 유형 — {a.name}{a.trdar_type ? `(${a.trdar_type})` : ""}</div>
      {a.fallback_reason && <div style={{ marginTop: 6 }}><Notice tone="muted">{a.fallback_reason}</Notice></div>}
      {a.demand_type === null ? (
        <div style={{ marginTop: 6 }}><Notice tone="warn">{a.message}</Notice></div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
            <span style={{ ...TYPE_STYLE[a.demand_type], borderRadius: 12, padding: "2px 10px", fontWeight: 700, fontSize: 13 }}>{a.demand_type}</span>
            <span style={{ fontSize: 12, color: "#374151" }}>{a.basis}</span>
            <Term id="demandType" label="" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 8 }}>
            <Stat label="직장인구 비중" value={a.worker_share === null || a.worker_share === undefined ? "자료 없음" : `${a.worker_share}%`} />
            <Stat label="직장인구" value={a.workers === null || a.workers === undefined ? "자료 없음" : `${a.workers.toLocaleString("ko-KR")}명`} />
            <Stat label="상주인구" value={a.residents === null || a.residents === undefined ? "자료 없음" : `${a.residents.toLocaleString("ko-KR")}명`} />
          </div>
          <div style={fine}>
            {a.rule} · 지하철역 {a.has_subway === null || a.has_subway === undefined ? "자료 없음" : a.has_subway ? "영역 안에 있음" : "영역 안에 없음"} ·
            같은 단위 분포 {Object.entries(a.type_counts).map(([t, n]) => `${t} ${n}곳`).join(" · ")}
          </div>
          {a.time_pattern && (
            <Fold title="유동인구 시간대 패턴 보기(유형이 맞는지 확인용)">
              <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ color: "#6B7280", textAlign: "left" }}><th scope="col">시간대</th><th scope="col">이 {a.level_label}</th><th scope="col">파일럿 중앙값</th></tr>
                </thead>
                <tbody>
                  {a.time_pattern.items.map((it) => (
                    <tr key={it.key}>
                      <th scope="row" style={{ fontWeight: 400, textAlign: "left" }}>{it.label}</th>
                      <td>{it.share === null ? "자료 없음" : `${it.share}%`}</td>
                      <td>{it.median === null ? "자료 없음" : `${it.median}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={fine}>{a.time_pattern.quarter} 기준. {a.time_pattern.note}</div>
            </Fold>
          )}
        </>
      )}
    </div>
  );
}

function ModelBlock({ data }: { data: LocationInfluenceResponse }) {
  const m = data.model;
  return (
    <div style={card}>
      <div style={cardTitle}>③ 입지 요인과 점포당 추정매출의 관계(상권 평균)</div>
      {m.status !== "ok" || !m.factors ? (
        <div style={{ marginTop: 6 }}><Notice tone="warn">{m.message ?? "분석 자료 부족"}</Notice></div>
      ) : (
        <>
          {m.reliability_note && <div style={{ marginTop: 6 }}><Notice tone="warn">{m.reliability_note}</Notice></div>}
          {m.not_in_sample_reason && <div style={{ marginTop: 6 }}><Notice tone="muted">{m.not_in_sample_reason}</Notice></div>}
          <div style={{ fontSize: 11, color: "#6B7280", marginTop: 6 }}>
            서울시 음식 업종 상권×업종 {m.rows}개를 비교했어요. 값이 <Term id="effectPerSd" label="표준편차 1" />만큼 클 때의 차이로 보여줘요.
          </div>
          <ul style={{ listStyle: "none", margin: "6px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            {m.factors.map((f) => <FactorRow key={f.key} f={f} dim={!m.useful} />)}
          </ul>
          <Fold title="모델 기준·검증 보기">
            {m.cv && <div style={{ fontSize: 11, color: "#374151" }}>{m.cv.text}</div>}
            <ul style={{ margin: "6px 0 0", paddingLeft: 16, fontSize: 11, color: "#6B7280", lineHeight: 1.6 }}>
              {m.factors.map((f) => <li key={f.key}>{f.label}: {f.definition}(출처 {f.source})</li>)}
              <li>비교 대상: 서울시 음식 업종 상권×업종 {m.rows}개(상권 {m.clusters}곳). 목표값은 최근 분기 점포당 추정매출(로그)이고 업종 차이는 통제했어요.</li>
              {m.high_vif && m.high_vif.length > 0 && <li>요인끼리 값이 비슷하게 움직이는 항목: {m.high_vif.join(", ")} — 개별 계수를 조심해서 보세요.</li>}
            </ul>
          </Fold>
        </>
      )}
    </div>
  );
}

function FactorRow({ f, dim }: { f: LocationFactor; dim: boolean }) {
  const mine = factorValueText(f.store_value, f.unit, f.binary);
  return (
    <li style={{ background: "#F9FAFB", borderRadius: 8, padding: "8px 10px", opacity: dim ? 0.75 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
        <strong style={{ fontSize: 13 }}>{f.label}</strong>
        <span style={{ fontSize: 12, fontWeight: 700, color: f.significant ? (f.direction === "positive" ? "#166534" : "#991B1B") : "#6B7280" }}>
          {f.significant ? `${f.direction === "positive" ? "▲" : "▼"} ${f.tendency}` : f.tendency}
        </span>
      </div>
      <div style={{ fontSize: 12, color: "#374151", marginTop: 2 }}>{effectSentence(f)}</div>
      {mine !== null && (
        <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>
          이 상권의 값 {mine}{f.binary ? "" : ` · 같은 업종 상권 중 ${percentileText(f.store_percentile)}`}
        </div>
      )}
    </li>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div style={{ background: "#fff", borderRadius: 8, padding: "6px 8px", borderLeft: accent ? `3px solid ${accent}` : "3px solid #E5E7EB" }}>
      <div style={{ fontSize: 11, color: "#6B7280" }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 15 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#6B7280" }}>{sub}</div>}
    </div>
  );
}

const card: React.CSSProperties = { background: "#F9FAFB", borderRadius: 8, padding: "8px 10px", marginBottom: 10 };
const cardTitle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#374151" };
const fine: React.CSSProperties = { fontSize: 11, color: "#6B7280", marginTop: 6, lineHeight: 1.5 };
const radiusBase: React.CSSProperties = { padding: "2px 8px", borderRadius: 12, fontSize: 11, cursor: "pointer", border: "1px solid #D1D5DB" };
const radiusOn: React.CSSProperties = { ...radiusBase, background: "#1D4ED8", color: "#fff", borderColor: "#1D4ED8", fontWeight: 700 };
const radiusOff: React.CSSProperties = { ...radiusBase, background: "#fff", color: "#374151" };
