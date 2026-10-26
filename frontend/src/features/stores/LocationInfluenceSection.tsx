import { StationName } from "../area/AreaCharacterSection";
import { AppIcon, PopulationMix, MetricBars } from "../../components/DataVisuals";
import { StoreTransitVisuals, StoreFacilityVisuals } from "./StoreEnvironmentVisuals";
import { Fold, Notice, Section, SourceNote } from "../../components/Notice";
import { Caveat } from "../../components/NoteHost";
import { ScopeTag } from "../../components/ScopeTag";
import { Term } from "../../components/Term";
import type { FacilityAccess, LocationFactor, LocationInfluenceResponse } from "../../lib/apiClient";
import { FACILITY_GROUPS, FACILITY_MARK, facilityCountNote, facilityCountText, facilityNearestText, facilityNeighborNote, facilityStaleNote, facilityStatusNote, facilitySubtypeText, facilityUnclassifiedNote, SUBTYPE_SHOWN } from "../../lib/facilityText";
import { formatDistance } from "../../lib/format";
import { effectSentence, factorValueText, percentileText, radiusLabel } from "../../lib/locationText";
import { ZONE_COLORS } from "../../lib/vizConfig";
import { useLocationInfluence } from "./useStores";
import { Block } from "../../components/PanelKit";
import { BLOCK_GAP, PK } from "../../lib/panelStyle";
import { FS } from "../../lib/typography";

export const DEFAULT_RADIUS_M = 500;

/** '주변 환경' 묶음의 반경 입지 — 한눈에 → 교통 접근성(요약) → 주요 집객시설 → 근처 스타벅스·다이소·올리브영 (모두 직선거리, 같은 반경).
 * 같은 업종 가게 찾기와 개폐업은 '경쟁' 묶음에 있다. 반경 상태는 매장 상세 패널이 들고 있어 두 묶음의 토글(RadiusToggle)이 같은 값을 쓴다. 요약 칩은 500m 고정이다. */
export function LocationRadiusSection({ storeId, radius, onRadiusChange, showFacilities, onShowFacilitiesChange }: {
  storeId: string;
  radius: number;
  onRadiusChange: (m: number) => void;
  /** 주요 집객시설을 지도에 표시할지(기본 꺼짐) — 상태는 매장 상세 패널이 들고 있다 */
  showFacilities: boolean;
  onShowFacilitiesChange: (v: boolean) => void;
}) {
  const { data, isLoading, isError, error, isPlaceholderData, refetch } = useLocationInfluence(storeId, radius);
  const options = data?.radius_options ?? [250, 500, 1000];
  return (
    <div className="store-environment">
      <RadiusToggle radius={radius} onChange={onRadiusChange} options={options} />
      {isLoading && <Notice tone="muted">주변을 분석하는 중...</Notice>}
      {isError && (
        <Notice tone="error">
          조회 실패: {error.message}{" "}
          <button type="button" onClick={() => refetch()} style={{ marginLeft: 4, cursor: "pointer" }}>다시 시도</button>
        </Notice>
      )}
      {data && (
        <div aria-busy={isPlaceholderData} style={{ opacity: isPlaceholderData ? 0.5 : 1, pointerEvents: isPlaceholderData ? "none" : "auto" }}>
          {isPlaceholderData && <div style={{ fontSize: FS.caption, color: "#6B7280", marginBottom: 4 }}>{radiusLabel(radius)} 기준으로 다시 계산하는 중...</div>}
          <GlanceBlock data={data} />
          {/* 교통 → 집객시설 → 근처 브랜드 순서. 시설·교통의 세부 숫자는 20여 개라 접어 둔다 — 위 한눈에와 요약 칸이 핵심이다(값은 그대로, 지도 표시 체크박스도 이 안에 있다) */}
          <>
            <StoreTransitVisuals bus={data.radius_metrics.bus} rail={data.radius_metrics.rail} />
            <StoreFacilityVisuals facilities={data.radius_metrics.facilities} detail={<FacilityDetail facilities={data.radius_metrics.facilities} radius={data.radius_m} showOnMap={showFacilities} onShowOnMapChange={onShowFacilitiesChange} />} />
            <StoreBrandCards data={data} />
          </>
        </div>
      )}
    </div>
  );
}

/** 분석 반경 고르기 — 주변 환경·경쟁 묶음이 같은 반경 상태(매장 상세 패널)를 함께 쓴다. */
const RADIUS_CHOICES = [250, 500, 1000];
export function RadiusToggle({ radius, onChange, options = RADIUS_CHOICES }: { radius: number; onChange: (m: number) => void; options?: number[] }) {
  return (
    <div className="store-environment-controls">
      <strong>분석 반경</strong>
      <div role="group" aria-label="분석 반경" style={{display:"flex",gap:6}}>
        {options.map(m => <button key={m} type="button" aria-pressed={m === radius} onClick={() => onChange(m)} style={m === radius ? radiusOn : radiusOff}>{radiusLabel(m)}</button>)}
      </div>
    </div>
  );
}

/** 주변 환경 묶음의 공통 안내를 탭 하단의 접힌 유의사항에 모은다(경쟁점 안내는 CompetitionBasisSection). */
export function RadiusBasisSection({ storeId, radius }: { storeId: string; radius: number }) {
  const { data } = useLocationInfluence(storeId, radius);
  if (!data) return null;
  return (
    <Caveat>
      <ul style={{ margin: 0, paddingLeft: 16, lineHeight: 1.6 }}>
        <li>반경 {radiusLabel(data.radius_m)} · 직선거리 기준이며 실제 도보 거리와 다를 수 있습니다.</li>
        <li>교통 이용량은 연결된 자료만 반영하며, 자료별 기준 기간이 다를 수 있습니다.</li>
        <li>집객시설은 공식 자료에서 위치가 확인된 곳만 반영합니다. ‘자료 없음’은 0을 뜻하지 않습니다.</li>
      </ul>
      <SourceNote label="반경 입지 지표 자료" title={data.source.title} reference={data.source.reference} />
    </Caveat>
  );
}

/** 경쟁 묶음의 공통 안내 — 같은 업종 가게 기준과 점포 수 자료 차이. */
export function CompetitionBasisSection({ storeId, radius }: { storeId: string; radius: number }) {
  const { data } = useLocationInfluence(storeId, radius);
  if (!data) return null;
  return (
    <Caveat>
      <ul style={{ margin: 0, paddingLeft: 16, lineHeight: 1.6 }}>
        <li>반경 {radiusLabel(data.radius_m)} · 직선거리 기준이며 실제 도보 거리와 다를 수 있습니다.</li>
        <li>경쟁점은 같은 세부 업종 기준이며 선택 매장은 제외합니다. 상가정보와 인허가 자료의 점포 수는 다를 수 있습니다.</li>
      </ul>
    </Caveat>
  );
}

/** '입지 영향력 — 상권 수요 유형·입지 요인' — ① 소속 상권 수요 유형 ② 입지 요인과 점포당 추정매출의 관계(상관, 인과 아님).
 * 매장 개별 매출 예측이나 점수는 만들지 않는다. 상권 단위 값이라 반경과 무관하다. */
export function LocationAreaSection({ storeId }: { storeId: string }) {
  const { data, isLoading, isError, error, refetch } = useLocationInfluence(storeId, DEFAULT_RADIUS_M);
  return (
    <Section title="상권 수요와 입지 특성" scope={<ScopeTag kind="area" label="소속 상권" />}>
      {isLoading && <Notice tone="muted">상권을 분석하는 중...</Notice>}
      {isError && (
        <Notice tone="error">
          조회 실패: {error.message}{" "}
          <button type="button" onClick={() => refetch()} style={{ marginLeft: 4, cursor: "pointer" }}>다시 시도</button>
        </Notice>
      )}
      {data && (
        <div>
          <AreaBlock data={data} />
          {/* 통계 모델(표준편차·95% 구간 등)은 초보자에게 어려워 접어 둔다 — 위 한 줄이 핵심 경고(예측 아님)를 먼저 말한다 */}
          <Fold title="입지 요인과 점포당 추정매출의 관계 — 통계 분석 보기">
            <ModelBlock data={data} />
          </Fold>
          <Fold title="해석 한계 보기">
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: FS.caption, color: "#6B7280", lineHeight: 1.6 }}>
              {data.caveats.map((c) => <li key={c}>{c}</li>)}
            </ul>
          </Fold>
          <SourceNote label="상권 수요·입지 요인 자료" title={data.source.title} reference={data.source.reference} />
        </div>
      )}
    </Section>
  );
}

/** ① 상업·경쟁 환경 */
/** 반경 주변 한눈에 — 같은 업종 가게 수 · 가장 가까운 지하철역 · 반경 안 전체 업소. 아래 '자세한 숫자'와 같은 값을 끌어 쓴다(새 계산 없음). */
function GlanceBlock({ data }: { data: LocationInfluenceResponse }) {
  const { competitors, rail } = data.radius_metrics;
  const same = competitors.same_category;
  const nearest = rail?.status === "ok" ? rail.nearest_station : null;
  return <Block title={`반경 ${radiusLabel(data.radius_m)} 한눈에`}>
    <div className="store-glance-grid">
      <div className="store-glance-card"><span className="data-heading"><AppIcon name="store"/>같은 업종</span><strong>{same.count.toLocaleString()}곳</strong><small>{same.label} · 선택 매장 제외</small></div>
      <div className="store-glance-card"><span className="data-heading"><AppIcon name="train"/>가까운 역</span><div className="environment-transit-summary store-glance-station">{nearest ? <StationName st={nearest}/> : <strong>자료 없음</strong>}</div><small>{nearest ? `${formatDistance(nearest.distance_m)} · 직선거리${nearest.distance_m > data.radius_m ? " (반경 밖)" : ""}` : "확인된 역 없음"}</small></div>
      <div className="store-glance-card"><span className="data-heading"><AppIcon name="building"/>전체 업소</span><strong>{competitors.all_stores.count.toLocaleString()}곳</strong><small>업종 구분 없이</small></div>
    </div>
  </Block>;
}

export function StoreBrandCards({ data }: { data: LocationInfluenceResponse }) {
  const { anchors } = data.radius_metrics;
  return (
    <Block title={<span className="data-heading"><AppIcon name="store"/>근처 스타벅스·다이소·올리브영</span>}>
      <div className="nearby-brand-grid" style={{marginTop:12}}>
        {anchors.status === "ok" ? (
          anchors.brands.map((b) => (
            <div key={b.brand} className="nearby-brand-card">
              <div className="nearby-brand-logo"><img src={`/brands/${b.brand}.png`} alt={b.label}/></div>
              <strong className="store-detail-value" style={{color:b.brand === "oliveyoung" ? "#456600" : ZONE_COLORS[b.brand]}}>{b.count}곳</strong>
              <div style={fine}>최근접 {b.nearest_m === null ? "자료 없음" : formatDistance(b.nearest_m)}</div>
            </div>
          ))
        ) : (
          <div style={{ gridColumn: "1 / -1" }}><Notice tone="muted">{anchors.message}</Notice></div>
        )}

      </div>
    </Block>
  );
}

/** ② 주요 집객시설 — 의료 / 상업 / 문화·여가 / 교육을 종류별 개수·가장 가까운 시설·직선거리로 보인다. 공식 자료가 없는 종류는 0곳이 아니라 '자료 없음'.
 * 방문객·매출·점수로 바꾸지 않는다. 지도 표시는 기본 꺼짐. 긴 설명은 접어 두고 ⑥ 분석 기준에 모은다. */
/** 집객시설 카드의 펼침 안쪽 — 종류별(의료·상업·문화·여가·교육) 개수와 가장 가까운 시설, 지도 표시. 별도 카드·제목 없이 '집객시설' 카드 안에 들어간다. */
function FacilityDetail({ facilities, radius, showOnMap, onShowOnMapChange }: { facilities?: FacilityAccess; radius: number; showOnMap: boolean; onShowOnMapChange: (v: boolean) => void }) {
  if (!facilities) return null;      // 구버전 응답(집객시설 필드 없음)
  if (facilities.status !== "ok") {
    return <Notice tone="muted">{facilities.message}</Notice>;
  }
  const byType = facilities.selected.by_type;
  return (
    <div>
      {FACILITY_GROUPS.map((g) => (
        <div key={g.id}>
          <div style={{ ...subTitle, color: "#374151" }}>{g.label}</div>
          {g.types.map((t) => {
            const v = byType[t];
            if (!v) return null;
            const sub = SUBTYPE_SHOWN.includes(t) ? facilitySubtypeText(v) : "";
            const statusNote = facilityStatusNote(v);
            const neighborNote = facilityNeighborNote(v);
            const staleNote = facilityStaleNote(v);
            return (
              <div key={t} style={facilityRow}>
                <div style={{ fontWeight: 600, fontSize: FS.body }}>
                  <span aria-hidden style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: FACILITY_MARK[t].color, marginRight: 5 }} />
                  {v.label === "종합병원" ? "대형병원" : v.label}
                </div>
                <div style={{ fontWeight: 700, fontSize: FS.ui, color: v.count_state === "no_official_source" || v.count_state === "incomplete_zero" ? "#6B7280" : "#111827" }}>{facilityCountText(v)}</div>
                <div style={{ gridColumn: "1 / -1", fontSize: FS.caption, color: "#6B7280" }}>
                  가장 가까운 곳: {facilityNearestText(v, radius)}
                  {sub && ` · ${sub}`}
                  {statusNote && ` · ${statusNote}`}
                </div>
                {neighborNote && <div style={{ gridColumn: "1 / -1", fontSize: FS.caption, color: "#92400E" }}>{neighborNote}</div>}
                {staleNote && <div style={{ gridColumn: "1 / -1", fontSize: FS.caption, color: "#6B7280" }}>{staleNote}</div>}
                {(v.count_state === "no_official_source" || v.count_state === "incomplete_zero" || v.count_state === "lower_bound") && (
                  <div style={{ gridColumn: "1 / -1", fontSize: FS.caption, color: "#92400E" }}>{facilityCountNote(v)}</div>
                )}
              </div>
            );
          })}
          {g.id === "commerce" && facilityUnclassifiedNote(facilities.unclassified_retail) && (
            <div style={{ fontSize: FS.caption, color: "#92400E", paddingTop: 4 }}>{facilityUnclassifiedNote(facilities.unclassified_retail)}</div>
          )}
        </div>
      ))}
      <Caveat>개수는 공식 목록 기준이며 이용객 수가 아닙니다. '영업'은 인허가상 상태입니다.</Caveat>
      {facilities.facilities.length > 0 && (
        <>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: FS.caption, color: "#4B5563", marginTop: 6, cursor: "pointer" }}>
            <input type="checkbox" checked={showOnMap} onChange={(e) => onShowOnMapChange(e.target.checked)} />
            지도에 집객시설 위치 표시(기본 꺼짐)
          </label>
        </>
      )}
      <SourceNote label="주요 집객시설 자료" title={facilities.attributions.join(" · ") || "공식 자료"} reference="자료 기준일은 종류별로 다릅니다" />
    </div>
  );
}

const subTitle: React.CSSProperties = { fontSize: FS.ui, fontWeight: 700, color: PK.ink, lineHeight: 1.4, margin: "14px 0 6px" };

function AreaBlock({ data }: { data: LocationInfluenceResponse }) {
  const a = data.area;
  return <div style={card}>
    <div className="data-heading" style={cardTitle}><AppIcon name="users"/>{a.name}의 소비 수요</div>
    {a.fallback_reason && !a.fallback_reason.includes("밖") && <Notice tone="muted">{a.fallback_reason}</Notice>}
    {a.demand_type === null ? <Notice tone="muted">{a.message}</Notice> : <>
      <PopulationMix residents={a.residents} workers={a.workers}/>
      {a.time_pattern && <div className="store-detail-tile" style={{marginTop:16}}>
        <h4 className="data-heading"><AppIcon name="clock"/>시간대·요일별 유동인구 비중</h4>
        <MetricBars items={a.time_pattern.items.map(it => ({label:it.label,value:it.share,color:"#6864E9"}))} format={n => `${n.toFixed(1)}%`} rate/>
        <div style={fine}>{a.time_pattern.quarter} · 이동 인구 추정치</div>
      </div>}
      <Caveat>{a.rule} · 인구 통계는 매장 방문객 수가 아닙니다.</Caveat>
      {a.time_pattern && <Caveat>{a.time_pattern.note}</Caveat>}
    </>}
  </div>;
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
          {m.not_in_sample_reason && <Caveat>{m.not_in_sample_reason}</Caveat>}
          <Caveat>
            서울시 음식 업종 상권×업종 {m.rows}개를 비교했어요. 값이 <Term id="effectPerSd" label="표준편차 1" />만큼 클 때의 차이로 보여줘요.
          </Caveat>
          <ul style={{ listStyle: "none", margin: "6px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            {m.factors.map((f) => <FactorRow key={f.key} f={f} dim={!m.useful} />)}
          </ul>
          <Fold title="모델 기준·검증 보기">
            {m.cv && <div style={{ fontSize: FS.caption, color: "#374151" }}>{m.cv.text}</div>}
            <ul style={{ margin: "6px 0 0", paddingLeft: 16, fontSize: FS.caption, color: "#6B7280", lineHeight: 1.6 }}>
              {m.factors.map((f) => <li key={f.key}>{f.label}: {f.definition.replace(/\s*\(출처.*$/, "")}</li>)}
              <li>비교 대상: 음식 업종 상권×업종 {m.rows}개(상권 {m.clusters}곳), 목표값은 최근 분기 점포당 추정매출입니다.</li>
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
        <strong style={{ fontSize: FS.body }}>{f.label}</strong>
        <span style={{ fontSize: FS.caption, fontWeight: 700, color: f.significant ? (f.direction === "positive" ? "#166534" : "#991B1B") : "#6B7280" }}>
          {f.significant ? `${f.direction === "positive" ? "▲" : "▼"} ${f.tendency}` : f.tendency}
        </span>
      </div>
      <div style={{ fontSize: FS.caption, color: "#374151", marginTop: 2 }}>{effectSentence(f)}</div>
      {mine !== null && (
        <div style={{ fontSize: FS.caption, color: "#6B7280", marginTop: 2 }}>
          이 상권의 값 {mine}{f.binary ? "" : ` · 같은 업종 상권 중 ${percentileText(f.store_percentile)}`}
        </div>
      )}
    </li>
  );
}

const card: React.CSSProperties = { background: PK.soft, borderRadius: 12, padding: "14px 16px", marginBottom: BLOCK_GAP };
const cardTitle: React.CSSProperties = { fontSize: FS.cardTitle, fontWeight: 800, color: PK.ink, lineHeight: 1.4, marginBottom: 6 };
const facilityRow: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr auto", columnGap: 8, rowGap: 1, padding: "4px 0", borderBottom: `1px solid ${PK.line}`, alignItems: "baseline" };
const fine: React.CSSProperties = { fontSize: FS.caption, color: PK.mute, marginTop: 4, lineHeight: 1.5 };
const radiusBase: React.CSSProperties = { padding: "2px 8px", borderRadius: 12, fontSize: FS.ui, minHeight: 38, cursor: "pointer", border: "1px solid #D1D5DB" };
const radiusOn: React.CSSProperties = { ...radiusBase, background: "#1D4ED8", color: "#fff", border: "1px solid #1D4ED8", fontWeight: 700 };
const radiusOff: React.CSSProperties = { ...radiusBase, background: "#fff", color: "#374151" };
