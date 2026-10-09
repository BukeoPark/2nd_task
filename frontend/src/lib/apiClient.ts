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

export interface RegionFeature {
  type: "Feature";
  geometry: { type: string; coordinates: unknown };
  properties: { adm_nm?: string; sggnm?: string; region_id?: number; boundary_source?: string };
}

export interface RegionsResponse {
  type: "FeatureCollection";
  features: RegionFeature[];
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

type Coverage = "connected" | "pending" | "not_connected" | "not_applicable";

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

export interface FloatingComparison {
  flpop: number | null;
  flpop_yoy_pct: number | null;
  sales_per_10k: number | null;
  rank: number;
  peer_count: number;
  pilot_median_per_10k: number | null;
  mix: { group: string; items: { key: string; label: string; flpop: number | null; sales: number | null }[] }[];
  gaps: { label: string; gap_pctp: number; text: string }[];
  caveats: string[];
  source: { title: string; reference: string };
}

export interface SalesBenchmarkResponse {
  status: "ok" | "no_match" | "no_sales" | "no_data_in_dong";
  message?: string;
  source: { title: string; reference?: string };
  caveats: string[];
  svc_nm?: string;
  crosswalk_note?: string | null;
  unit?: { level: "trdar" | "dong"; label: string; name: string; type: string | null; peer_label: string; fallback_reason: string | null };
  dong?: string;
  quarter_label?: string;
  per_store_month?: number | null;
  stores?: number;
  per_store_qoq_pct?: number | null;
  per_store_yoy_pct?: number | null;
  rank?: number;
  peer_count?: number;
  peers?: { name: string; per_store_month: number | null; stores: number }[];
  trend?: { quarter: string; label: string; per_store_month: number | null; stores: number | null }[];
  composition?: { group: string; items: SalesShareItem[] }[];
  insights?: { group: string; label: string; gap_pctp: number; text: string }[];
  warnings?: string[];
  floating?: FloatingComparison | null;
  franchise_share?: { share: number | null; frc_stores: number; stores: number; peer_median: number | null } | null;
  churn?: ChurnSummary | null;
  hinterland?: HinterlandSummary | null;
}

export interface HinterlandPopulation {
  total: number;
  female_share: number | null;
  age_share: Record<"age10" | "age20" | "age30" | "age40" | "age50" | "age60", number | null>;
  quarter: string;
}

/** 상권(행정동) 안 직장인구·상주인구·집객시설 — 서울시 상권분석서비스. 배후지(상권 밖)는 포함하지 않는다. */
export interface HinterlandSummary {
  workplace: HinterlandPopulation | null;
  resident: (HinterlandPopulation & { households: number | null; apt_share: number | null }) | null;
  facility: { total: number; quarter: string; items: { key: string; label: string; count: number; peer_median: number | null }[] } | null;
  peer_median: { workplace: number | null; resident: number | null; facility: number | null };
  peer_label: string;
  caveat: string;
  source: SourceRef;
}

/** 최근 1년(4개 분기) 같은 업종 개업·폐업 — 비율은 4개 분기 합 ÷ 평균 점포 수. */
export interface ChurnSummary {
  period: string;
  opened: number;
  closed: number;
  avg_stores: number;
  open_rate: number | null;
  close_rate: number | null;
  peer_count: number;
  peer_median_open: number | null;
  peer_median_close: number | null;
  caveat: string;
}

export interface FranchiseBrand {
  brand: string;
  corp: string;
  match_type: string;
  industry: string;
  year: number;
  frcs_cnt: number | null;
  new_cnt: number | null;
  end_cnt: number | null;
  cancel_cnt: number | null;
  churn_rate: number | null;
  avg_sales_month: number | null;
  avg_sales_year_label: number | null;
  trend: { year: number; frcs_cnt: number | null; new_cnt: number | null; out_cnt: number | null }[];
}

export interface FranchiseResponse {
  brand: FranchiseBrand | null;
  seoul_avg: { mlsfc: string; year: number; avg_sales_month: number } | null;
  message: string | null;
  caveats: string[];
  source: { title: string; reference: string };
}

export interface ImprovementRecommendation {
  area: string;
  title: string;
  evidence: string[];
  suggestion: string;
  score: number;
}

export interface ImprovementReportResponse {
  status: "ok" | "no_match" | "no_sales" | "no_data_in_dong";
  message?: string;
  unit?: SalesBenchmarkResponse["unit"];
  svc_nm?: string;
  quarter_label?: string;
  benchmark?: { per_store_month: number | null; rank: number; peer_count: number };
  top_group?: { count: number; peers: number; names: string[]; per_store_month_min: number } | null;
  top_group_note?: string | null;
  recommendations?: ImprovementRecommendation[];
  disclaimer: string;
  source?: { title: string; reference?: string };
}

export type FoodLevel = "gu" | "dong" | "trdar";
export type FoodMetric =
  | "stores"
  | "per_store_month"
  | "sales_yoy_pct"
  | "sales_per_10k_flpop"
  | "open_rate"
  | "close_rate"
  | "frc_share"
  | "starbucks_zone_share"
  | "daiso_zone_share"
  | "stores_change_2y"
  | "stores_volatility";

export type AnchorBrand = "starbucks" | "daiso";

/** 입지 비교 — 행(지표) × 열(단위). 값은 그대로 보여주고 점수로 합치지 않는다. */
export interface FoodCompareResponse {
  level: FoodLevel;
  svc: string | null;
  scls: string | null;
  units: { code: string; name: string; type: string | null }[];
  rows: {
    group: string;
    key: string;
    label: string;
    kind: "money" | "growth" | "rate" | "count" | "people" | "rent";
    source: string;
    as_of: string | null;
    cells: { value: number | null; note?: string }[];
  }[];
  notes: string[];
}

export interface FoodAnchorsResponse {
  walk_m: number;
  brands: Record<AnchorBrand, string>;
  stores: { brand: AnchorBrand; name: string; branch: string | null; lon: number; lat: number }[];
  note: string;
}

export interface StoreAnchorsResponse {
  walk_m: number;
  brands: { brand: AnchorBrand; label: string; nearest_m: number | null; count_500m: number; in_zone: boolean }[];
  note: string;
}

export interface FoodCategoriesResponse {
  groups: { svc_cd: string; svc_nm: string; has_sales: boolean; store_count: number; details: { code: string; name: string; store_count: number }[] }[];
  other: { code: string; name: string; store_count: number }[];
  note: string;
}

export interface FoodBubble {
  code: string;
  name: string;
  type: string | null;
  lon: number;
  lat: number;
  size: number | null;
  value: number | null;
}

export interface FoodBubblesResponse {
  level: FoodLevel;
  quarter: string;
  metric: FoodMetric;
  label: string;
  kind: "count" | "money" | "growth" | "rate";
  unit: string;
  size_source: string;
  metric_source: string | null;
  /** 여러 분기를 보는 지표(점포 수 증감·변동성)의 기간. 한 분기 지표는 null */
  period: string | null;
  /** 지표 값의 기준(기간·기준월·분기) — 범례·요약 패널은 이 값만 쓴다 */
  as_of: string;
  bubbles: FoodBubble[];
}

export interface FoodStorePoint {
  store_id: string;
  name: string;
  branch: string | null;
  category: string;
  lon: number;
  lat: number;
}

export interface FoodUnitStore {
  store_id: string;
  name: string;
  branch: string | null;
  category_detail: string;
  distance_m: number;
}

export interface FoodUnitStoresResponse {
  level: FoodLevel;
  code: string;
  name: string;
  total: number;
  truncated: boolean;
  records: FoodUnitStore[];
}

export interface GoogleViewReservation {
  allowed: boolean;
  place_id?: string;
  reason?: "not_matched" | "quota";
  message?: string;
}

export const apiClient = {
  getRegions: () => request<RegionsResponse>("/api/regions"),
  getRebZones: () => request<RebZonesResponse>("/api/reb-zones"),
  getSalesBenchmark: (storeId: string) =>
    request<SalesBenchmarkResponse>(`/api/stores/${encodeURIComponent(storeId)}/sales-benchmark`),
  getImprovementReport: (storeId: string) =>
    request<ImprovementReportResponse>(`/api/stores/${encodeURIComponent(storeId)}/improvement-report`),
  getFranchise: (storeId: string) => request<FranchiseResponse>(`/api/stores/${encodeURIComponent(storeId)}/franchise`),
  getFoodCategories: () => request<FoodCategoriesResponse>("/api/food/categories"),
  getFoodBubbles: (level: FoodLevel, metric: FoodMetric, svc: string | null, scls: string | null) => {
    const q = new URLSearchParams({ level, metric });
    if (svc) q.set("svc", svc);
    if (scls) q.set("scls", scls);
    return request<FoodBubblesResponse>(`/api/food/bubbles?${q}`);
  },
  getFoodStores: (b: { minLon: number; minLat: number; maxLon: number; maxLat: number }, svc: string | null, scls: string | null) => {
    const q = new URLSearchParams({ min_lon: String(b.minLon), min_lat: String(b.minLat), max_lon: String(b.maxLon), max_lat: String(b.maxLat) });
    if (svc) q.set("svc", svc);
    if (scls) q.set("scls", scls);
    return request<{ total: number; truncated: boolean; stores: FoodStorePoint[] }>(`/api/food/stores?${q}`);
  },
  getFoodUnitStores: (level: FoodLevel, code: string, svc: string | null, scls: string | null, limit = 50) => {
    const q = new URLSearchParams({ limit: String(limit) });
    if (svc) q.set("svc", svc);
    if (scls) q.set("scls", scls);
    return request<FoodUnitStoresResponse>(`/api/food/units/${level}/${encodeURIComponent(code)}/stores?${q}`);
  },
  getFoodCompare: (level: FoodLevel, codes: string[], svc: string | null, scls: string | null) => {
    const q = new URLSearchParams({ level, codes: codes.join(",") });
    if (svc) q.set("svc", svc);
    if (scls) q.set("scls", scls);
    return request<FoodCompareResponse>(`/api/food/compare?${q}`);
  },
  getFoodAnchors: () => request<FoodAnchorsResponse>("/api/food/anchors"),
  getStoreAnchors: (storeId: string) => request<StoreAnchorsResponse>(`/api/stores/${encodeURIComponent(storeId)}/anchors`),
  getStore: (storeId: string) => request<StoreDetailResponse>(`/api/stores/${encodeURIComponent(storeId)}`),
  getNearbyAnalysis: (storeId: string, radiusM = 500) =>
    request<NearbyAnalysisResponse>(`/api/stores/${encodeURIComponent(storeId)}/nearby-analysis?radius_m=${radiusM}`),
  getGooglePlaceLink: (storeId: string) =>
    request<GooglePlaceLinkResponse>(`/api/stores/${encodeURIComponent(storeId)}/google-place`),
  reserveGoogleView: (storeId: string) =>
    request<GoogleViewReservation>(`/api/stores/${encodeURIComponent(storeId)}/google-place/view`, "POST"),
};
