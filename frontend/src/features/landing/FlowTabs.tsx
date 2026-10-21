import { useState, type KeyboardEvent } from "react";
import { FLOWS } from "./content";
import type { Mode } from "../../lib/mode";
import { Glimpse } from "./Art";

const ORDER: Mode[] = ["owner", "founder"];

/** 이용 흐름 — 자영업자(5단계)와 예비 창업자(4단계)를 탭으로 바꿔 보여 준다. 탭은 화살표 키로도 옮긴다. */
export function FlowTabs() {
  const [mode, setMode] = useState<Mode>("owner");
  const flow = FLOWS[mode];
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setMode((m) => ORDER[(ORDER.indexOf(m) + (e.key === "ArrowRight" ? 1 : ORDER.length - 1)) % ORDER.length]);
  };
  return (
    <>
      <div className="flow-head">
        <div>
          <p className="eyebrow">이용 흐름</p>
          <h2 className="h2" style={{ marginTop: 8 }}>
            {mode === "owner" ? "다섯 걸음이면, 내 가게의 자리가 보여요" : "다섯 걸음이면, 후보가 한눈에 정리돼요"}
          </h2>
        </div>
        <div className="tabs" role="tablist" aria-label="이용 대상" onKeyDown={onKey}>
          {ORDER.map((m) => (
            <button key={m} id={`tab-${m}`} role="tab" type="button" aria-selected={m === mode} aria-controls="flow-panel" tabIndex={m === mode ? 0 : -1} onClick={() => setMode(m)}>
              {FLOWS[m].label}
            </button>
          ))}
        </div>
      </div>
      <ol className="steps" id="flow-panel" role="tabpanel" aria-labelledby={`tab-${mode}`}>
        {flow.steps.map((s, i) => (
          <li className="step" key={s.title}>
            <div>
              <div className="step-no">{String(i + 1).padStart(2, "0")} / {String(flow.steps.length).padStart(2, "0")}</div>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </div>
            <div className="step-art"><Glimpse art={s.art} /></div>
          </li>
        ))}
      </ol>
    </>
  );
}
