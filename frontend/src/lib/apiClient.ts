/** 백엔드 `/api` 호출은 이 모듈을 통해서만 한다 — 컴포넌트에서 fetch 직접 호출 금지. */

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000";

async function request<T>(path: string, method: "GET" | "POST" = "GET"): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, { method });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { detail?: string });
    throw new Error(body.detail ?? `API 오류 (HTTP ${res.status})`);
  }
  return res.json() as Promise<T>;
}

export interface GridRecord {
  grid_id: string;
  lon: number;
  lat: number;
  starbucks_nearest_m: number | null;
  starbucks_zone: boolean;
  daiso_nearest_m: number | null;
  daiso_zone: boolean;
  store_count: number;
  top_category: string | null;
}

export interface GridResponse {
  size_m: number;
  count: number;
  records: GridRecord[];
}

export interface RegionFeature {
  type: "Feature";
  geometry: { type: string; coordinates: unknown };
  properties: { adm_nm?: string; sggnm?: string; region_id?: number; boundary_source?: string };
}

export interface RegionsResponse {
  type: "FeatureCollection";
  features: RegionFeature[];
}

export interface DongMetric {
  region_id: number;
  adongCd: string;
  adongNm: string;
  sggnm: string;
  sales_total: number | null;
  sales_top_category: string | null;
  stores_total: number | null;
  change_index: string | null;
  change_index_nm: string | null;
  floating_pop: number | null;
  resident_pop: number | null;
  workplace_pop: number | null;
  sales_yoy_pct: number | null;
  sales_qoq_pct: number | null;
  yoy_base_quarter: string | null;
}

export interface DongMetricsResponse {
  count: number;
  records: DongMetric[];
}

export interface RebZone {
  reb_zone_nm: string;
  lon: number;
  lat: number;
  in_pilot_sigungu: boolean;
  vacancy_small_shop_pct: number | null;
  rent_small_shop: number | null;
  vacancy_midlarge_shop_pct: number | null;
  rent_midlarge_shop: number | null;
  vacancy_office_pct: number | null;
  rent_office: number | null;
}

export interface RebZonesResponse {
  count: number;
  records: RebZone[];
}

export interface DongTrendQuarter {
  quarter: string;
  change_index: string;
  change_index_nm: string;
}

export interface DongTrendRecord {
  region_id: number;
  adongCd: string;
  adongNm: string;
  sggnm: string;
  quarters: DongTrendQuarter[];
}

export interface DongTrendResponse {
  count: number;
  records: DongTrendRecord[];
}

export type CategoryLevel = "lcls" | "mcls" | "scls";
export type Coverage = "connected" | "pending" | "not_connected" | "not_applicable";

export interface CategorySmall {
  code: string;
  name: string;
  store_count: number;
  coverage: Coverage;
  coverage_label: string;
  license_names: string[];
  note: string;
}

export interface CategoryMiddle {
  code: string;
  name: string;
  store_count: number;
  children: CategorySmall[];
}

export interface CategoryLarge {
  code: string;
  name: string;
  store_count: number;
  children: CategoryMiddle[];
}

export interface CategoryTreeResponse {
  standard: { stdrDt?: string };
  counts: { lcls: number; mcls: number; scls: number };
  coverage: { status: Coverage; label: string; scls: number; stores: number }[];
  tree: CategoryLarge[];
}

export interface GridCountsResponse {
  size_m: number;
  level: CategoryLevel;
  code: string;
  store_total: number;
  counts: Record<string, number>;
}

export interface StoreListItem {
  store_id: string;
  name: string;
  branch: string | null;
  category: string;
  category_detail: string;
  category_code: string;
  address: string;
  distance_m: number;
}

export interface StoreListResponse {
  total_in_radius: number;
  total_matched: number;
  records: StoreListItem[];
}

export interface SourceRef {
  title: string;
  reference: string;
}

export interface StoreBasic {
  store_id: string;
  name: string;
  branch: string | null;
  category: { lcls: string; mcls: string; scls: string; scls_code: string };
  address: string | null;
  building: string | null;
  dong: string;
  sigungu: string;
  lon: number;
  lat: number;
  source: SourceRef;
}

export interface OperationHistory {
  coverage: { status: Coverage; label: string; license_names: string[]; note: string };
  link: { status: string; message: string; distance_m?: number | null } | null;
  license: {
    license_name: string;
    uptae: string | null;
    permit_date: string | null;
    age_basis: string;
    age_years: number | null;
    age_label: string | null;
    age_as_of: string;
    age_caveat: string;
    state_name: string;
    detail_state: string | null;
    other_license_count: number;
    duplicate_license_count: number;
  } | null;
  certifications: { name: string; status: "designated" | "unverified" | "not_applicable"; label: string; designated_date?: string | null; source: SourceRef }[];
  sources: SourceRef[];
}

export interface StoreDetailResponse {
  store: StoreBasic;
  operation_history: OperationHistory;
}

export interface ClosureCohort {
  status: "ok" | "insufficient";
  rate: number | null;
  message?: string;
  name?: string;
  definition?: string;
  numerator?: number;
  denominator?: number;
  horizon_years?: number;
  cohort_permit_from?: string;
  cohort_permit_to?: string;
  excluded?: Record<string, number>;
}

export interface NearbyAnalysisResponse {
  status: "ok" | "unavailable";
  reason?: string;
  radius_m: number;
  disclaimer: string;
  scope?: { basis: string; license_names: string[]; uptae: string[] | null };
  as_of?: string;
  active_count?: number;
  total_records?: number;
  trend?: { year: number; opened: number; closed: number | null; partial_year: boolean }[];
  closure_cohort?: ClosureCohort;
  warnings?: string[];
  source?: SourceRef;
}

export type GoogleLinkStatus = "not_configured" | "matched" | "needs_confirmation" | "no_candidate" | "rate_limited" | "api_error";

export interface GooglePlaceLinkResponse {
  status: GoogleLinkStatus;
  place_id: string | null;
  message: string;
  checked_at?: string;
  cached: boolean;
}

export interface SalesShareItem {
  key: string;
  label: string;
  dong: number | null;
  pilot: number | null;
}

export interface SalesBenchmarkResponse {
  status: "ok" | "no_match" | "no_sales" | "no_data_in_dong";
  message?: string;
  source: { title: string; reference?: string };
  caveats: string[];
  svc_nm?: string;
  crosswalk_note?: string | null;
  dong?: string;
  quarter_label?: string;
  per_store_month?: number | null;
  stores?: number;
  per_store_qoq_pct?: number | null;
  per_store_yoy_pct?: number | null;
  rank?: number;
  peer_count?: number;
  peers?: { dong: string; per_store_month: number | null; stores: number }[];
  trend?: { quarter: string; label: string; per_store_month: number | null; stores: number | null }[];
  composition?: { group: string; items: SalesShareItem[] }[];
  insights?: { group: string; label: string; gap_pctp: number; text: string }[];
  warnings?: string[];
}

export interface GoogleViewReservation {
  allowed: boolean;
  place_id?: string;
  reason?: "not_matched" | "quota";
  message?: string;
}

export const apiClient = {
  getGrid: (sizeM: number) => request<GridResponse>(`/api/grid?size_m=${sizeM}`),
  getRegions: () => request<RegionsResponse>("/api/regions"),
  getDongMetrics: () => request<DongMetricsResponse>("/api/dong-metrics"),
  getDongTrend: () => request<DongTrendResponse>("/api/dong-trend"),
  getRebZones: () => request<RebZonesResponse>("/api/reb-zones"),
  getCategoryTree: () => request<CategoryTreeResponse>("/api/categories/tree"),
  getGridCounts: (sizeM: number, level: CategoryLevel, code: string) =>
    request<GridCountsResponse>(`/api/grid-counts?size_m=${sizeM}&level=${level}&code=${encodeURIComponent(code)}`),
  getStoresNear: (lon: number, lat: number, radiusM: number, category: { level: CategoryLevel; code: string } | null, limit = 30) => {
    const q = new URLSearchParams({ lon: String(lon), lat: String(lat), radius_m: String(radiusM), limit: String(limit) });
    if (category) {
      q.set("category_level", category.level);
      q.set("category_code", category.code);
    }
    return request<StoreListResponse>(`/api/competitors?${q}`);
  },
  getSalesBenchmark: (storeId: string) =>
    request<SalesBenchmarkResponse>(`/api/stores/${encodeURIComponent(storeId)}/sales-benchmark`),
  getStore: (storeId: string) => request<StoreDetailResponse>(`/api/stores/${encodeURIComponent(storeId)}`),
  getNearbyAnalysis: (storeId: string, radiusM = 500) =>
    request<NearbyAnalysisResponse>(`/api/stores/${encodeURIComponent(storeId)}/nearby-analysis?radius_m=${radiusM}`),
  getGooglePlaceLink: (storeId: string) =>
    request<GooglePlaceLinkResponse>(`/api/stores/${encodeURIComponent(storeId)}/google-place`),
  reserveGoogleView: (storeId: string) =>
    request<GoogleViewReservation>(`/api/stores/${encodeURIComponent(storeId)}/google-place/view`, "POST"),
};
