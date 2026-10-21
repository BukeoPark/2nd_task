import { useState } from "react";
import { Drawer } from "../../components/Drawer";
import { Notice } from "../../components/Notice";
import type { FoodBubble, FoodBubblesResponse } from "../../lib/apiClient";
import { candidatesFor, cautionText, PRESETS, presetById, resultScopeNote, resultTitle, type PresetId } from "../../lib/explorePresets";
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
  const scopeNote = res ? resultScopeNote(preset, res) : null;
  // 조건은 고른 뒤에는 한 줄 칩으로 접어 결과가 첫 화면에 보이게 한다('변경'을 누르면 네 질문이 다시 펼쳐진다)
  const [choosing, setChoosing] = useState(false);
  return (
    <Drawer title="조건으로 후보 찾기" subtitle="어떤 곳을 먼저 보고 싶으세요?" onClose={p.onClose}>
      {choosing ? (
        <div role="radiogroup" aria-label="찾는 조건" style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
          {PRESETS.map((x) => {
            const on = x.id === preset.id;
            return (
              <button key={x.id} type="button" role="radio" aria-checked={on} onClick={() => { p.onPreset(x.id); setChoosing(false); }}
                style={{ textAlign: "left", padding: "9px 12px", borderRadius: 10, border: on ? "2px solid #1D4ED8" : "1px solid #D1D5DB", background: on ? "#EFF6FF" : "white", color: on ? "#1E3A8A" : "#111827", fontWeight: on ? 800 : 600, fontSize: 15, cursor: "pointer" }}>
                {x.question}
              </button>
            );
          })}
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 8, padding: "8px 8px 8px 12px", borderRadius: 10, border: "2px solid #1D4ED8", background: "#EFF6FF" }}>
          <span style={{ fontWeight: 800, fontSize: 15, color: "#1E3A8A" }}>{preset.question}</span>
          <button type="button" aria-expanded={false} onClick={() => setChoosing(true)}
            style={{ minHeight: 36, padding: "6px 12px", borderRadius: 8, border: "1px solid #1D4ED8", background: "white", color: "#1D4ED8", fontWeight: 700, fontSize: 14, cursor: "pointer", whiteSpace: "nowrap" }}>
            조건 변경
          </button>
        </div>
      )}

      <div style={{ display: "flex", gap: 6, alignItems: "center", margin: "8px 0 0", fontSize: 13 }}>
        <span style={{ color: "#4B5563" }}>보는 단위</span>
        {(["dong", "trdar"] as const).map((l) => (
          <button key={l} type="button" aria-pressed={p.level === l} onClick={() => p.onLevel(l)}
            style={{ minHeight: 32, padding: "3px 12px", borderRadius: 999, border: p.level === l ? "1px solid #1D4ED8" : "1px solid #D1D5DB", background: p.level === l ? "#1D4ED8" : "white", color: p.level === l ? "white" : "#374151", cursor: "pointer", fontSize: 13 }}>
            {l === "dong" ? "행정동" : "상권"}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 10 }}>
        {q.isError && <Notice tone="error">후보를 불러오지 못했어요: {q.error.message} <button type="button" onClick={() => void q.refetch()}>다시 시도</button></Notice>}
        {!q.isError && !fresh && <Notice tone="muted">조건에 맞는 {unitWord}를 찾는 중...</Notice>}
        {fresh && res && (
          <>
            <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.35 }}>{resultTitle(preset, unitWord, res.candidates.length)}</div>
            <div style={{ fontSize: 12.5, color: "#6B7280", marginTop: 2 }}>{p.filterName} · {fresh.as_of} · 영등포구·양천구</div>
            {scopeNote && <div style={{ fontSize: 12.5, color: "#6B7280" }}>{scopeNote}</div>}
            <div style={{ fontSize: 13.5, color: "#92400E", lineHeight: 1.5, marginTop: 4 }}>※ {preset.warn}</div>
            {res.candidates.length === 0 && <Notice tone="muted">이 조건에 맞는 {unitWord}가 없어요(자료가 없는 것이 아니라 조건에 맞는 곳이 없는 경우예요).</Notice>}
            <ul style={{ listStyle: "none", margin: "8px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              {res.candidates.map((c) => {
                const b = fresh.bubbles.find((x) => x.code === c.code) as FoodBubble;
                const fav = p.isFavorite(c.code);
                return (
                  <li key={c.code} onClick={() => p.onPick(b, fresh)} style={{ border: "1px solid #E5E7EB", borderRadius: 10, padding: "6px 8px 8px 10px", background: "white", cursor: "pointer" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                      {/* 카드 어디를 눌러도 종합분석이 열리고, 키보드·화면낭독은 이 이름 단추로 같은 일을 한다 */}
                      <button type="button" aria-label={`${c.name} 종합분석 보기`} onClick={(e) => { e.stopPropagation(); p.onPick(b, fresh); }}
                        style={{ flex: 1, minWidth: 0, padding: 0, border: 0, background: "none", textAlign: "left", cursor: "pointer", color: "#111827", font: "inherit" }}>
                        <strong style={{ fontSize: 15 }}>{c.name}{c.type ? <span style={{ fontWeight: 400, fontSize: 12.5, color: "#6B7280" }}> {c.type}</span> : null}</strong>
                      </button>
                      <span style={{ fontWeight: 800, fontSize: 16, whiteSpace: "nowrap" }}>{formatMetric(fresh.kind, c.value)}</span>
                      <button type="button" aria-pressed={fav} aria-label={fav ? `${c.name} 내 관심 지역에서 빼기` : `${c.name} 내 관심 지역에 담기`} title={fav ? "내 관심 지역에서 빼기" : "내 관심 지역에 담기"}
                        onClick={(e) => { e.stopPropagation(); p.onFavorite(b, fresh); }}
                        style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 8, border: "1px solid #D1D5DB", background: fav ? "#FEF3C7" : "white", color: fav ? "#B45309" : "#6B7280", fontSize: 18, lineHeight: 1, cursor: "pointer" }}>
                        {fav ? "★" : "☆"}
                      </button>
                    </div>
                    {c.caution && <div style={{ fontSize: 12.5, color: "#6B7280", margin: "0 0 4px" }}>{cautionText(preset, c.stores)}</div>}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
                      <button type="button" aria-label={`${c.name} 상권분석 보고서 보기`} onClick={(e) => { e.stopPropagation(); p.onReport(b); }} style={{ minHeight: 36, padding: "6px 4px", border: 0, background: "none", color: "#6B7280", fontSize: 13, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}>보고서 보기</button>
                    </div>
                  </li>
                );
              })}
            </ul>
            {res.more > 0 && <div style={{ fontSize: 12.5, color: "#6B7280", marginTop: 6 }}>지도에서 원을 눌러 나머지 {res.more}곳도 볼 수 있어요.</div>}
            <details style={{ marginTop: 10, fontSize: 13, color: "#374151", lineHeight: 1.6 }}>
              <summary style={{ cursor: "pointer", fontWeight: 700, minHeight: 32, display: "flex", alignItems: "center" }}>분석 기준 자세히 보기</summary>
              <ul style={{ margin: "4px 0 0", paddingLeft: 18, color: "#4B5563" }}>
                <li>{preset.what}</li>
                <li>{preset.caveat}</li>
                <li>{p.filterName} · {fresh.scope.metric_scope} · {fresh.label} · {fresh.as_of} · 영등포구·양천구 안에서만 찾아요.</li>
                <li>조건 값 순으로 나열한 것이며 창업 추천 순위가 아닙니다. 같은 업종 점포가 {SAMPLE_MIN}곳 미만인 {unitWord}는 해석을 보류해 뺐고, {SAMPLE_MIN}~19곳은 값이 크게 흔들릴 수 있다고 표시해요.</li>
                {(res.excludedSmall + res.excludedMissing + res.notMatching) > 0 && (
                  <li>
                    뺀 {unitWord}:{" "}
                    {[res.excludedSmall > 0 ? `점포 ${SAMPLE_MIN}곳 미만 ${res.excludedSmall}곳` : "", res.excludedMissing > 0 ? `자료 없음 ${res.excludedMissing}곳` : "", res.notMatching > 0 ? `조건에 맞지 않음 ${res.notMatching}곳` : ""].filter(Boolean).join(" · ")}
                  </li>
                )}
              </ul>
            </details>
          </>
        )}
      </div>
    </Drawer>
  );
}
