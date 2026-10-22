import { ActionButton, Stat } from "../../components/PanelKit";
import { FS } from "../../lib/typography";
/** '내 가게' 묶음 맨 위 — 지금 기록 상태(월 매출 개수·최근 달·비용 입력)와 월 매출 기록 버튼을 먼저 보인다. 기록 입력칸은 아래 '내 가게 점검'에 있다(여기서 따로 받지 않는다). */
export function MineStatusBar({ months, lastMonth, costsFilled, storeName, onOpenMonthly }: { months: number; lastMonth: string | null; costsFilled: number; storeName: string; onOpenMonthly?: () => void }) {
  const has = months > 0;
  const go = () => {
    const el = document.getElementById("my-store-month-input");
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    el?.focus({ preventScroll: true });
  };
  return (
    <section aria-label="내 가게 현재 상태" style={{ marginTop: 4, border: "1px solid #E5E7EB", borderRadius: 12, padding: "14px 16px", background: "white" }}>
      <div style={{ fontSize: FS.warn, color: "#374151" }}>{storeName}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, margin: "8px 0 12px" }}>
        <Stat big label="월 매출 기록" value={has ? `${months}개월` : "기록 없음"} sub={has ? `최근 ${lastMonth}` : "0원이 아니라 아직 입력 전"} missing={!has} />
        <Stat big label="비용 입력" value={costsFilled > 0 ? `${costsFilled}/5칸` : "입력 없음"} sub={costsFilled > 0 ? "손익분기에 사용" : "넣으면 손익분기 계산"} missing={costsFilled === 0} />
      </div>
      <ActionButton variant="primary" full onClick={go} sub="상권 평균과 변화율로 견줍니다">{has ? "이번 달 매출 기록 추가하기" : "월 매출 기록 시작하기"} ›</ActionButton>
      {onOpenMonthly && <div style={{ marginTop: 8 }}><ActionButton variant="secondary" full onClick={onOpenMonthly}>이번 달 점검 한 번에 보기 ›</ActionButton></div>}
    </section>
  );
}
