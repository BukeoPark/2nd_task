import DISPLAY_NAMES from "./storeDisplayNames.json" with { type: "json" };
import { splitStoreName } from "./storeName.ts";
const names: Record<string, { name: string; branch: string | null }> = DISPLAY_NAMES;

/** Use the same audited names in lists, detail panels, search, map labels and reports.
 * Source data and cached CDN objects remain unchanged. */
export function normalizeStoreLabels<T>(value: T): T {
  if (Array.isArray(value)) return value.map(item => normalizeStoreLabels(item)) as T;
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  const result = Object.fromEntries(Object.entries(record).map(([key, item]) => [key, normalizeStoreLabels(item)]));
  if (typeof record.store_id === "string" && typeof record.name === "string") {
    const known = names[record.store_id];
    if ("branch" in record) {
      const display = known ?? splitStoreName(record.name, typeof record.branch === "string" ? record.branch : null);
      result.name = display.name; result.branch = display.branch;
    } else if (known) result.name = `${known.name}${known.branch ? ` ${known.branch}` : ""}`;
  }
  return result as T;
}
