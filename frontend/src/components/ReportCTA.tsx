import { AppIcon } from "./DataVisuals";
import { FS } from "../lib/typography";

/** 보고서 보기 단추 — 종합분석 요약과 매장 상세 맨 위가 같은 모양(주황 채움·아이콘·범위 한 줄)을 쓴다.
 * title 은 무엇을 여는지, sub 는 어느 범위(지역 이름·무엇을 담는지)인지. 범위가 다른 보고서는 title 이 아니라 sub 로 구분한다. */
export function ReportCTA({ title, sub, onClick, tourId }: { title: string; sub: string; onClick: () => void; tourId?: string }) {
  return (
    <button
      type="button"
      data-tour={tourId}
      onClick={onClick}
      style={{ width: "100%", minHeight: 56, padding: "12px 14px", border: "1px solid #C2410C", borderRadius: 12, background: "#C2410C", color: "#FFFFFF", boxShadow: "0 4px 12px rgba(194,65,12,.18)", fontWeight: 700, fontSize: FS.cardTitle, cursor: "pointer", textAlign: "left" }}
    >
      <span className="data-heading"><AppIcon name="trend" />{title}</span>
      <span style={{ display: "block", fontSize: FS.warn, fontWeight: 500, opacity: 0.92, marginTop: 2 }}>{sub}</span>
    </button>
  );
}
