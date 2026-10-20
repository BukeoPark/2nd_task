/** '내 가게' 묶음 맨 위 — 지금 기록 상태(월 매출 개수·최근 달·비용 입력)와 월 매출 기록 버튼을 먼저 보인다. 기록 입력칸은 아래 '내 가게 점검'에 있다(여기서 따로 받지 않는다). */
export function MineStatusBar({ months, lastMonth, costsFilled, storeName }: { months: number; lastMonth: string | null; costsFilled: number; storeName: string }) {
  const has = months > 0;
  const go = () => {
    const el = document.getElementById("my-store-month-input");
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    el?.focus({ preventScroll: true });
  };
  return (
    <section aria-label="내 가게 현재 상태" style={{ marginTop: 4, border: "1px solid #E5E7EB", borderRadius: 12, padding: "12px 14px", background: "white" }}>
      <div style={{ fontSize: 12, color: "#4B5563" }}>{storeName}</div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", margin: "4px 0 10px" }}>
        <Fact label="월 매출 기록" value={has ? `${months}개월` : "기록 없음"} note={has ? `최근 ${lastMonth}` : "0원이 아니라 아직 입력 전"} />
        <Fact label="비용 입력" value={costsFilled > 0 ? `${costsFilled}/5칸` : "입력 없음"} note={costsFilled > 0 ? "손익분기에 사용" : "넣으면 손익분기 계산"} />
      </div>
      <button type="button" onClick={go} style={{ width: "100%", padding: "9px 12px", border: "none", borderRadius: 8, background: "#1D4ED8", color: "white", fontWeight: 700, fontSize: 14, cursor: "pointer", textAlign: "left" }}>
        {has ? "이번 달 매출 기록 추가하기" : "월 매출 기록 시작하기"} ›
        <span style={{ display: "block", fontSize: 11, fontWeight: 500, opacity: 0.9 }}>이 브라우저에만 저장 · 상권 평균과 변화율로 견줍니다</span>
      </button>
    </section>
  );
}

function Fact({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "#4B5563" }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: 20, lineHeight: 1.3 }}>{value}</div>
      <div style={{ fontSize: 11, color: "#6B7280" }}>{note}</div>
    </div>
  );
}
