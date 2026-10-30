import { supplementRadiusFacilities } from "./facilitySupplement.ts";
import type { FacilityAccess } from "./apiClient";
import DISPLAY_NAMES from "./storeDisplayNames.json" with { type: "json" };
import { splitStoreName } from "./storeName.ts";
const names: Record<string, { name: string; branch: string | null }> = DISPLAY_NAMES;

/** Use the same audited names in lists, detail panels, search, map labels and reports.
 * Source data and cached CDN objects remain unchanged. */
export function normalizeStoreLabels<T>(value: T): T {
  if (typeof value === "string") return value.replace(/호프·주점|호프-간이주점/g, "술집·주점").replace(/커피-음료|커피·음료/g, "카페·음료") as T;
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
  if (result.radius_metrics && result.store) {
    const metrics = result.radius_metrics as Record<string, unknown>;
    const store = result.store as {lon:number;lat:number};
    if (Number.isFinite(store.lon) && Number.isFinite(store.lat)) metrics.facilities = supplementRadiusFacilities(metrics.facilities as FacilityAccess|undefined, store);
  }
  return result as T;
}
