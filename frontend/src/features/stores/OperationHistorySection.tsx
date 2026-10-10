import { Notice, Section, SourceNote } from "../../components/Notice";
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

/** '매장 운영이력' — 인허가 기준 업력·영업 상태·인증/지정. 연결이 불확실하면 값을 채우지 않고 상태만 보여준다. */
export function OperationHistorySection({ history }: { history: OperationHistory }) {
  const { link, license, certifications, sources } = history;
  return (
    <Section title="매장 운영이력" collapsible>
      {link && link.status !== "matched" && <Notice tone={LINK_TONE[link.status] ?? "muted"}>{link.message}</Notice>}

      {license && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <Card label={license.age_basis} value={license.age_label ?? "정보 없음"} sub={license.permit_date ? `인허가일 ${license.permit_date}` : undefined} />
          <Card label="영업 상태" value={license.state_name} sub={license.detail_state ?? undefined} />
          <Card label="인허가 업종" value={license.license_name} sub={license.uptae ?? undefined} />
          <Card
            label="같은 매장 추정 인허가"
            value={`${license.other_license_count}건 추가`}
            sub={license.duplicate_license_count ? `중복 등록 ${license.duplicate_license_count}건(1건으로 셈)` : undefined}
          />
        </div>
      )}
      {license && <div style={{ fontSize: 11, color: "#6B7280", marginTop: 6 }}>{license.age_caveat}</div>}

      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>인증·지정</div>
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
