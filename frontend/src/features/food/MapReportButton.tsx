import { AppIcon } from "../../components/DataVisuals";
import { FS } from "../../lib/typography";
import { OVERLAY_Z_INDEX } from "../../lib/vizConfig";

export interface MapReport {
  /** 단추 제목 — 어떤 보고서인지('업소 인사이트 리포트 보기') */
  title: string;
  /** 어느 범위인지(이름·기준) */
  sub: string;
  onClick: () => void;
  /** 눈에 덜 띄는 보조 보고서(예: 업소를 보다가 소속 상권 전체 보고서) */
  secondary?: { title: string; sub: string; onClick: () => void };
}

interface Props {
  report: MapReport;
  /** 왼쪽에서 비워 둘 폭(px) — 서랍(+레일)이 덮고 있는 만큼. 좁은 화면은 0 */
  leftInset: number;
  /** 오른쪽에서 비워 둘 폭(px) — 오른쪽 아래 독(범례·순위표)이 있는 만큼 */
  rightInset: number;
}

/** 지도 아래쪽에 떠 있는 '인사이트 리포트 보기' 단추. 이 서비스의 도착점이 보고서라서, 서랍 안에 묻히지 않게 지도 위에서 가장 눈에 띄는 주황 채움으로 둔다.
 * 지금 보는 것이 업소면 업소 보고서, 행정동·상권이면 그 지역 보고서를 연다(MapPage 가 정한다). */
export function MapReportButton({ report, leftInset, rightInset }: Props) {
  return (
    <div style={{ position: "absolute", zIndex: OVERLAY_Z_INDEX + 1, left: leftInset, right: rightInset, bottom: 20, display: "flex", justifyContent: "center", gap: 10, pointerEvents: "none", padding: "0 12px" }}>
      <button type="button" data-map-report onClick={report.onClick} style={{ ...primary, pointerEvents: "auto" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: FS.cardTitle, fontWeight: 800 }}><AppIcon name="trend" />{report.title}</span>
        <span style={{ display: "block", fontSize: FS.warn, fontWeight: 500, opacity: 0.95, marginTop: 2 }}>{report.sub}</span>
      </button>
      {report.secondary && (
        <button type="button" data-map-report-secondary onClick={report.secondary.onClick} style={{ ...secondary, pointerEvents: "auto" }}>
          <span style={{ display: "block", fontSize: FS.ui, fontWeight: 800 }}>{report.secondary.title}</span>
          <span style={{ display: "block", fontSize: FS.warn, fontWeight: 500, marginTop: 2 }}>{report.secondary.sub}</span>
        </button>
      )}
    </div>
  );
}

const base: React.CSSProperties = { minHeight: 60, padding: "10px 20px", borderRadius: 14, textAlign: "left", cursor: "pointer", maxWidth: "100%" };
const primary: React.CSSProperties = { ...base, border: "1px solid #9A3412", background: "#C2410C", color: "#FFFFFF", boxShadow: "0 8px 24px rgba(194,65,12,0.38)" };
const secondary: React.CSSProperties = { ...base, border: "2px solid #C2410C", background: "#FFFFFF", color: "#9A3412", boxShadow: "0 6px 18px rgba(0,0,0,0.18)" };
