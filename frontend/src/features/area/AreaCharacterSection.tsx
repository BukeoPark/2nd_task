import type { CSSProperties, ReactNode } from "react";
import { Caveat } from "../../components/NoteHost";
import { Fold, Notice, SourceNote } from "../../components/Notice";
import type { AreaCharacter, CharacterStation } from "../../lib/apiClient";
import { anchorText, cellSub, cellText, countText, demandStructureNote, densityReferenceText, densityText, NEUTRAL_STYLE, peopleText, pctText, rankText, TRAIT_STYLE, typeNotice } from "../../lib/areaCharacter";
import { busUsageLines } from "../../lib/busText";
import { railUsageLines } from "../../lib/railText";
import { useAreaCharacter } from "../food/useFood";

interface Props {
  level: "dong" | "trdar";
  code: string;
  svc: string | null;
  scls: string | null;
  unitKind: string;
}

/** 조회 상태(불러오는 중·실패)를 한 곳에서 처리하고, 값이 오면 그리는 함수에 넘긴다 — '유형'과 '특성' 두 항목이 같은 조회를 나눠 쓴다. */
function WithCharacter({ level, code, svc, scls, children }: Omit<Props, "unitKind"> & { children: (d: AreaCharacter) => ReactNode }) {
  const q = useAreaCharacter(level, code, svc, scls);
  if (q.isPending) return <Notice tone="muted">상권 유형·입지 특성을 계산하는 중...</Notice>;
  if (q.isError) {
    return (
      <Notice tone="error">
        조회 실패: {q.error.message}{" "}
        <button type="button" onClick={() => void q.refetch()} style={{ marginLeft: 4, border: "1px solid #DC2626", background: "white", color: "#DC2626", borderRadius: 4, cursor: "pointer" }}>
          다시 시도
        </button>
      </Notice>
    );
  }
  return <>{children(q.data)}</>;
}

/** '유형' — 이 행정동·상권의 참고용 규칙 분류(업무·주거·교통 거점·상업 집중)와 판정 근거, 강점·주의사항, 계산 기준.
 * 종합점수·창업 성공 확률은 없다. 매장 반경 값(매장 상세 '주변')과 다른 값이다. */
export function AreaTypeSection({ level, code, svc, scls, unitKind }: Props) {
  return (
    <WithCharacter level={level} code={code} svc={svc} scls={scls}>
      {(d) => (
        <div>
          <Notice tone="info">{d.basis.label}</Notice>
          <div style={{ ...card, marginTop: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, color: "#6B7280" }}>이 {unitKind}의 유형(복수 특성 가능)</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: "#92400E", background: "#FEF3C7", borderRadius: 4, padding: "1px 6px" }}>참고용 분류</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
              {d.type.traits.length > 0 ? (
                d.type.traits.map((t) => <Chip key={t.key} text={t.label} style={TRAIT_STYLE[t.key]} />)
              ) : (
                <Chip text={d.type.headline} style={NEUTRAL_STYLE} />
              )}
            </div>
            {typeNotice(d.type) && <div style={{ ...fine, marginTop: 6 }}>{typeNotice(d.type)}</div>}
            {demandStructureNote(d.type) && <div style={{ ...fine, marginTop: 6 }}>{demandStructureNote(d.type)}</div>}
            {d.basis.relative_note && <div style={fine}>기준은 양천·영등포 188개 단위(행정동 36·상권 152) 안의 상대 위치입니다.</div>}
            {d.type.traits.some((t) => t.key === "transit" || t.key === "commercial") && d.basis.success_note && (
              <div style={{ marginTop: 6 }}><Notice tone="warn">{d.basis.success_note}</Notice></div>
            )}
            {d.type.traits.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#374151" }}>판정 근거</div>
                {d.type.traits.map((t) => (
                  <div key={t.key} style={{ marginTop: 3 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: TRAIT_STYLE[t.key].fg }}>{t.label}</span>
                    {t.evidence.map((e) => <div key={e} style={{ fontSize: 11, color: "#4B5563" }}>· {e}</div>)}
                  </div>
                ))}
              </div>
            )}
            {d.type.held.length > 0 && d.type.kind !== "hold" && d.type.held.map((h) => <div key={h.key} style={{ ...fine, marginTop: 4 }}>· {h.reason}</div>)}
          </div>

          {(d.strengths.length > 0 || d.cautions.length > 0) && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
              <Points title="강점" tone="#166534" items={d.strengths} empty="뚜렷한 강점 문장을 만들 근거가 부족합니다." />
              <Points title="주의사항" tone="#92400E" items={d.cautions} empty="특별히 짚을 주의사항이 없습니다(자료가 있는 범위)." />
            </div>
          )}

          <Fold title="계산 기준·출처 자세히 보기">
            <div style={{ fontSize: 11, color: "#4B5563", lineHeight: 1.6 }}>
              <div>{d.basis.unit}</div>
              <ul style={{ margin: "6px 0", paddingLeft: 16 }}>{d.basis.rules.map((r) => <li key={r}>{r}</li>)}</ul>
              <div>
                기준 분포: 같은 단위 {d.basis.reference.units}곳 — 외식 점포 밀도 상위 25% {d.basis.reference.store_density_p75?.toLocaleString("ko-KR")}곳/㎢ · 집객시설 밀도 중앙값 {d.basis.reference.fac_density_median?.toLocaleString("ko-KR")}곳/㎢ · 역 이용량(연결된 역 승차 합) 상위 25% {d.basis.reference.transit_boardings_p75?.toLocaleString("ko-KR")}명. {d.basis.reference.note}
              </div>
              <div style={{ marginTop: 4 }}>유형 판정은 선택 업종과 무관하게 외식 전체 기준이고, 특성의 '경쟁 환경'만 선택 업종을 따릅니다.</div>
              {d.basis.relative_note && <div style={{ marginTop: 4 }}>{d.basis.relative_note}</div>}
              {d.basis.success_note && <div style={{ marginTop: 4 }}>{d.basis.success_note}</div>}
              {d.basis.data_notes && (
                <>
                  <div style={{ marginTop: 6, fontWeight: 700 }}>값의 집계 기준</div>
                  <ul style={{ margin: "2px 0", paddingLeft: 16 }}>{d.basis.data_notes.map((n) => <li key={n}>{n}</li>)}</ul>
                </>
              )}
            </div>
            {d.basis.sources.map((src) => <SourceNote key={src.title} label="유형·특성 자료" title={src.title} reference={src.reference} />)}
          </Fold>
        </div>
      )}
    </WithCharacter>
  );
}

/** '특성' — 교통 접근성·배후 소비 수요·상업·앵커 환경·경쟁 환경. 영역마다 값과 근거를 보인다. */
export function AreaTraitsSection({ level, code, svc, scls, unitKind }: Props) {
  return (
    <WithCharacter level={level} code={code} svc={svc} scls={scls}>
      {(d) => {
        const s = d.sections;
        return (
          <div>
            <Area title="① 교통 접근성" hint="경계 안 + 경계 밖 250m 이내 역 · 경계 안 버스정류장">
              <RailPart rail={s.transit.rail} />
              <BusPart bus={s.transit.bus} />
              <Caveat>{s.transit.note}</Caveat>
            </Area>

            <Area title="② 배후 소비 수요" hint={`이 ${unitKind} 경계 기준 · 값마다 기준 분기가 다릅니다`}>
              <DemandPart demand={s.demand} />
            </Area>

            <Area title="③ 상업·앵커 환경" hint="스타벅스·다이소 · 집객시설">
              <AnchorPart anchor={s.anchor} />
            </Area>

            <Area title="④ 경쟁 환경" hint={`선택 업종: ${s.competition.scope.stores_label}`}>
              <CompetitionPart c={s.competition} />
            </Area>
          </div>
        );
      }}
    </WithCharacter>
  );
}

/** 매장 상세용 한 줄 요약 — 유형 헤드라인과 이동 링크만(상세는 상권 분석에서). 보류·혼합도 그대로 말한다. */
export function AreaCharacterLine({ level, code, label }: { level: "dong" | "trdar"; code: string; label: string }) {
  const q = useAreaCharacter(level, code, null, null);
  if (q.isPending) return <div style={fine}>{label}: 유형을 계산하는 중...</div>;
  if (q.isError) return <div style={fine}>{label}: 유형을 불러오지 못했습니다.</div>;
  const t = q.data.type;
  return (
    <div style={{ fontSize: 11, color: "#4B5563", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4 }}>
      <span>{label}:</span>
      {t.traits.length > 0 ? t.traits.map((x) => <Chip key={x.key} text={x.label} style={TRAIT_STYLE[x.key]} small />) : <Chip text={t.headline} style={NEUTRAL_STYLE} small />}
      <span style={{ color: "#6B7280" }}>(참고용 규칙 분류)</span>
    </div>
  );
}

function RailPart({ rail }: { rail: AreaCharacter["sections"]["transit"]["rail"] }) {
  const usage = railUsageLines({ usage_state: rail.usage_state, boardings_observed: rail.boardings_observed, alightings_observed: rail.alightings_observed, partial_line_stations: 0 });
  const list = [...rail.inside, ...rail.within_250m];
  return (
    <div style={{ marginTop: 6 }}>
      <div style={sub}>지하철 — {rail.count === 0 ? `경계 안·250m 이내 역 없음(가장 가까운 역 경계에서 ${rail.nearest_m?.toLocaleString("ko-KR") ?? "-"}m)` : `경계 안 ${rail.inside.length}곳 · 경계 밖 250m 이내 ${rail.within_250m.length}곳`}</div>
      {rail.count > 0 && (
        <>
          <div style={grid2}>
            <Mini label="연결된 역 하루 평균 승차" value={usage.boardings} sub={usage.partial ? `연결 ${rail.linked}/${rail.count}역 · ${rail.year}년` : `${rail.year}년`} />
            <Mini label="연결된 역 하루 평균 하차" value={usage.alightings} sub={usage.partial ? "이용량이 확인된 역만 더한 값" : `${rail.year}년`} />
          </div>
          <Fold title={`역 ${rail.count}곳 보기`}>
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, lineHeight: 1.6, color: "#374151" }}>{list.map((st) => <StationItem key={st.name + st.lines} st={st} />)}</ul>
          </Fold>
        </>
      )}
      <Caveat>{rail.basis}</Caveat>
    </div>
  );
}

function StationItem({ st }: { st: CharacterStation }) {
  return (
    <li>
      <strong>{st.name}</strong>({st.lines}) · {st.where === "inside" ? "경계 안" : `경계 밖 ${st.distance_m}m`}{(st.shared_units ?? 1) >= 2 ? ` · 인접 단위 ${st.shared_units}곳 공유` : ""} ·{" "}
      {st.boardings === null ? "이용량 자료 없음" : `승차 ${Math.round(st.boardings).toLocaleString("ko-KR")}명 · 하차 ${Math.round(st.alightings ?? 0).toLocaleString("ko-KR")}명${st.lines_with_usage < st.lines_total ? ` (노선 ${st.lines_with_usage}/${st.lines_total}만 연결)` : ""}`}
    </li>
  );
}

function BusPart({ bus }: { bus: AreaCharacter["sections"]["transit"]["bus"] }) {
  const usage = busUsageLines({ usage_state: bus.usage_state, boardings_observed: bus.boardings_observed, alightings_observed: bus.alightings_observed });
  return (
    <div style={{ marginTop: 8 }}>
      <div style={sub}>버스 — 경계 안 정류장 {bus.count === 0 ? "0곳" : `${bus.count}곳(㎢당 ${bus.per_km2 ?? "-"}곳)`}</div>
      {bus.count > 0 && (
        <div style={grid2}>
          <Mini label="연결된 정류장 하루 평균 승차" value={usage.boardings} sub={bus.linked_ratio === null ? undefined : `이용량 연결 ${bus.linked}/${bus.count}곳(${Math.round(bus.linked_ratio * 100)}%)`} />
          <Mini label="연결된 정류장 하루 평균 하차" value={usage.alightings} sub={usage.partial ? "이용량이 확인된 정류장만 더한 값" : `${bus.year}년`} />
        </div>
      )}
      {bus.caution && <div style={{ marginTop: 6 }}><Notice tone="warn">{bus.caution}</Notice></div>}
      <Caveat>{bus.basis}</Caveat>
    </div>
  );
}

function DemandPart({ demand }: { demand: AreaCharacter["sections"]["demand"] }) {
  const f = demand.floating;
  return (
    <>
      <div style={grid3}>
        <Mini label="직장인구" value={cellText(demand.workers, peopleText)} sub={cellSub(demand.workers)} />
        <Mini label="상주인구" value={cellText(demand.residents, peopleText)} sub={cellSub(demand.residents)} />
        <Mini label="직장인구 비율" value={demand.worker_share_pct === null ? "자료 없음" : pctText(demand.worker_share_pct)} sub={demand.demand_type ?? undefined} />
      </div>
      {!demand.base_ok && <div style={{ marginTop: 6 }}><Notice tone="warn">직장·상주 인구 합이 1,000명 미만이거나 자료가 없어 업무·주거 판정은 보류했습니다.</Notice></div>}
      {f ? (
        <div style={{ marginTop: 8 }}>
          <div style={sub}>유동인구({f.label}) {f.flpop === null ? "자료 없음" : `${Math.round(f.flpop).toLocaleString("ko-KR")}명(분기 합)`}</div>
          <div style={grid3}>
            <Mini label="점심(11~14시) 비중" value={f.lunch_pct === null ? "자료 없음" : pctText(f.lunch_pct)} sub={rankText(f.lunch_rank)} />
            <Mini label="야간(21~24시) 비중" value={f.late_pct === null ? "자료 없음" : pctText(f.late_pct)} sub={rankText(f.late_rank)} />
            <Mini label="주말 비중" value={f.weekend_pct === null ? "자료 없음" : pctText(f.weekend_pct)} />
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 6 }}><Notice tone="muted">유동인구 자료 없음</Notice></div>
      )}
      <Caveat>{demand.note}</Caveat>
    </>
  );
}

function AnchorPart({ anchor }: { anchor: AreaCharacter["sections"]["anchor"] }) {
  return (
    <>
      <div style={grid2}>
        <Mini label="스타벅스" value={anchorText(anchor.starbucks)} sub={`매장 250m 안 비율 ${cellText(anchor.starbucks.zone_share, pctText)}`} />
        <Mini label="다이소" value={anchorText(anchor.daiso)} sub={`매장 250m 안 비율 ${cellText(anchor.daiso.zone_share, pctText)}`} />
      </div>
      <div style={{ ...grid2, marginTop: 8 }}>
        <Mini label="집객시설" value={cellText(anchor.facilities.total, countText)} sub={cellSub(anchor.facilities.total)} />
        <Mini label="집객시설 밀도" value={densityText(anchor.facilities.per_km2, false)} sub={anchor.facilities.reference_median === null ? undefined : `같은 단위 중앙값 ${anchor.facilities.reference_median.toLocaleString("ko-KR")}곳/㎢`} />
      </div>
      <Caveat>{anchor.note}</Caveat>
    </>
  );
}

function CompetitionPart({ c }: { c: AreaCharacter["sections"]["competition"] }) {
  return (
    <>
      <div style={grid3}>
        <Mini label="점포 수(현재)" value={cellText(c.stores, countText)} sub={cellSub(c.stores)} />
        <Mini label="점포 밀도" value={densityText(c.density_per_km2, c.small_area)} sub={densityReferenceText(c.reference_applies, c.reference_density_p75)} />
        <Mini label="점포 수 증감(약 2년)" value={cellText(c.change_2y, (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`)} sub={cellSub(c.change_2y)} />
      </div>
      <div style={{ ...grid2, marginTop: 8 }}>
        <Mini label="연 개업률(최근 1년)" value={cellText(c.open_rate_y, pctText)} sub={cellSub(c.open_rate_y)} />
        <Mini label="연 폐업률(최근 1년)" value={cellText(c.close_rate_y, pctText)} sub={cellSub(c.close_rate_y)} />
      </div>
      {c.scope.notice && <div style={{ marginTop: 6 }}><Notice tone="warn">{c.scope.notice}</Notice></div>}
      <Caveat>{c.note}</Caveat>
    </>
  );
}

function Area({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <div style={{ ...card, marginTop: 10 }}>
      <div style={{ fontSize: 14, fontWeight: 800 }}>{title}</div>
      <div style={fine}>{hint}</div>
      <div style={{ marginTop: 8 }}>{children}</div>
    </div>
  );
}

function Points({ title, tone, items, empty }: { title: string; tone: string; items: string[]; empty: string }) {
  return (
    <div style={{ ...card, borderLeft: `3px solid ${tone}` }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: tone }}>{title}</div>
      {items.length === 0 ? <div style={fine}>{empty}</div> : items.map((t) => <div key={t} style={{ fontSize: 11, color: "#374151", marginTop: 3 }}>· {t}</div>)}
    </div>
  );
}

function Mini({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: "#fff", borderRadius: 8, padding: "6px 8px", border: "1px solid #E5E7EB" }}>
      <div style={{ fontSize: 10, color: "#6B7280" }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "#6B7280" }}>{sub}</div>}
    </div>
  );
}

function Chip({ text, style, small }: { text: string; style: { bg: string; fg: string }; small?: boolean }) {
  return (
    <span style={{ background: style.bg, color: style.fg, borderRadius: 999, padding: small ? "1px 7px" : "3px 10px", fontSize: small ? 11 : 13, fontWeight: 700 }}>{text}</span>
  );
}

const card: CSSProperties = { background: "#F9FAFB", borderRadius: 8, padding: "8px 10px" };
const fine: CSSProperties = { fontSize: 11, color: "#6B7280", marginTop: 6, lineHeight: 1.5 };
const sub: CSSProperties = { fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 4 };
const grid2: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 };
const grid3: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 };
