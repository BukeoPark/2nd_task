import { AppLink } from "../../components/AppLink";
import { HOME_PATH } from "../../lib/route";
import { FS } from "../../lib/typography";

const btn: React.CSSProperties = { display: "inline-flex", alignItems: "center", minHeight: 38, padding: "6px 12px", borderRadius: 8, fontWeight: 600, fontSize: FS.ui, cursor: "pointer", textDecoration: "none", whiteSpace: "nowrap" };

/** 전체 화면 작업창 맨 위의 이동 단추 — '← 뒤로'(이전 화면으로, 브라우저 뒤로와 같음)와 '홈'(랜딩페이지). 모든 작업창이 같은 모양을 쓴다. */
export function ModalNav({ onBack, backLabel = "← 뒤로", backRef }: { onBack: () => void; backLabel?: string; backRef?: React.Ref<HTMLButtonElement> }) {
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <button ref={backRef} type="button" onClick={onBack} style={{ ...btn, border: "1px solid #3B82F6", background: "white", color: "#1D4ED8" }}>{backLabel}</button>
      <AppLink to={HOME_PATH} style={{ ...btn, border: "1px solid #D1D5DB", background: "white", color: "#374151" }} aria-label="홈(랜딩페이지)으로">홈</AppLink>
    </span>
  );
}
