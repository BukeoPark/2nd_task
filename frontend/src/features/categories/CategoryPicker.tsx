import type { CategoryLevel, CategoryTreeResponse } from "../../lib/apiClient";
import { useCategoryTree } from "./useCategoryTree";

export interface CategorySelection {
  level: CategoryLevel;
  code: string;
  name: string;
}

interface CategoryPickerProps {
  value: CategorySelection | null;
  onChange: (value: CategorySelection | null) => void;
  disabled?: boolean;
}

/** 공식 업종 분류(대·중·소) 연쇄 선택. 소분류에는 인허가 데이터 지원 범위를 함께 보여준다. */
export function CategoryPicker({ value, onChange, disabled }: CategoryPickerProps) {
  const { data } = useCategoryTree();
  const path = data ? resolvePath(data, value) : { lcls: null, mcls: null, scls: null };
  const lclsNode = data?.tree.find((l) => l.code === path.lcls);
  const mclsNode = lclsNode?.children.find((m) => m.code === path.mcls);

  return (
    <div style={{ display: "flex", gap: 6 }} title={disabled ? "업종 필터는 점포 밀도 모드에서만 적용됩니다" : undefined}>
      <Select
        disabled={disabled || !data}
        value={path.lcls ?? ""}
        placeholder={`업종 전체${data ? ` (대 ${data.counts.lcls}·중 ${data.counts.mcls}·소 ${data.counts.scls})` : ""}`}
        options={(data?.tree ?? []).map((l) => ({ value: l.code, label: `${l.name} (${l.store_count.toLocaleString()})` }))}
        onChange={(code) => {
          const n = data?.tree.find((l) => l.code === code);
          onChange(n ? { level: "lcls", code: n.code, name: n.name } : null);
        }}
      />
      {lclsNode && (
        <Select
          disabled={disabled}
          value={path.mcls ?? ""}
          placeholder={`${lclsNode.name} 전체`}
          options={lclsNode.children.map((m) => ({ value: m.code, label: `${m.name} (${m.store_count.toLocaleString()})` }))}
          onChange={(code) => {
            const n = lclsNode.children.find((m) => m.code === code);
            onChange(n ? { level: "mcls", code: n.code, name: n.name } : { level: "lcls", code: lclsNode.code, name: lclsNode.name });
          }}
        />
      )}
      {mclsNode && (
        <Select
          disabled={disabled}
          value={path.scls ?? ""}
          placeholder={`${mclsNode.name} 전체`}
          options={mclsNode.children.map((s) => ({
            value: s.code,
            label: `${s.name} (${s.store_count.toLocaleString()}) · ${s.coverage_label}`,
          }))}
          onChange={(code) => {
            const n = mclsNode.children.find((s) => s.code === code);
            onChange(n ? { level: "scls", code: n.code, name: n.name } : { level: "mcls", code: mclsNode.code, name: mclsNode.name });
          }}
        />
      )}
    </div>
  );
}

function resolvePath(data: CategoryTreeResponse, value: CategorySelection | null) {
  const none = { lcls: null as string | null, mcls: null as string | null, scls: null as string | null };
  if (!value) return none;
  for (const l of data.tree) {
    if (value.level === "lcls" && l.code === value.code) return { ...none, lcls: l.code };
    for (const m of l.children) {
      if (value.level === "mcls" && m.code === value.code) return { ...none, lcls: l.code, mcls: m.code };
      for (const s of m.children) {
        if (value.level === "scls" && s.code === value.code) return { lcls: l.code, mcls: m.code, scls: s.code };
      }
    }
  }
  return none;
}

function Select({
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      style={{
        maxWidth: 220,
        padding: "6px 10px",
        borderRadius: 6,
        border: "1px solid #e5e7eb",
        background: disabled ? "#f3f4f6" : "white",
        color: disabled ? "#9ca3af" : "#111827",
        fontSize: 13,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
