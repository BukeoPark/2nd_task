import { useState } from "react";
import { Drawer } from "../../components/Drawer";
import { Notice, SourceNote } from "../../components/Notice";
import { FranchiseSection } from "./FranchiseSection";
import { GoogleReviewSection } from "./GoogleReviewSection";
import { ImprovementReportSection } from "./ImprovementReportSection";
import { MyStoreCheckupSection } from "./MyStoreCheckupSection";
import { NearbyAnalysisSection } from "./NearbyAnalysisSection";
import { OperationHistorySection } from "./OperationHistorySection";
import { SalesBenchmarkSection } from "./SalesBenchmarkSection";
import { StoreSummary } from "./StoreSummary";
import { useStoreDetail } from "./useStores";

interface StoreDetailPanelProps {
  storeId: string;
  onBack: () => void;
  onClose: () => void;
}

/** 매장 상세: 기본정보 + '동네 매출 비교' + '상권 운영 점검' + 'Google 고객평가' / '매장 운영이력' / '주변 상권 분석'. 정보가 부족해도 제공 가능한 영역은 그대로 보여준다.
 * 세 영역을 합친 점수(매장 신뢰도 등)는 만들지 않는다. */
export function StoreDetailPanel({ storeId, onBack, onClose }: StoreDetailPanelProps) {
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
          <div style={{ fontSize: 12, color: "#374151" }}>
            {store.address ?? "주소 정보 없음"}
            {store.building ? ` (${store.building})` : ""}
          </div>
          <SourceNote title={store.source.title} reference={store.source.reference} />

          <StoreSummary storeId={storeId} />
          <SalesBenchmarkSection storeId={storeId} manwon={manwon} onManwonChange={setManwon} />
          <MyStoreCheckupSection key={storeId} storeId={storeId} />
          <FranchiseSection storeId={storeId} manwon={manwon} />
          <ImprovementReportSection storeId={storeId} manwon={manwon} />
          <GoogleReviewSection storeId={storeId} />
          <OperationHistorySection history={data.operation_history} />
          <NearbyAnalysisSection storeId={storeId} />
        </>
      )}
    </Drawer>
  );
}
