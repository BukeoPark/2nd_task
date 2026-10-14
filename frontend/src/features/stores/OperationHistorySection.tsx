import { Fold, Notice, Section, SourceNote } from "../../components/Notice";
import { ScopeTag } from "../../components/ScopeTag";
import type { OperationHistory } from "../../lib/apiClient";

const LINK_TONE: Record<string, "info" | "pending" | "warn" | "muted"> = {
  matched: "info",
  pending: "pending",
  not_connected: "muted",
  not_applicable: "muted",
  ambiguous: "warn",
  needs_check: "warn",
  closed_only: "warn",
  no_match: "muted",
  source_missing_gu: "muted",
};

/** 매장 상단 요약용 — 인허가 기준 업력·영업 상태. 연결이 불확실하면 값을 채우지 않고 상태만 보여준다. */
export function LicenseSummary({ history, part = "core" }: { history: OperationHistory; part?: "core" | "detail" }) {
  const { link, license } = history;
  return (
    <div>
      {part === "core" && !history.business_status && link && link.status !== "matched" && <Notice tone={LINK_TONE[link.status] ?? "muted"}>{link.message}</Notice>}

      {part === "core" && (
        <div style={{ display: "grid", gridTemplateColumns: license ? "1fr 1fr" : "1fr", gap: 8 }}>
          {license && <Card label={license.age_basis} value={license.age_label ?? "자료 없음"} sub={license.permit_date ? `인허가일 ${license.permit_date}` : undefined} />}
          <Card
            label="영업 상태(인허가 기준)"
            value={history.business_status?.label ?? "영업 여부 미확인"}
            sub={history.business_status?.basis ?? "인허가 자료로 확인할 수 없음"}
          />
        </div>
      )}
      {part === "core" && (
        <div style={{ fontSize: 11, color: "#6B7280", marginTop: 6 }}>인허가 자료 기준이며 실제 현장 영업 여부와 다를 수 있습니다.</div>
      )}
      {part === "core" && (
        <Fold title="영업 상태 기준·자료 기준일 보기">
          <div style={{ fontSize: 11, color: "#6B7280" }}>
            {history.business_status?.caveat ?? "인허가 자료 기준이며 실제 현장 영업 여부와 다를 수 있습니다."} {license?.age_caveat}
          </div>
          {history.data_dates && (
            <div style={{ fontSize: 11, color: "#6B7280", marginTop: 4 }}>
              자료 기준일 — 상가정보 {history.data_dates.store_info.base ?? "자료 없음"} 기준
              {" · "}
              {history.data_dates.license
                ? `인허가 ${history.data_dates.license.source_updated ?? "원천 갱신일 자료 없음"} 갱신(${history.data_dates.license.collected_at ?? "수집일 자료 없음"} 수집)`
                : "인허가 자료 연결 없음"}
              . 실시간 정보가 아닙니다.
            </div>
          )}
        </Fold>
      )}
      {license && part === "detail" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <Card label="인허가 업종" value={license.license_name} sub={license.uptae ?? undefined} />
          <Card
            label="같은 매장 추정 인허가"
            value={`${license.other_license_count}건 추가`}
            sub={license.duplicate_license_count ? `중복 등록 ${license.duplicate_license_count}건(1건으로 셈)` : undefined}
          />
        </div>
      )}
    </div>
  );
}

/** '인증·지정 이력' — 모범업소 등 지정 여부(매장 고유 정보). */
export function OperationHistorySection({ history }: { history: OperationHistory }) {
  const { certifications, sources } = history;
  return (
    <Section title="운영이력 — 인허가·인증·지정" scope={<ScopeTag kind="store" label="이 매장" />}>
      <LicenseSummary history={history} part="detail" />
      <div style={{ marginTop: 10 }}>
        {certifications.map((c) => (
          <div key={c.name} style={{ fontSize: 12 }}>
            <strong>{c.name}</strong>{" "}
            {c.status === "designated" ? `지정 (지정일 ${c.designated_date ?? "정보 없음"})` : c.label}
            <SourceNote title={c.source.title} reference={c.source.reference} />
          </div>
        ))}
      </div>
      {sources.map((s) => (
        <SourceNote key={s.title} title={s.title} reference={s.reference} />
      ))}
    </Section>
  );
}

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: "#F9FAFB", borderRadius: 8, padding: "8px 10px" }}>
      <div style={{ fontSize: 11, color: "#6b7280" }}>{label}</div>
      <div style={{ fontWeight: 600 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#6B7280" }}>{sub}</div>}
    </div>
  );
}
