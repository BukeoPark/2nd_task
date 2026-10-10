import { useQuery } from "@tanstack/react-query";
import { Notice, Section, SourceNote } from "../../components/Notice";
import { apiClient } from "../../lib/apiClient";
import { formatKrw, parseManwon } from "../../lib/format";

const AREA_COLOR: Record<string, string> = {
  영업시간: "#2563EB",
  요일: "#7C3AED",
  손님층: "#DB2777",
  "상권 흐름": "#B45309",
  유동인구: "#059669",
  경쟁: "#DC2626",
  브랜드: "#8B5CF6",
  개폐업: "#0891B2",
};

/** '상권 운영 점검' — 외부 AI 없이 규칙 + 비슷한 상권(같은 유형·비슷한 수요 구조) 비교로 만든다.
 * 각 항목은 관측된 사실 / 가능한 해석 / 현장에서 확인할 사항으로 나눠 보여주고, 원인이나 개선 효과를 단정하지 않는다.
 * 사장님 매출(manwon)은 아래 '내 매출 비교' 한 줄에만 쓰며 점검 항목에는 반영되지 않는다(서버로 보내지 않는다). */
export function ImprovementReportSection({ storeId, manwon }: { storeId: string; manwon: string }) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["improvement-report", storeId],
    queryFn: () => apiClient.getImprovementReport(storeId),
    staleTime: 10 * 60 * 1000,
  });
  const mine = parseManwon(manwon);
  const avg = data?.benchmark?.per_store_month ?? null;
  const ok = data?.status === "ok";

  return (
    <Section title="상권 운영 점검" collapsible>
      {isLoading && <Notice tone="muted">점검 항목을 만드는 중...</Notice>}
      {isError && (
        <Notice tone="error">
          조회 실패: {error.message}{" "}
          <button type="button" onClick={() => void refetch()} style={{ marginLeft: 4, border: "1px solid #DC2626", background: "white", color: "#DC2626", borderRadius: 4, cursor: "pointer" }}>
            다시 시도
          </button>
        </Notice>
      )}
      {data && !ok && <Notice tone="muted">{data.message}</Notice>}
      {data && ok && (
        <div>
          <div style={{ fontSize: 12, color: "#374151", marginBottom: 8 }}>
            {data.unit?.name}({data.unit?.type ?? data.unit?.label}) · 서울시 업종 '{data.svc_nm}' 전체 기준{data.scls_nm && data.scls_nm !== data.svc_nm ? ` (이 매장 세부 업종 '${data.scls_nm}'만의 값이 아님)` : ""} · {data.quarter_label}
          </div>

          {/* ① 내 매출 비교 — 입력한 값으로만 계산(브라우저 안), 아래 ② 점검 항목과는 별개 */}
          <div style={{ background: "#FFF7ED", borderRadius: 8, padding: "8px 10px", fontSize: 12, marginBottom: 10 }}>
            <div style={{ fontWeight: 700, marginBottom: 2 }}>① 내 매출 비교 (입력한 값 기준)</div>
            {mine !== null && avg !== null && avg > 0 ? (
              <div>
                입력한 월 매출 {formatKrw(mine)}은 이 {data.unit?.label} 같은 업종 점포당 추정 평균의 <strong>{((mine / avg) * 100).toFixed(0)}%</strong>입니다.
              </div>
            ) : (
              <div style={{ color: "#6B7280" }}>위 '동네 매출 비교'에 월 매출을 입력하면 평균과의 비율이 여기에 표시됩니다.</div>
            )}
            <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>
              입력값은 이 화면(브라우저)에서만 계산하며 서버로 보내거나 저장하지 않습니다. 이 비교는 아래 ② 점검 항목에 <strong>반영되지 않습니다</strong>.
            </div>
          </div>

          {/* ② 상권 기반 점검 — 입력 매출과 무관 */}
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 2 }}>② 상권 기반 점검 (입력 매출과 무관)</div>
          {data.peer_basis?.text && (
            <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 6 }}>
              비교 기준: {data.peer_basis.text} {data.peer_basis.peers}곳
              {data.top_group && (
                <>
                  {" "}
                  중 점포당 추정매출 상위 {data.top_group.count}곳(월 {formatKrw(data.top_group.per_store_month_min)} 이상, 예: {data.top_group.names.join(", ")}).
                  점포당 추정매출이 높다는 뜻일 뿐 수익성이 좋다는 뜻은 아닙니다(임대료·인건비·원가는 자료에 없음).
                </>
              )}
            </div>
          )}
          {data.top_group_note && <Notice tone="warn">{data.top_group_note}</Notice>}
          {data.top_group?.self_in_top && <Notice tone="info">이 {data.unit?.label}은(는) 비교 상권 상위 25% 안에 있어 매출 구성 차이 항목은 만들지 않았습니다.</Notice>}

          {(data.recommendations ?? []).length === 0 ? (
            <Notice tone="info">
              {data.top_group ? "비교 상권과 매출·인구 구성에서 뚜렷한 차이(5%p 이상)나 다른 점검 신호가 보이지 않습니다." : "비교군이 부족해 구성비 비교 외의 점검 신호도 보이지 않습니다."}
            </Notice>
          ) : (
            <ol style={{ margin: "6px 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 12 }}>
              {data.recommendations!.map((r) => (
                <li key={r.title} style={{ fontSize: 12 }}>
                  <span
                    style={{ fontSize: 10, color: "white", background: AREA_COLOR[r.area] ?? "#6B7280", borderRadius: 4, padding: "1px 5px", marginRight: 4 }}
                  >
                    {r.area}
                  </span>
                  <strong>{r.title}</strong>
                  <Block label="관측된 사실" color="#1F2937" items={r.observed} />
                  <Block label="가능한 해석 (단정 아님)" color="#92400E" items={r.interpretations} />
                  <Block label="현장에서 확인할 사항" color="#065F46" items={r.checks} />
                </li>
              ))}
            </ol>
          )}
          {data.source && <SourceNote title={data.source.title} reference={data.source.reference ?? "-"} />}
        </div>
      )}
      {data && <div style={{ fontSize: 11, color: "#6B7280", marginTop: 6 }}>{data.disclaimer}</div>}
    </Section>
  );
}

function Block({ label, color, items }: { label: string; color: string; items: string[] }) {
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color }}>{label}</div>
      {items.map((e) => (
        <div key={e} style={{ fontSize: 11, color: "#4B5563" }}>
          · {e}
        </div>
      ))}
    </div>
  );
}
