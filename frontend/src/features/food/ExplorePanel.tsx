import { Drawer } from "../../components/Drawer";
import { Notice } from "../../components/Notice";
import type { FoodBubble, FoodBubblesResponse } from "../../lib/apiClient";
import { candidatesFor, PRESETS, presetById, type PresetId } from "../../lib/explorePresets";
import { formatMetric } from "../../lib/format";
import { SAMPLE_MIN } from "../../lib/insightReport";
import { useFoodBubbles } from "./useFood";

interface Props {
  presetId: PresetId;
  level: "dong" | "trdar";
  svc: string | null;
  scls: string | null;
  filterName: string;
  /** 후보를 눌렀을 때 — 기존 상권·행정동 종합분석으로 연결(MapPage 가 선택 상태를 만든다) */
  onPick: (b: FoodBubble, data: FoodBubblesResponse) => void;
  /** 그 지역의 상권분석 보고서 */
  onReport: (b: FoodBubble) => void;
  onFavorite: (b: FoodBubble, data: FoodBubblesResponse) => void;
  isFavorite: (code: string) => boolean;
  onPreset: (id: PresetId) => void;
  onLevel: (l: "dong" | "trdar") => void;
  onClose: () => void;
}

/** 조건으로 후보 찾기 — 기존 지도 지표(버블)·업종 필터를 그대로 써서 조건에 맞는 지역을 모은다. 지도도 같은 지표로 칠해진다(MapPage 가 지표·확대 단계를 맞춘다).
 * 후보는 조건에 맞는 곳을 값 순으로 나열한 것이지 창업 추천 순위가 아니다. */
export function ExplorePanel(p: Props) {
  const preset = presetById(p.presetId) ?? PRESETS[0];
  const q = useFoodBubbles(p.level, preset.metric, p.svc, p.scls);
  const data = q.data;
  // 새 조건의 결과가 오기 전의 이전 결과는 후보로 쓰지 않는다(값이 섞이지 않도록)
  const fresh = data && data.level === p.level && data.metric === preset.metric && data.svc === p.svc && data.scls === p.scls ? data : null;
  const res = fresh ? candidatesFor(preset, fresh.bubbles) : null;
  const unitWord = p.level === "dong" ? "행정동" : "상권";
  return (
    <Drawer title="조건으로 후보 찾기" subtitle="어떤 곳을 먼저 보고 싶으세요?" onClose={p.onClose}>
      <div role="radiogroup" aria-label="찾는 조건" style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
        {PRESETS.map((x) => {
          const on = x.id === preset.id;
          return (
            <button key={x.id} type="button" role="radio" aria-checked={on} onClick={() => p.onPreset(x.id)}
              style={{ textAlign: "left", padding: "9px 12px", borderRadius: 10, border: on ? "2px solid #1D4ED8" : "1px solid #D1D5DB", background: on ? "#EFF6FF" : "white", color: on ? "#1E3A8A" : "#111827", fontWeight: on ? 800 : 600, fontSize: 15, cursor: "pointer" }}>
              {x.question}
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 6, alignItems: "center", margin: "12px 0 4px", fontSize: 13 }}>
        <span style={{ color: "#4B5563" }}>보는 단위</span>
        {(["dong", "trdar"] as const).map((l) => (
          <button key={l} type="button" aria-pressed={p.level === l} onClick={() => p.onLevel(l)}
            style={{ padding: "3px 10px", borderRadius: 999, border: p.level === l ? "1px solid #1D4ED8" : "1px solid #D1D5DB", background: p.level === l ? "#1D4ED8" : "white", color: p.level === l ? "white" : "#374151", cursor: "pointer", fontSize: 13 }}>
            {l === "dong" ? "행정동" : "상권"}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.6 }}>{preset.what}</div>
      <div style={{ fontSize: 13, color: "#92400E", lineHeight: 1.6, marginTop: 4 }}>※ {preset.caveat}</div>

      <div style={{ marginTop: 12 }}>
        {q.isError && <Notice tone="error">후보를 불러오지 못했어요: {q.error.message} <button type="button" onClick={() => void q.refetch()}>다시 시도</button></Notice>}
        {!q.isError && !fresh && <Notice tone="muted">조건에 맞는 {unitWord}를 찾는 중...</Notice>}
        {fresh && res && (
          <>
            <div style={{ fontSize: 13, fontWeight: 700 }}>조건에 맞는 {unitWord} {res.candidates.length + res.more}곳{res.more > 0 ? ` 중 ${res.candidates.length}곳` : ""}</div>
            <div style={{ fontSize: 12.5, color: "#6B7280", margin: "2px 0 6px" }}>
              {p.filterName} · {fresh.scope.metric_scope} · {fresh.as_of} · 영등포구·양천구 안에서만 찾아요. 조건 값 순으로 나열한 것이며 창업 추천 순위가 아닙니다.
            </div>
            {res.candidates.length === 0 && <Notice tone="muted">이 조건에 맞는 {unitWord}가 없어요(자료가 없는 것이 아니라 조건에 맞는 곳이 없는 경우예요).</Notice>}
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              {res.candidates.map((c) => {
                const b = fresh.bubbles.find((x) => x.code === c.code) as FoodBubble;
                const fav = p.isFavorite(c.code);
                return (
                  <li key={c.code} style={{ border: "1px solid #E5E7EB", borderRadius: 10, padding: "8px 10px", background: "white" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                      <strong style={{ fontSize: 15 }}>{c.name}{c.type ? <span style={{ fontWeight: 400, fontSize: 12.5, color: "#6B7280" }}> {c.type}</span> : null}</strong>
                      <span style={{ fontWeight: 800, fontSize: 16, whiteSpace: "nowrap" }}>{formatMetric(fresh.kind, c.value)}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: "#6B7280" }}>
                      {fresh.label} · 같은 업종 점포 {c.stores.toLocaleString()}곳{c.caution ? ` · 점포 ${SAMPLE_MIN}~19곳이라 값이 크게 흔들릴 수 있어요` : ""}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                      <button type="button" onClick={() => p.onReport(b)} style={btn(true)}>상권분석 보고서 보기 ›</button>
                      <button type="button" onClick={() => p.onPick(b, fresh)} style={btn(false)}>종합분석 보기</button>
                      <button type="button" aria-pressed={fav} onClick={() => p.onFavorite(b, fresh)} style={btn(false)}>{fav ? "★ 내 관심 지역에서 빼기" : "☆ 내 관심 지역에 담기"}</button>
                    </div>
                  </li>
                );
              })}
            </ul>
            {res.more > 0 && <div style={{ fontSize: 12.5, color: "#6B7280", marginTop: 6 }}>조건에 맞는 곳이 {res.more}곳 더 있어요. 지도에서 원을 눌러 볼 수 있어요.</div>}
            <div style={{ fontSize: 12.5, color: "#6B7280", marginTop: 8, lineHeight: 1.6 }}>
              {res.excludedSmall > 0 && <>점포가 {SAMPLE_MIN}곳 미만이라 해석을 보류한 {unitWord} {res.excludedSmall}곳, </>}
              {res.excludedMissing > 0 && <>자료가 없는 {unitWord} {res.excludedMissing}곳{res.notMatching > 0 ? ", " : ""}</>}
              {res.notMatching > 0 && <>조건에 맞지 않는 {unitWord} {res.notMatching}곳</>}
              {res.excludedSmall + res.excludedMissing + res.notMatching > 0 ? "은 후보에서 뺐어요." : ""}
            </div>
          </>
        )}
      </div>
    </Drawer>
  );
}

const btn = (primary: boolean, disabled = false): React.CSSProperties => ({
  minHeight: 36, padding: "6px 12px", borderRadius: 8, fontSize: 14, fontWeight: primary ? 700 : 500, cursor: disabled ? "not-allowed" : "pointer",
  border: primary ? "1px solid #1D4ED8" : "1px solid #D1D5DB", background: primary ? "#1D4ED8" : "white", color: disabled ? "#9CA3AF" : primary ? "white" : "#374151",
});
