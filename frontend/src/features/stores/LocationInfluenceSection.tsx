import { Fold, Notice, Section, SourceNote } from "../../components/Notice";
import { ScopeTag } from "../../components/ScopeTag";
import { Term } from "../../components/Term";
import type { BusAccess, DemandType, LocationFactor, LocationInfluenceResponse } from "../../lib/apiClient";
import { busCountNote, busCountText, busUsageLines } from "../../lib/busText";
import { formatDistance } from "../../lib/format";
import { densityText, effectSentence, factorValueText, percentileText, radiusLabel } from "../../lib/locationText";
import { ZONE_COLORS } from "../../lib/vizConfig";
import { useLocationInfluence, useStoreAnchors } from "./useStores";

export const DEFAULT_RADIUS_M = 500;
const TYPE_STYLE: Record<DemandType, { bg: string; fg: string }> = {
  업무형: { bg: "#DBEAFE", fg: "#1E3A8A" },
  혼합형: { bg: "#F3E8FF", fg: "#6B21A8" },
  주거형: { bg: "#DCFCE7", fg: "#166534" },
};

/** '반경 주변 입지' — ① 상업·경쟁 환경 ② 대중교통 접근성 ③ 대중교통 이용 수요 (모두 직선거리, 같은 반경).
 * 반경은 이 블록의 토글로만 고르고 상태는 매장 상세 패널이 들고 있어 아래 개폐업 블록·④ 분석 기준과 같은 값을 쓴다. 요약 칩은 500m 고정이다. */
export function LocationRadiusSection({ storeId, radius, onRadiusChange }: { storeId: string; radius: number; onRadiusChange: (m: number) => void }) {
  const { data, isLoading, isError, error, isPlaceholderData, refetch } = useLocationInfluence(storeId, radius);
  const options = data?.radius_options ?? [250, 500, 1000];
  return (
    <Section
      title="반경 주변 입지 — 상업·교통"
      scope={<ScopeTag kind="radius" label={`반경 ${radiusLabel(radius)}`} />}
      right={
        <div role="group" aria-label="분석 반경" style={{ display: "flex", gap: 4 }}>
          {options.map((m) => (
            <button key={m} type="button" aria-pressed={m === radius} onClick={() => onRadiusChange(m)} style={m === radius ? radiusOn : radiusOff}>
              {radiusLabel(m)}
            </button>
          ))}
        </div>
      }
    >
      {isLoading && <Notice tone="muted">주변을 분석하는 중...</Notice>}
      {isError && (
        <Notice tone="error">
          조회 실패: {error.message}{" "}
          <button type="button" onClick={() => refetch()} style={{ marginLeft: 4, cursor: "pointer" }}>다시 시도</button>
        </Notice>
      )}
      {data && (
        <div aria-busy={isPlaceholderData} style={{ opacity: isPlaceholderData ? 0.5 : 1, pointerEvents: isPlaceholderData ? "none" : "auto" }}>
          {isPlaceholderData && <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 4 }}>{radiusLabel(radius)} 기준으로 다시 계산하는 중...</div>}
          <CommerceBlock data={data} storeId={storeId} />
          <TransitAccessBlock bus={data.radius_metrics.bus} radiusText={radiusLabel(data.radius_m)} />
          <TransitDemandBlock bus={data.radius_metrics.bus} radiusText={radiusLabel(data.radius_m)} />
        </div>
      )}
    </Section>
  );
}

/** ④ 분석 기준 자세히 보기 — ①~③ 과 같은 반경의 응답(같은 쿼리 키라 추가 요청 없음)에서 원천·기준일·한계를 접어 보여준다. */
export function RadiusBasisSection({ storeId, radius }: { storeId: string; radius: number }) {
  const { data } = useLocationInfluence(storeId, radius);
  if (!data) return null;
  const { anchors, competitors, bus } = data.radius_metrics;
  return (
    <Section title="분석 기준 자세히 보기" scope={<ScopeTag kind="radius" label={`반경 ${radiusLabel(data.radius_m)}`} />}>
      <Fold title="원천자료·기준일·한계 펼치기">
        <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: "#4B5563", lineHeight: 1.6 }}>
          <li>거리는 모두 직선거리입니다. 큰 도로·철도·하천 때문에 실제 도보 거리는 더 길 수 있습니다.</li>
          <li>{competitors.basis}. 선택 매장은 제외했습니다. 밀도는 점포 수 ÷ 원의 넓이(π·반경²) 단순 환산입니다.</li>
          <li>상가정보 기반 점포 수는 위 ① 입니다. 인허가 기반 영업·폐업 현황은 아래 '개폐업' 블록에서 따로 봅니다(서로 다른 자료라 수가 다를 수 있음).</li>
          {anchors.note && <li>{anchors.note}</li>}
          {bus.status === "ok" ? (
            <>
              <li>버스: {bus.source.title} ({bus.source.reference}). {bus.usage_basis.text}.</li>
              <li>분석 범위: {bus.scope.extent}. {bus.scope.complete ? "이 반경은 수집 범위 안에 있습니다." : bus.scope.reason}</li>
              {bus.caveats.map((c) => <li key={c}>{c}</li>)}
              <li>
                이용량 미연결 사유({bus.selected.unlinked}곳):{" "}
                {bus.selected.unlinked_breakdown.length === 0 ? "없음" : bus.selected.unlinked_breakdown.map((b) => `${b.label} ${b.count}곳`).join(" · ")}
              </li>
            </>
          ) : (
            <li>{bus.message}</li>
          )}
        </ul>
        <SourceNote title={data.source.title} reference={data.source.reference} />
      </Fold>
    </Section>
  );
}

/** '입지 영향력 — 상권 수요 유형·입지 요인' — ① 소속 상권 수요 유형 ② 입지 요인과 점포당 추정매출의 관계(상관, 인과 아님).
 * 매장 개별 매출 예측이나 점수는 만들지 않는다. 상권 단위 값이라 반경과 무관하다. */
export function LocationAreaSection({ storeId }: { storeId: string }) {
  const { data, isLoading, isError, error, refetch } = useLocationInfluence(storeId, DEFAULT_RADIUS_M);
  return (
    <Section title="입지 영향력 — 상권 수요 유형·입지 요인" scope={<ScopeTag kind="area" label="소속 상권" />}>
      {isLoading && <Notice tone="muted">상권을 분석하는 중...</Notice>}
      {isError && (
        <Notice tone="error">
          조회 실패: {error.message}{" "}
          <button type="button" onClick={() => refetch()} style={{ marginLeft: 4, cursor: "pointer" }}>다시 시도</button>
        </Notice>
      )}
      {data && (
        <div>
          <div style={{ fontSize: 12, color: "#374151", marginBottom: 8 }}>
            상권 주변을 숫자로 바꾼 값이에요. 상관 관계이며 <strong>이 매장의 매출을 예측하지 않아요.</strong>
          </div>
          <AreaBlock data={data} />
          <ModelBlock data={data} />
          <Fold title="해석 한계 보기">
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: "#6B7280", lineHeight: 1.6 }}>
              {data.caveats.map((c) => <li key={c}>{c}</li>)}
            </ul>
          </Fold>
          <SourceNote title={data.source.title} reference={data.source.reference} />
        </div>
      )}
    </Section>
  );
}

/** ① 상업·경쟁 환경 */
function CommerceBlock({ data, storeId }: { data: LocationInfluenceResponse; storeId: string }) {
  const { anchors, competitors } = data.radius_metrics;
  // 스세권·다세권(도보권) 판정은 반경과 무관한 매장 기준 값이라 같은 칸에 덧붙인다. 조회 전·실패면 덧붙이지 않는다.
  const walk = useStoreAnchors(storeId).data;
  const zoneText = (brand: string) => {
    const z = walk?.brands.find((x) => x.brand === brand);
    if (!walk || !z) return "";
    return ` · ${z.in_zone ? `${brand === "starbucks" ? "스세권" : "다세권"}(도보 ${walk.walk_m}m 이내)` : `도보권(${walk.walk_m}m) 밖`}`;
  };
  const same = competitors.same_category;
  return (
    <div style={card}>
      <div style={cardTitle}>① 상업·경쟁 환경 (상가정보 기준)</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 6 }}>
        {anchors.status === "ok" ? (
          anchors.brands.map((b) => (
            <Stat key={b.brand} accent={ZONE_COLORS[b.brand]} label={b.label} value={`${b.count}곳`} sub={`가장 가까운 곳 ${b.nearest_m === null ? "자료 없음" : formatDistance(b.nearest_m)}${zoneText(b.brand)}`} />
          ))
        ) : (
          <div style={{ gridColumn: "1 / -1" }}><Notice tone="muted">{anchors.message}</Notice></div>
        )}
        <Stat label={`같은 ${same.level}(${same.label})`} value={`${same.count}곳`}
          sub={`${densityText(same.count, data.radius_m)} · ${same.nearest_m === null ? "가장 가까운 곳 없음" : same.nearest_m === 0 ? "가장 가까운 곳 같은 건물(0m)" : `가장 가까운 곳 ${formatDistance(same.nearest_m)}`}`} />
        <Stat label={`전체 ${competitors.same_large_category.label}`} value={`${competitors.same_large_category.count}곳`} sub={`같은 ${competitors.same_large_category.level} 전체`} />
        <Stat label="전체 업소" value={`${competitors.all_stores.count.toLocaleString("ko-KR")}곳`} sub="업종 구분 없이 반경 안 모두" />
      </div>
    </div>
  );
}

/** ② 대중교통 접근성 — 정류장 수·최근접·이용량 연결(연결률). 0곳·확인 불가·일부 범위 밖을 문구로 구분한다. */
function TransitAccessBlock({ bus, radiusText }: { bus: BusAccess; radiusText: string }) {
  if (bus.status !== "ok") {
    return (
      <div style={card}>
        <div style={cardTitle}>② 대중교통 접근성</div>
        <div style={{ marginTop: 4 }}><Notice tone="muted">{bus.message}</Notice></div>
      </div>
    );
  }
  const s = bus.selected;
  const nearest = bus.nearest;
  return (
    <div style={card}>
      <div style={cardTitle}>② 대중교통 접근성 — 반경 {radiusText} 버스정류장</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 6 }}>
        <Stat big label="버스정류장" value={busCountText(s)} sub={busCountNote(s, null)} accent="#0891B2" />
        <Stat big label="가장 가까운 정류장" value={nearest ? formatDistance(nearest.distance_m) : "자료 없음"} sub={nearest ? (nearest.reliable ? "직선거리" : "직선거리 · 수집 범위 밖일 수 있음") : undefined} />
        <Stat big label="이용량 연결" value={s.count === 0 || s.linked_ratio === null ? "해당 없음" : `${s.linked}/${s.count}곳`} sub={s.linked_ratio === null ? undefined : `연결률 ${Math.round(s.linked_ratio * 100)}%`} />
      </div>
      {bus.scope.reason && <div style={{ marginTop: 6 }}><Notice tone="warn">{bus.scope.reason}</Notice></div>}
    </div>
  );
}

/** ③ 대중교통 이용 수요 — 승차·하차를 따로, 연결된 정류장만의 관측된 부분 합계. 승차+하차(+환승) 합계는 만들지 않는다. */
function TransitDemandBlock({ bus, radiusText }: { bus: BusAccess; radiusText: string }) {
  if (bus.status !== "ok") return null;
  const s = bus.selected;
  const usage = busUsageLines(s);
  return (
    <div style={card}>
      <div style={cardTitle}>③ 대중교통 이용 수요 — 반경 {radiusText} ({bus.usage_basis.year}년 일 평균)</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 6 }}>
        <Stat big label="승차 인원" value={usage.boardings} sub={usage.partial ? "연결된 정류장만 더한 값" : undefined} />
        <Stat big label="하차 인원" value={usage.alightings} sub={usage.partial ? "연결된 정류장만 더한 값" : undefined} />
      </div>
      <div style={fine}>
        {usage.partial
          ? `이용량이 연결되지 않은 ${s.unlinked}곳은 빠져 있어 이 반경 전체의 값이 아닙니다. `
          : ""}
        정류장 승·하차 기록이며 실시간 유동인구나 매장 방문객 수가 아닙니다. 승차와 하차는 합치지 않았습니다.
      </div>
    </div>
  );
}

function AreaBlock({ data }: { data: LocationInfluenceResponse }) {
  const a = data.area;
  return (
    <div style={card}>
      <div style={cardTitle}>{a.level_label} 수요 유형 — {a.name}{a.trdar_type ? `(${a.trdar_type})` : ""}</div>
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
      <div style={{ ...cardTitle, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span>입지 요인과 점포당 추정매출의 관계(상권 평균)</span>
        <ScopeTag kind="area" label="상권 단위 통계" />
      </div>
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

function Stat({ label, value, sub, accent, big }: { label: string; value: string; sub?: string; accent?: string; big?: boolean }) {
  return (
    <div style={{ background: "#fff", borderRadius: 8, padding: "6px 8px", borderLeft: accent ? `3px solid ${accent}` : "3px solid #E5E7EB" }}>
      <div style={{ fontSize: 11, color: "#6B7280" }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: big ? 18 : 15 }}>{value}</div>
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
