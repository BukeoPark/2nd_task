import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { MODE_LABEL, type Mode } from "../../lib/mode";
import { placeTip, TOURS, type Rect } from "../../lib/tour";
import { expandForTour, restoreFolds, type FoldLog } from "../../lib/tourFolds";
import { useNarrow } from "../../lib/useNarrow";
import type { Tour } from "./useTour";
import { stepsLine } from "../../lib/flow";

const Z = 2000;
const PAD = 5;
const DIM = "rgba(15,23,42,0.58)";

const WELCOME: Record<Mode, { title: string; lines: string[] }> = {
  owner: {
    title: "내 가게 상권, 어느 수준일까요?",
    lines: [`${stepsLine("owner")} 순서로 안내해 드려요.`, "1분이면 끝나요. 언제든 위쪽 '도움말'에서 다시 볼 수 있어요."],
  },
  founder: {
    title: "어디에서 시작하면 좋을까요?",
    lines: [`어디까지 정하셨는지 고른 뒤 ${stepsLine("founder")} 순서로 안내해 드려요.`, "1분이면 끝나요. 언제든 위쪽 '도움말'에서 다시 볼 수 있어요."],
  },
};

const btn = (primary: boolean): CSSProperties => ({
  padding: "8px 16px", borderRadius: 8, border: primary ? "none" : "1px solid #D1D5DB", background: primary ? "#1D4ED8" : "#fff", color: primary ? "#fff" : "#374151",
  fontWeight: 700, fontSize: 13, cursor: "pointer",
});

/** 처음 방문 환영 팝업 */
function Welcome({ mode, tour }: { mode: Mode; tour: Tour }) {
  const [never, setNever] = useState(false);
  const primary = useRef<HTMLButtonElement>(null);
  const w = WELCOME[mode];
  useEffect(() => {
    primary.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") tour.dismissWelcome(never); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tour, never]);
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: Z, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div role="dialog" aria-modal="true" aria-label="이용 안내" style={{ background: "#fff", color: "#111827", borderRadius: 14, padding: "26px 28px 20px", width: "min(440px, 100%)", boxShadow: "0 12px 40px rgba(0,0,0,0.35)" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#1D4ED8", letterSpacing: ".06em" }}>{MODE_LABEL[mode]} 모드</div>
        <h2 style={{ fontSize: 20, margin: "4px 0 10px", lineHeight: 1.35 }}>{w.title}</h2>
        {w.lines.map((l) => (<p key={l} style={{ margin: "0 0 8px", fontSize: 13.5, lineHeight: 1.6, color: "#374151" }}>{l}</p>))}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button type="button" style={btn(false)} onClick={() => tour.dismissWelcome(never)}>나중에</button>
          <button ref={primary} type="button" style={btn(true)} onClick={tour.start}>튜토리얼 시작</button>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center", marginTop: 14, fontSize: 12, color: "#6B7280", cursor: "pointer" }}>
          <input type="checkbox" checked={never} onChange={(e) => setNever(e.target.checked)} /> 다시 보지 않기
        </label>
      </div>
    </div>
  );
}

const TOP_MENU_TARGETS = ["mode", "svc", "scls", "metric", "mode-menu", "help"];

function findTarget(name: string, folds: FoldLog): HTMLElement | null {
  // 휴대폰 폭에서는 모드·업종·지표·월간 점검·도움말이 '메뉴' 시트 안에 있어, 시트가 닫혀 있으면 '메뉴' 단추를 가리킨다
  const el = document.querySelector<HTMLElement>(`[data-tour="${name}"]`) ?? (TOP_MENU_TARGETS.includes(name) ? document.querySelector<HTMLElement>('[data-tour="menu"]') : null);
  if (!el) return null;
  // '그 밖의 작업' 같은 접힌 영역 안의 버튼을 가리킬 때는 펼쳐서 사용자가 눈으로 찾을 수 있게 한다(단계가 끝나면 원래대로, 사용자가 만진 영역은 그대로)
  const fold = el.closest("details");
  if (fold) expandForTour(fold, folds);
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? el : null;
}

/** 대상 사각형만 비워 두고 둘레를 어둡게 한다(네 조각) — 구멍 안은 그대로 눌러 볼 수 있다. */
function Spotlight({ rect }: { rect: Rect }) {
  const right = rect.left + rect.width;
  const bottom = rect.top + rect.height;
  const piece = (style: CSSProperties) => <div style={{ position: "fixed", background: DIM, ...style }} />;
  return (
    <>
      {piece({ left: 0, top: 0, right: 0, height: Math.max(0, rect.top) })}
      {piece({ left: 0, top: bottom, right: 0, bottom: 0 })}
      {piece({ left: 0, top: rect.top, width: Math.max(0, rect.left), height: rect.height })}
      {piece({ left: right, top: rect.top, right: 0, height: rect.height })}
      <div style={{ position: "fixed", left: rect.left, top: rect.top, width: rect.width, height: rect.height, borderRadius: 10, outline: "2px solid #60A5FA", transition: "all .2s" }} />
    </>
  );
}

/** 단계별 안내 — 대상 요소만 밝게 하고 옆에 말풍선을 붙인다. 대상이 지금 없으면 화면 가운데 카드로 말한다. 막지 않는다: 밝은 곳은 그대로 눌러 볼 수 있다. */
function Steps({ mode, tour }: { mode: Mode; tour: Tour }) {
  const steps = TOURS[mode];
  const step = steps[tour.index];
  const narrow = useNarrow();
  const [rect, setRect] = useState<Rect | null>(null);
  const [size, setSize] = useState({ width: 320, height: 170 });
  const card = useRef<HTMLDivElement>(null);
  const folds = useRef<FoldLog>(new Map());
  const last = tour.index === steps.length - 1;
  const hasRect = rect !== null;

  // 대상 위치를 따라간다(패널이 열리거나 창 크기가 바뀌면 달라지므로 가볍게 주기적으로 다시 잰다)
  useEffect(() => {
    const measure = () => {
      const el = findTarget(step.target, folds.current);
      if (!el) { setRect((r) => (r === null ? r : null)); return; }
      const b = el.getBoundingClientRect();
      setRect((r) => (r && r.left === b.left && r.top === b.top && r.width === b.width && r.height === b.height ? r : { left: b.left, top: b.top, width: b.width, height: b.height }));
    };
    const foldLog = folds.current;
    findTarget(step.target, foldLog)?.scrollIntoView({ block: "nearest", inline: "nearest" });
    measure();
    const id = window.setInterval(measure, 250);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => { window.clearInterval(id); window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); restoreFolds(foldLog); };
  }, [step.target]);

  useLayoutEffect(() => {
    const b = card.current?.getBoundingClientRect();
    if (b) setSize((z) => (Math.round(b.width) !== Math.round(z.width) || Math.round(b.height) !== Math.round(z.height) ? { width: b.width, height: b.height } : z));
  }, [tour.index, hasRect, narrow]);

  useEffect(() => { card.current?.focus(); }, [tour.index]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") tour.close();
      else if (e.key === "ArrowRight") tour.next();
      else if (e.key === "ArrowLeft") tour.prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tour]);

  const view = { width: window.innerWidth, height: window.innerHeight };
  let cardStyle: CSSProperties;
  if (narrow) cardStyle = { left: 8, right: 8, bottom: 8 };
  else if (rect) {
    const p = placeTip({ left: rect.left - PAD, top: rect.top - PAD, width: Math.max(rect.width, step.avoid?.width ?? 0) + PAD * 2, height: rect.height + (step.avoid?.height ?? 0) + PAD * 2 }, size, view, step.placement);
    cardStyle = { left: p.left, top: p.top, width: 320 };
  } else cardStyle = { left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: "min(360px, calc(100vw - 24px))" };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: Z, pointerEvents: "none" }}>
      {rect ? <Spotlight rect={{ left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }} /> : <div style={{ position: "fixed", inset: 0, background: DIM }} />}
      <div
        ref={card}
        tabIndex={-1}
        role="dialog"
        aria-label={`튜토리얼 ${tour.index + 1}/${steps.length}: ${step.title}`}
        style={{ position: "fixed", ...cardStyle, pointerEvents: "auto", background: "#fff", color: "#111827", borderRadius: 12, padding: "14px 16px 12px", boxShadow: "0 8px 30px rgba(0,0,0,0.35)", outline: "none" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#1D4ED8" }}>{tour.index + 1} / {steps.length}</span>
          <button type="button" onClick={tour.close} aria-label="튜토리얼 건너뛰기" style={{ border: "none", background: "none", color: "#6B7280", fontSize: 12, cursor: "pointer" }}>건너뛰기 ✕</button>
        </div>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>{step.title}</div>
        <div role="status" style={{ fontSize: 13, lineHeight: 1.6, color: "#374151" }}>{rect ? step.body : step.fallback ?? step.body}</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
          <span aria-hidden="true" style={{ display: "flex", gap: 4 }}>
            {steps.map((s, i) => (<span key={s.id} style={{ width: 6, height: 6, borderRadius: "50%", background: i === tour.index ? "#1D4ED8" : "#D1D5DB" }} />))}
          </span>
          <span style={{ display: "flex", gap: 6 }}>
            {tour.index > 0 && <button type="button" style={btn(false)} onClick={tour.prev}>이전</button>}
            <button type="button" style={btn(true)} onClick={tour.next}>{last ? "완료" : "다음"}</button>
          </span>
        </div>
      </div>
    </div>
  );
}

/** 환영 팝업과 단계별 안내를 한 곳에서 그린다(상태는 useTour). */
export function TourLayer({ mode, tour }: { mode: Mode; tour: Tour }) {
  if (tour.phase === "welcome") return <Welcome mode={mode} tour={tour} />;
  if (tour.phase === "running") return <Steps mode={mode} tour={tour} />;
  return null;
}
