import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { CostCheckSection } from "./CostCheckSection";
import { ModalNav } from "../nav/ModalNav";
import { useOverlayBack } from "../nav/useOverlayBack";
import { FS } from "../../lib/typography";

interface Props {
  unitKey?: string;
  unitName: string;
  unitWord: string;
  scopeLabel: string;
  benchWon: number | null;
  onClose: () => void;
}

/** 창업 비용 점검 작업 화면 — 지도 옆 좁은 패널 대신 화면 전체를 쓴다. '지도로 돌아가기'·Esc 로 닫으면 지도와 선택 상태 그대로다. */
export function CostCheckModal({ unitKey, unitName, unitWord, scopeLabel, benchWon, onClose }: Props) {
  const back = useRef<HTMLButtonElement>(null);
  const requestClose = useOverlayBack(onClose);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    back.current?.focus();
    return () => { opener?.focus?.(); };
  }, []);
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="창업 비용 점검" style={{ position: "fixed", inset: 0, zIndex: 1000, background: "#F3F4F6", overflowY: "auto", fontSize: FS.body }}>
      <div style={{ position: "sticky", top: 0, zIndex: 2, background: "white", borderBottom: "1px solid #E5E7EB", padding: "10px 20px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <ModalNav onBack={requestClose} backRef={back} />
        <strong style={{ fontSize: FS.screenTitle }}>창업 비용 점검</strong>
        <span style={{ color: "#6B7280", fontSize: FS.warn }}>{unitName} · {scopeLabel}</span>
      </div>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "16px 24px 32px" }}>
        <CostCheckSection unitKey={unitKey} unitWord={unitWord} scopeLabel={scopeLabel} benchWon={benchWon} />
      </div>
    </div>,
    document.body,
  );
}
