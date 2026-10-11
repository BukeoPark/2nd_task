import { useState } from "react";
import { Drawer } from "../../components/Drawer";
import { Fold, Notice, Section, SourceNote } from "../../components/Notice";
import type { StoreBasic } from "../../lib/apiClient";
import { FranchiseSection } from "./FranchiseSection";
import { GoogleReviewSection } from "./GoogleReviewSection";
import { ImprovementReportSection } from "./ImprovementReportSection";
import { AnchorSection, NearbyAnalysisSection } from "./NearbyAnalysisSection";
import { LicenseSummary, OperationHistorySection } from "./OperationHistorySection";
import { SalesBenchmarkSection } from "./SalesBenchmarkSection";
import { useStoreDetail } from "./useStores";

interface StoreDetailPanelProps {
  storeId: string;
  onBack: () => void;
  onClose: () => void;
  /** 소속 행정동·세부 상권 분석 화면으로 이동 */
  onOpenArea: (target: { level: "dong" | "trdar"; store: StoreBasic }) => void;
}

/** 매장 상세 — 매장 고유정보 중심(기본·영업 상태·업력 → Google 고객평가 → 인증·지정 → 앵커 거리 → 반경 500m 경쟁 환경 → 내 매출 벤치마킹 → 상권 이동 링크).
 * 상권 매출 추이·인구·시간대 그래프는 행정동·상권 상세에만 둔다. 영역을 합친 점수(매장 신뢰도 등)는 만들지 않는다. */
export function StoreDetailPanel({ storeId, onBack, onClose, onOpenArea }: StoreDetailPanelProps) {
  const { data, isLoading, isError, error } = useStoreDetail(storeId);
  // 사장님 월 매출(만원) — 매출 비교와 개선 리포트가 함께 쓰며, 이 화면 상태로만 존재한다(서버 전송·저장 없음).
  const [manwon, setManwon] = useState("");
  const store = data?.store;
  return (
    <Drawer
      title={store ? `${store.name}${store.branch ? ` ${store.branch}` : ""}` : "매장 정보"}
      subtitle={store ? `${store.category.lcls} > ${store.category.mcls} > ${store.category.scls}` : undefined}
      onBack={onBack}
      onClose={onClose}
    >
      {isLoading && <Notice tone="muted">매장 정보를 불러오는 중...</Notice>}
      {isError && <Notice tone="error">조회 실패: {error.message}</Notice>}
      {store && data && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", marginBottom: 2 }}>기본정보 · 이 매장</div>
          <div style={{ fontSize: 12, color: "#374151" }}>
            {store.address ?? "주소 정보 없음"}
            {store.building ? ` (${store.building})` : ""}
          </div>
          <SourceNote title={store.source.title} reference={store.source.reference} />
          <div style={{ marginTop: 10 }}>
            <LicenseSummary history={data.operation_history} />
          </div>

          <GoogleReviewSection storeId={storeId} />
          <OperationHistorySection history={data.operation_history} />
          <AnchorSection storeId={storeId} />
          <NearbyAnalysisSection storeId={storeId} />
          <SalesBenchmarkSection storeId={storeId} manwon={manwon} onManwonChange={setManwon} />
          <Section title="소속 상권 — 행정동·발달/골목상권">
            <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 6 }}>상권 매출 추이·인구·시간대별 소비는 아래 지역 화면에서 봅니다(이 매장의 정보가 아니라 상권 평균).</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <button type="button" onClick={() => onOpenArea({ level: "dong", store })} style={linkStyle}>{store.dong} 행정동 종합분석 ›</button>
              {store.trdar ? (
                <button type="button" onClick={() => onOpenArea({ level: "trdar", store })} style={linkStyle}>{store.trdar.name}({store.trdar.type}) 상권 분석 ›</button>
              ) : (
                <Notice tone="muted">이 매장은 서울시 지정 상권 경계 밖에 있어 세부 상권 분석이 없습니다.</Notice>
              )}
            </div>
          </Section>

          <Section title="추가 참고 — 상권 평균 기준">
            <Fold title="프랜차이즈 참고·상권 운영 점검 펼치기">
              <FranchiseSection storeId={storeId} manwon={manwon} />
              <ImprovementReportSection storeId={storeId} manwon={manwon} />

            </Fold>
          </Section>
        </>
      )}
    </Drawer>
  );
}

const linkStyle: React.CSSProperties = { padding: "8px 10px", border: "1px solid #3B82F6", borderRadius: 8, background: "white", color: "#1D4ED8", cursor: "pointer", textAlign: "left", fontWeight: 600 };
