import { Fold, Notice, Section, SourceNote } from "../../components/Notice";
import { Caveat } from "../../components/NoteHost";
import { ScopeTag } from "../../components/ScopeTag";
import { Term } from "../../components/Term";
import type { BusAccess, DemandType, FacilityAccess, RailAccess, LocationFactor, LocationInfluenceResponse } from "../../lib/apiClient";
import { busCountNote, busCountText, busUsageLines } from "../../lib/busText";
import { FACILITY_GROUPS, FACILITY_MARK, facilityCountNote, facilityCountText, facilityNearestText, facilityNeighborNote, facilityReferenceText, facilityStaleNote, facilityStatusNote, facilitySubtypeText, facilityUnclassifiedNote, limitList, SUBTYPE_SHOWN } from "../../lib/facilityText";
import { formatDistance } from "../../lib/format";
import { railCenterOnlyNote, railCompleteText, railCountNote, railCountText, railEntranceText, railExcludedNote, railExitsEnabled, railLinkedText, railNearestExitText, railNearestText, railNoUsageReasonText, railUsageLines } from "../../lib/railText";
import { densityText, effectSentence, factorValueText, percentileText, radiusLabel } from "../../lib/locationText";
import { ZONE_COLORS } from "../../lib/vizConfig";
import { useLocationInfluence, useStoreAnchors } from "./useStores";

export const DEFAULT_RADIUS_M = 500;
const TYPE_STYLE: Record<DemandType, { bg: string; fg: string }> = {
  업무형: { bg: "#DBEAFE", fg: "#1E3A8A" },
  혼합형: { bg: "#F3E8FF", fg: "#6B21A8" },
  주거형: { bg: "#DCFCE7", fg: "#166534" },
};

/** '반경 주변 입지' — ① 상업·경쟁 환경 ② 주요 집객시설 ③ 대중교통 접근성 ④ 교통 이용 수요 (모두 직선거리, 같은 반경). 이어서 ⑤ 인허가 개폐업 ⑥ 분석 기준.
 * 반경은 이 블록의 토글로만 고르고 상태는 매장 상세 패널이 들고 있어 아래 개폐업 블록·⑥ 분석 기준과 같은 값을 쓴다. 요약 칩은 500m 고정이다. */
export function LocationRadiusSection({ storeId, radius, onRadiusChange, showExits, onShowExitsChange, showFacilities, onShowFacilitiesChange }: {
  storeId: string;
  radius: number;
  onRadiusChange: (m: number) => void;
  /** 지하철 출입구를 지도에 표시할지(기본 꺼짐) — 상태는 매장 상세 패널이 들고 있다 */
  showExits: boolean;
  onShowExitsChange: (v: boolean) => void;
  /** 주요 집객시설을 지도에 표시할지(기본 꺼짐) — 상태는 매장 상세 패널이 들고 있다 */
  showFacilities: boolean;
  onShowFacilitiesChange: (v: boolean) => void;
}) {
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
          <GlanceBlock data={data} />
          {/* 상업·집객시설·교통의 세부 숫자는 20여 개라 접어 둔다 — 위 세 칸이 핵심이다(값은 그대로, 지도 표시 체크박스도 이 안에 있다) */}
          <Fold title="자세한 숫자 보기 — 상업·집객시설·교통">
            <CommerceBlock data={data} storeId={storeId} />
            <FacilityBlock facilities={data.radius_metrics.facilities} radius={data.radius_m} showOnMap={showFacilities} onShowOnMapChange={onShowFacilitiesChange} />
            <TransitAccessBlock bus={data.radius_metrics.bus} rail={data.radius_metrics.rail} radiusText={radiusLabel(data.radius_m)} showExits={showExits} onShowExitsChange={onShowExitsChange} />
            <TransitDemandBlock bus={data.radius_metrics.bus} rail={data.radius_metrics.rail} radiusText={radiusLabel(data.radius_m)} />
          </Fold>
        </div>
      )}
    </Section>
  );
}

/** ⑥ 분석 기준 자세히 보기 — ①~④ 와 같은 반경의 응답(같은 쿼리 키라 추가 요청 없음)에서 원천·기준일·한계를 접어 보여준다. */
export function RadiusBasisSection({ storeId, radius }: { storeId: string; radius: number }) {
  const { data } = useLocationInfluence(storeId, radius);
  if (!data) return null;
  const { anchors, competitors, bus, rail, facilities } = data.radius_metrics;
  return (
    <Section title="⑥ 분석 기준 자세히 보기" scope={<ScopeTag kind="radius" label={`반경 ${radiusLabel(data.radius_m)}`} />}>
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
          {rail && rail.status === "ok" && (
            <>
              <li>지하철: {rail.source.title} ({rail.source.reference}). {rail.usage_basis.text}.</li>
              {railExitsEnabled(rail) ? (
                <>
                  <li>포함 기준: {rail.inclusion_rule} 출입구가 있다는 이유로 역 중심점과 출입구를 둘 다 세지 않고, 출입구 수는 반경 안에 좌표가 확인된 출입구만 셉니다.</li>
                  <li>
                    위치 자료 범위: {rail.scope.location_extent}. 출입구 자료 범위: {rail.scope.entrance_extent}
                    {rail.scope.entrance_scope_complete ? " — 이 반경은 그 범위 안입니다." : " — 이 반경의 일부가 그 범위 밖이라 출입구는 일부만 확인된 값이고, 출입구가 없는 역은 중심점 기준입니다."}
                  </li>
                </>
              ) : (
                <>
                  <li>포함 기준: {rail.inclusion_rule}</li>
                  <li>위치 자료 범위: {rail.scope.location_extent}. {railCenterOnlyNote(rail.entrance_data?.reason)}.</li>
                </>
              )}
              <li>이용량이 있는 지역: {rail.scope.usage_regions.join("·")}. 그 밖 지역의 역은 이용량 자료를 아직 받지 않아 '자료 없음'이며 0명이 아닙니다.</li>
              <li>이용량 기간(원천별, 서로 다른 기간을 같은 기간처럼 비교하지 않음): {Object.entries(rail.usage_basis.periods).map(([k, v]) => `${k} ${v[0]}~${v[1]}`).join(" · ")}. 역사 합계는 2025년 달력 연도만 씁니다.</li>
              {rail.caveats.map((c) => <li key={c}>{c}</li>)}
            </>
          )}
          {rail && rail.status !== "ok" && <li>{rail.message}</li>}
          {facilities && facilities.status === "ok" && (
            <>
              <li>주요 집객시설: 공식 자료(건강보험심사평가원 병원정보 · 행정안전부 대규모점포·영화상영관 인허가 · 서울시 LOCALDATA·문화공간 · 소상공인 상가정보)와 이용 권한이 확인된 시설만 셉니다. 권한이 확인되지 않은 지도 업체 검색 결과는 쓰지 않았습니다.</li>
              <li>자료 기준일: {FACILITY_GROUPS.flatMap((g) => g.types).map((t) => facilities.selected.by_type[t]).filter((v) => v && v.reference_date).map((v) => `${v.label} ${facilityReferenceText(v).replace("기준일 ", "")}`).join(" · ")}. 출처: {facilities.attributions.join(" / ") || "해당 반경 시설 없음"}.</li>
              {FACILITY_GROUPS.flatMap((g) => g.types).map((t) => facilities.selected.by_type[t]).filter((v) => v && v.count_state !== "no_official_source" && v.coord_coverage?.pilot_coord_rate != null).map((v) => (
                <li key={v.type}>{v.label}: 양천·영등포 공식 목록의 좌표 보유율 {Math.round((v.coord_coverage?.pilot_coord_rate ?? 0) * 100)}% (좌표 없는 {v.coord_coverage?.pilot_unlocated}곳은 위치를 추정하지 않아 빠져 있음).</li>
              ))}
              {facilities.caveats.map((c) => <li key={c}>{c}</li>)}
            </>
          )}
          {facilities && facilities.status !== "ok" && <li>{facilities.message}</li>}
        </ul>
        <SourceNote label="반경 입지 지표 자료" title={data.source.title} reference={data.source.reference} />
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
          {/* 통계 모델(표준편차·95% 구간 등)은 초보자에게 어려워 접어 둔다 — 위 한 줄이 핵심 경고(예측 아님)를 먼저 말한다 */}
          <Fold title="입지 요인과 점포당 추정매출의 관계 — 통계 분석 보기">
            <ModelBlock data={data} />
          </Fold>
          <Fold title="해석 한계 보기">
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: "#6B7280", lineHeight: 1.6 }}>
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
  const nearest = rail && rail.status === "ok" ? railNearestText(rail.nearest_station) : null;
  return (
    <div style={card}>
      <div style={cardTitle}>반경 {radiusLabel(data.radius_m)} 한눈에</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 6 }}>
        <Stat big label={same.label} value={`${same.count}곳`} sub={`같은 ${same.level} · 선택 매장 제외`} />
        <Stat big label="가장 가까운 지하철역" value={nearest ? nearest.value : "자료 없음"} sub={nearest?.sub} />
        <Stat big label="반경 안 전체 업소" value={`${competitors.all_stores.count.toLocaleString("ko-KR")}곳`} sub="업종 구분 없이" />
      </div>
    </div>
  );
}

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

/** ③ 대중교통 접근성 — 지하철(고유 역사 수·최근접·이용량 연결)과 버스(정류장 수·최근접·이용량 연결). 0곳·확인 불가·일부 범위 밖을 문구로 구분한다. */
function TransitAccessBlock({ bus, rail, radiusText, showExits, onShowExitsChange }: { bus: BusAccess; rail?: RailAccess; radiusText: string; showExits: boolean; onShowExitsChange: (v: boolean) => void }) {
  return (
    <div style={card}>
      <div style={cardTitle}>③ 대중교통 접근성 — 지하철과 버스 (반경 {radiusText})</div>
      <RailAccessPart rail={rail} showExits={showExits} onShowExitsChange={onShowExitsChange} />
      <BusAccessPart bus={bus} />
    </div>
  );
}

/** ② 주요 집객시설 — 의료 / 상업 / 문화·여가 / 교육을 종류별 개수·가장 가까운 시설·직선거리로 보인다. 공식 자료가 없는 종류는 0곳이 아니라 '자료 없음'.
 * 방문객·매출·점수로 바꾸지 않는다. 지도 표시는 기본 꺼짐. 긴 설명은 접어 두고 ⑥ 분석 기준에 모은다. */
function FacilityBlock({ facilities, radius, showOnMap, onShowOnMapChange }: { facilities?: FacilityAccess; radius: number; showOnMap: boolean; onShowOnMapChange: (v: boolean) => void }) {
  if (!facilities) return null;      // 구버전 응답(집객시설 필드 없음)
  if (facilities.status !== "ok") {
    return (<div style={card}><div style={cardTitle}>② 주요 집객시설</div><Notice tone="muted">{facilities.message}</Notice></div>);
  }
  const byType = facilities.selected.by_type;
  const { shown, hidden } = limitList(facilities.facilities, 8);
  return (
    <div style={card}>
      <div style={cardTitle}>② 주요 집객시설 — 공식 자료 기준 (반경 {radiusLabel(radius)}, 직선거리)</div>
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
                <div style={{ fontWeight: 600, fontSize: 12 }}>
                  <span aria-hidden style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: FACILITY_MARK[t].color, marginRight: 5 }} />
                  {v.label}
                </div>
                <div style={{ fontWeight: 700, fontSize: 14, color: v.count_state === "no_official_source" || v.count_state === "incomplete_zero" ? "#6B7280" : "#111827" }}>{facilityCountText(v)}</div>
                <div style={{ gridColumn: "1 / -1", fontSize: 11, color: "#6B7280" }}>
                  가장 가까운 곳: {facilityNearestText(v, radius)}
                  {sub && ` · ${sub}`}
                  {statusNote && ` · ${statusNote}`}
                </div>
                {neighborNote && <div style={{ gridColumn: "1 / -1", fontSize: 11, color: "#92400E" }}>{neighborNote}</div>}
                {staleNote && <div style={{ gridColumn: "1 / -1", fontSize: 11, color: "#6B7280" }}>{staleNote}</div>}
                {(v.count_state === "no_official_source" || v.count_state === "incomplete_zero" || v.count_state === "lower_bound") && (
                  <div style={{ gridColumn: "1 / -1", fontSize: 11, color: "#92400E" }}>{facilityCountNote(v)}</div>
                )}
              </div>
            );
          })}
          {g.id === "commerce" && facilityUnclassifiedNote(facilities.unclassified_retail) && (
            <div style={{ fontSize: 11, color: "#92400E", paddingTop: 4 }}>{facilityUnclassifiedNote(facilities.unclassified_retail)}</div>
          )}
        </div>
      ))}
      <Caveat>개수는 공식 목록에 있는 시설 기준이며 이용객·방문객 수가 아닙니다. 점포 유형은 인허가 등록 구분, '영업'은 인허가상 상태입니다. 자세한 기준·출처는 ⑥에서 봅니다.</Caveat>
      {facilities.facilities.length > 0 && (
        <>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#4B5563", marginTop: 6, cursor: "pointer" }}>
            <input type="checkbox" checked={showOnMap} onChange={(e) => onShowOnMapChange(e.target.checked)} />
            지도에 집객시설 위치 표시(기본 꺼짐)
          </label>
          <Fold title={`반경 안 시설 ${facilities.facilities.length}곳 보기`}>
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: "#374151", lineHeight: 1.6 }}>
              {shown.map((f) => (
                <li key={f.facility_id}>
                  <strong title={f.display_name && f.display_name !== f.name ? `공식 명칭: ${f.name}` : undefined}>{f.display_name ?? f.name}</strong>({FACILITY_GROUPS.flatMap((g) => g.types).includes(f.type) ? byType[f.type]?.label : f.type}{f.subtype && f.subtype !== byType[f.type]?.label ? ` · ${f.subtype}` : ""}) {f.distance_m.toLocaleString("ko-KR")}m · {f.status_label}{f.reference_stale ? " · 기록 5년 넘게 갱신 안 됨" : ""}
                </li>
              ))}
            </ul>
            {hidden > 0 && <div style={fine}>가까운 {shown.length}곳만 보여 줍니다(나머지 {hidden}곳은 지도 표시를 켜서 확인).</div>}
          </Fold>
        </>
      )}
      <SourceNote label="주요 집객시설 자료" title={facilities.attributions.join(" · ") || "공식 자료"} reference="자료 기준일은 종류별로 ⑥ 분석 기준에서 확인" />
    </div>
  );
}

const subTitle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "#6D28D9", margin: "8px 0 2px" };

function RailAccessPart({ rail, showExits, onShowExitsChange }: { rail?: RailAccess; showExits: boolean; onShowExitsChange: (v: boolean) => void }) {
  if (!rail) return null;      // 구버전 응답(철도 필드 없음)
  if (rail.status !== "ok") {
    return (<><div style={subTitle}>지하철</div><Notice tone="muted">{rail.message}</Notice></>);
  }
  const s = rail.selected;
  const nearest = railNearestText(rail.nearest_station);
  const mixed = s.mixed_basis;
  const exitsOn = railExitsEnabled(rail);
  return (
    <>
      <div style={subTitle}>지하철 — 환승 노선은 한 역사로 한 번만 셉니다</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 4 }}>
        <Stat big label="지하철 역" value={railCountText(s)} sub={railCountNote(s)} accent="#6D28D9" />
        <Stat big label="가장 가까운 역" value={nearest.value} sub={nearest.sub} />
        <Stat big label="이용량 연결" value={s.count === 0 || s.linked_ratio === null ? "해당 없음" : `${s.linked}/${s.count}역`} sub={s.linked_ratio === null ? undefined : `연결률 ${Math.round(s.linked_ratio * 100)}%`} />
      </div>
      {!exitsOn && <div style={fine}>{railCenterOnlyNote(rail.entrance_data?.reason)}</div>}
      {exitsOn && (
        <div style={fine}>
          {railEntranceText(s)} · 가장 가까운 출입구: {railNearestExitText(rail.nearest_entrance)}
        </div>
      )}
      {exitsOn && railExcludedNote(s) && <div style={{ marginTop: 4 }}><Notice tone="warn">{railExcludedNote(s)}</Notice></div>}
      {exitsOn && mixed && <div style={{ marginTop: 4 }}><Notice tone="warn">출입구가 확인된 역은 출입구 기준, 없는 역은 공식 역 중심점 기준으로 거리를 쟀습니다(두 기준이 섞인 결과). 출입구는 공식 좌표가 아니라 카카오 보조 자료입니다.</Notice></div>}
      {exitsOn && !mixed && s.count > 0 && s.stations_by_basis.center === s.count && <div style={fine}>출입구 자료가 없어 모두 공식 역 중심점 기준입니다.</div>}
      {exitsOn && s.count > 0 && (
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#4B5563", marginTop: 6, cursor: "pointer" }}>
          <input type="checkbox" checked={showExits} onChange={(e) => onShowExitsChange(e.target.checked)} />
          지도에 출입구 위치 표시(기본 꺼짐)
        </label>
      )}
      {s.count > 0 && exitsOn && <div style={fine}>지도의 보라색 '역' 표시는 공식 역 중심점입니다(점선 테두리 = 중심점 기준 역). 출입구 기준으로 포함된 역은 중심점이 반경 원 바로 바깥에 있을 수 있습니다.</div>}
      {s.count > 0 && !exitsOn && <div style={fine}>지도의 보라색 '역' 표시는 공식 역 중심점입니다.</div>}
      {rail.stations.length > 0 && (
        <Fold title={`반경 안 지하철 역 ${rail.stations.length}곳 보기`}>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: "#374151", lineHeight: 1.6 }}>
            {rail.stations.map((st) => (
              <li key={st.complex_id}>
                <strong>{st.name}</strong>({st.lines}) {st.distance_m.toLocaleString("ko-KR")}m · {st.basis === "entrance" ? `출입구 ${st.entrances.length}곳 확인(최근접 출구 기준)` : "공식 중심점 기준"}
                {st.usage.boardings === null
                  ? ` · 이용량 자료 없음(${railNoUsageReasonText(st.usage.reason)})`
                  : ` · 일평균 승차 ${Math.round(st.usage.boardings).toLocaleString("ko-KR")}명 · 하차 ${Math.round(st.usage.alightings ?? 0).toLocaleString("ko-KR")}명${st.usage.lines_total !== null && st.usage.lines_with_usage < st.usage.lines_total ? ` (노선 ${st.usage.lines_with_usage}/${st.usage.lines_total}만 연결)` : ""}`}
              </li>
            ))}
          </ul>
        </Fold>
      )}
    </>
  );
}

function BusAccessPart({ bus }: { bus: BusAccess }) {
  if (bus.status !== "ok") {
    return (<><div style={{ ...subTitle, color: "#0E7490" }}>버스</div><Notice tone="muted">{bus.message}</Notice></>);
  }
  const s = bus.selected;
  const nearest = bus.nearest;
  return (
    <>
      <div style={{ ...subTitle, color: "#0E7490" }}>버스 정류장</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 4 }}>
        <Stat big label="버스정류장" value={busCountText(s)} sub={busCountNote(s, null)} accent="#0891B2" />
        <Stat big label="가장 가까운 정류장" value={nearest ? formatDistance(nearest.distance_m) : "자료 없음"} sub={nearest ? (nearest.reliable ? "직선거리" : "직선거리 · 수집 범위 밖일 수 있음") : undefined} />
        <Stat big label="이용량 연결" value={s.count === 0 || s.linked_ratio === null ? "해당 없음" : `${s.linked}/${s.count}곳`} sub={s.linked_ratio === null ? undefined : `연결률 ${Math.round(s.linked_ratio * 100)}%`} />
      </div>
      {bus.scope.reason && <div style={{ marginTop: 6 }}><Notice tone="warn">{bus.scope.reason}</Notice></div>}
    </>
  );
}

/** ④ 교통 이용 수요 — 지하철·버스 모두 승차·하차를 따로, 연결된 곳만의 관측된 부분 합계. 승차+하차(+환승) 합계는 만들지 않는다. 지하철과 버스는 서로 더하지 않는다. */
function TransitDemandBlock({ bus, rail, radiusText }: { bus: BusAccess; rail?: RailAccess; radiusText: string }) {
  const railOk = rail && rail.status === "ok" ? rail : null;
  if (!railOk && bus.status !== "ok") return null;
  return (
    <div style={card}>
      <div style={cardTitle}>④ 교통 이용 수요 — 지하철과 버스 (반경 {radiusText}, 2025년 일 평균)</div>
      {railOk && <RailDemandPart rail={railOk} />}
      {bus.status === "ok" && <BusDemandPart bus={bus} />}
      <Caveat>지하철 역과 버스 정류장의 수치는 서로 다른 교통수단의 측정치라 합치지 않았습니다. 실시간 유동인구나 매장 방문객 수가 아닙니다.</Caveat>
    </div>
  );
}

function RailDemandPart({ rail }: { rail: Extract<RailAccess, { status: "ok" }> }) {
  const s = rail.selected;
  const usage = railUsageLines(s);
  const linkedText = railLinkedText(s);
  return (
    <>
      <div style={subTitle}>지하철 역 승·하차 (연결된 역만)</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 4 }}>
        <Stat big label="승차 인원" value={usage.boardings} sub={usage.partial ? "연결된 역·노선만 더한 값" : undefined} accent="#6D28D9" />
        <Stat big label="하차 인원" value={usage.alightings} sub={usage.partial ? "연결된 역·노선만 더한 값" : undefined} accent="#6D28D9" />
      </div>
      <div style={fine}>
        {[linkedText, railCompleteText(s)].filter(Boolean).join(" · ")}
        {s.usage_state === "none_linked" && s.count > 0 && `${linkedText ? " · " : ""}이 반경 역의 이용량 자료가 없습니다(0명이 아니라 자료 없음${s.no_source_region_stations > 0 ? " — 이용량 자료를 아직 받지 않은 지역 포함" : ""}).`}
        {usage.partial && ` 이용량이 없거나 일부 노선만 연결된 역은 빠져 있어 이 반경 전체의 값이 아닙니다. 반경 밖 역의 이용량은 더하지 않았습니다.`}
      </div>
    </>
  );
}

function BusDemandPart({ bus }: { bus: Extract<BusAccess, { status: "ok" }> }) {
  const s = bus.selected;
  const usage = busUsageLines(s);
  return (
    <>
      <div style={{ ...subTitle, color: "#0E7490" }}>버스 정류장 승·하차 (연결된 정류장만)</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 4 }}>
        <Stat big label="승차 인원" value={usage.boardings} sub={usage.partial ? "연결된 정류장만 더한 값" : undefined} />
        <Stat big label="하차 인원" value={usage.alightings} sub={usage.partial ? "연결된 정류장만 더한 값" : undefined} />
      </div>
      <Caveat>
        {usage.partial ? `이용량이 연결되지 않은 ${s.unlinked}곳은 빠져 있어 이 반경 전체의 값이 아닙니다. ` : ""}
        정류장 승·하차 기록이며 승차와 하차는 합치지 않았습니다.
      </Caveat>
    </>
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
          <Fold title="유형 판정 기준 보기">
            <div style={fine}>
              {a.rule} · 지하철역 {a.has_subway === null || a.has_subway === undefined ? "자료 없음" : a.has_subway ? "영역 안에 있음" : "영역 안에 없음"} ·
              같은 단위 분포 {Object.entries(a.type_counts).map(([t, n]) => `${t} ${n}곳`).join(" · ")}
            </div>
          </Fold>
          {a.time_pattern && (
            <Fold title="유동인구 시간대 패턴 보기(유형이 맞는지 확인용)">
              <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ color: "#6B7280", textAlign: "left" }}><th scope="col">시간대</th><th scope="col">이 {a.level_label}</th><th scope="col">양천·영등포 중앙값</th></tr>
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
          {m.not_in_sample_reason && <Caveat>{m.not_in_sample_reason}</Caveat>}
          <Caveat>
            서울시 음식 업종 상권×업종 {m.rows}개를 비교했어요. 값이 <Term id="effectPerSd" label="표준편차 1" />만큼 클 때의 차이로 보여줘요.
          </Caveat>
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
const facilityRow: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr auto", columnGap: 8, rowGap: 1, padding: "4px 0", borderBottom: "1px solid #F3F4F6", alignItems: "baseline" };
const fine: React.CSSProperties = { fontSize: 11, color: "#6B7280", marginTop: 6, lineHeight: 1.5 };
const radiusBase: React.CSSProperties = { padding: "2px 8px", borderRadius: 12, fontSize: 11, cursor: "pointer", border: "1px solid #D1D5DB" };
const radiusOn: React.CSSProperties = { ...radiusBase, background: "#1D4ED8", color: "#fff", border: "1px solid #1D4ED8", fontWeight: 700 };
const radiusOff: React.CSSProperties = { ...radiusBase, background: "#fff", color: "#374151" };
