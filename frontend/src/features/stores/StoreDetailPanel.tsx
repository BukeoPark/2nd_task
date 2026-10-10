import { useState } from "react";
import { Drawer } from "../../components/Drawer";
import { Fold, Notice, Section, SourceNote } from "../../components/Notice";
import type { StoreBasic } from "../../lib/apiClient";
import { FranchiseSection } from "./FranchiseSection";
import { GoogleReviewSection } from "./GoogleReviewSection";
import { ImprovementReportSection } from "./ImprovementReportSection";
import { MyStoreCheckupSection } from "./MyStoreCheckupSection";
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
  // 네이버 장소 ID 가 없어 장소 상세가 아니라 검색 결과로만 보낸다. 긴 전체 주소는 '업체 없음'이 나오기 쉬워 기본 검색어는 짧게 쓴다.
  const naver = store ? naverSearches(store) : null;
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
          {naver && naver.primary && (
            <div style={{ marginTop: 6 }}>
              <a href={naver.primary} target="_blank" rel="noopener noreferrer" style={naverLinkStyle}>
                네이버 지도에서 보기 ↗
              </a>
              <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 10, fontSize: 11 }}>
                {naver.nameOnly && (
                  <a href={naver.nameOnly} target="_blank" rel="noopener noreferrer" style={subLinkStyle}>매장명만 검색 ↗</a>
                )}
                {naver.address && (
                  <a href={naver.address} target="_blank" rel="noopener noreferrer" style={subLinkStyle}>주소로 위치 검색 ↗</a>
                )}
              </div>
              <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 2 }}>검색 결과로 이동합니다. 네이버 지도 검색 결과가 실제 매장과 일치하는지 확인하세요.</div>
            </div>
          )}
          <SourceNote title={store.source.title} reference={store.source.reference} />
          <div style={{ marginTop: 10 }}>
            <LicenseSummary history={data.operation_history} />
          </div>

          <GoogleReviewSection storeId={storeId} />
          <OperationHistorySection history={data.operation_history} />
          <AnchorSection storeId={storeId} />
          <NearbyAnalysisSection storeId={storeId} />
          <SalesBenchmarkSection storeId={storeId} manwon={manwon} onManwonChange={setManwon} />
          <MyStoreCheckupSection key={storeId} storeId={storeId} />
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

/** 네이버 지도 '검색 결과' 링크 3종 — 기본(상호+지점+구/동), 상호만, 주소만. 쓸 글자가 없는 링크는 null. */
function naverSearches(store: StoreBasic): { primary: string | null; nameOnly: string | null; address: string | null } {
  const clean = (v: string | null | undefined) => (v ?? "").trim();
  const url = (q: string) => (q ? `https://map.naver.com/p/search/${encodeURIComponent(q)}` : null);
  const name = clean(store.name);
  const base = [name, clean(store.branch)].filter(Boolean).join(" ");
  // 구/동은 매장 기본정보의 시군구·행정동 값을 그대로 쓴다. 비어 있으면 붙이지 않고 상호+지점만 쓴다.
  const area = [clean(store.sigungu), clean(store.dong)].filter(Boolean).join(" ");
  const primary = url(base && area ? `${base} ${area}` : base);
  const nameOnly = url(name);
  return { primary, nameOnly: nameOnly === primary ? null : nameOnly, address: url(clean(store.address)) };
}

const linkStyle: React.CSSProperties = { padding: "8px 10px", border: "1px solid #3B82F6", borderRadius: 8, background: "white", color: "#1D4ED8", cursor: "pointer", textAlign: "left", fontWeight: 600 };

const naverLinkStyle: React.CSSProperties = { display: "inline-block", marginTop: 6, padding: "4px 10px", border: "1px solid #03C75A", borderRadius: 6, color: "#02A94C", fontSize: 12, fontWeight: 600, textDecoration: "none" };
const subLinkStyle: React.CSSProperties = { color: "#02A94C", textDecoration: "underline" };
