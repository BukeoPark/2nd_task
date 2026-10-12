/** 백엔드 `/api` 호출은 이 모듈을 통해서만 한다 — 컴포넌트에서 fetch 직접 호출 금지. */

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000";

/** 서버가 거절한 요청(HTTP 상태 포함) — 4xx 는 같은 요청을 다시 해도 같은 결과라 재시도 대상이 아니다. */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, method: "GET" | "POST" = "GET"): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, { method });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { detail?: string });
    throw new ApiError(body.detail ?? `API 오류 (HTTP ${res.status})`, res.status);
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
  /** 값을 고른 분기 코드('202602' = 2026년 2분기). 값이 없어도 확인한 분기는 채워진다. */
  vacancy_small_shop_pct_quarter?: string | null;
  rent_small_shop_quarter?: string | null;
  vacancy_midlarge_shop_pct_quarter?: string | null;
  rent_midlarge_shop_quarter?: string | null;
  vacancy_office_pct_quarter?: string | null;
  rent_office_quarter?: string | null;
}

export interface RebZonesResponse {
  count: number;
  records: RebZone[];
  /** 지표 → 기준 분기('2026년 2분기'). 산출물에 분기가 없으면 null */
  quarters: Record<string, string | null>;
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
  /** 소속 행정동 코드와, 경계 안에 드는 서울시 상권(없으면 null) — 상권 상세로 이동하는 링크용 */
  adong_cd: string;
  trdar: { code: string; name: string; type: string; lon: number; lat: number } | null;
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
  /** 인허가 기록만으로 구분한 영업 상태 — 현장 영업 확인이 아니며 지도 검색 결과 유무로 판정하지 않는다 */
  business_status: {
    status: "licensed_open" | "licensed_closed" | "unconfirmed";
    label: string;
    basis: string;
    caveat: string;
    /** 인허가상 폐업 기록 확인일 때의 근거(폐업 인허가 ID·폐업일·근거 유형) */
    closure?: { license_id: string; license_ids: string[]; license_name: string; close_date: string | null; evidence: string; evidence_label: string };
  } | null;
  /** 자료 기준일 — 상가정보 기준월과 인허가 수집·갱신일(없으면 null) */
  data_dates: {
    store_info: { title: string; base: string | null; collected_at: string | null };
    license: { title: string; collected_at: string | null; source_updated: string | null } | null;
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

/** 반경 안 동일 소분류 점포(상가정보 기준) — 원본 수, 폐업 기록 확인 점포 제외 수, 참고 보정 수. 판정 자료가 없으면 제외·보정은 null */
export interface CompetitorSummary {
  basis: string;
  radius_m: number;
  raw_count: number;
  excluded_closed_count: number | null;
  adjusted_count: number | null;
  open_confirmed_count: number;
  unconfirmed_count: number;
  as_of: { store_info: string | null; license: string | null };
  caveat: string;
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
  competitors?: CompetitorSummary;
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

/** 비교 분기 대비 증감 한 칸 — 점포 10곳 미만은 값 없음(too_few), 10~19곳은 변동성 주의(caution), 비교 분기 자료가 없으면 no_compare */
export interface GrowthCell {
  value: number | null;
  status: "ok" | "caution" | "too_few" | "no_compare" | "missing";
  sample: number | null;
  message: string | null;
}

export interface GrowthPair {
  compare_quarter: string;
  compare_label: string;
  /** 총매출 증감(지도 상권분석과 같은 계산) */
  total_sales: GrowthCell;
  /** 점포당 평균매출 증감 — 총매출 증감과 다른 지표 */
  per_store: GrowthCell;
}

export interface SalesBenchmarkResponse {
  status: "ok" | "no_match" | "no_sales" | "no_data_in_dong";
  message?: string;
  source: { title: string; reference?: string };
  caveats: string[];
  svc_nm?: string;
  /** 이 매장의 세부 업종 — 서울시 매출은 svc_nm 업종 전체 기준이라 세부 업종만의 값이 아님 */
  scls_nm?: string;
  crosswalk_note?: string | null;
  unit?: { level: "trdar" | "dong"; label: string; code?: string; name: string; type: string | null; peer_label: string; fallback_reason: string | null };
  dong?: string;
  quarter_label?: string;
  per_store_month?: number | null;
  stores?: number;
  per_store_qoq_pct?: number | null;
  per_store_yoy_pct?: number | null;
  growth?: { yoy: GrowthPair; qoq: GrowthPair };
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

/** 동네 매출 비교의 비교 단위(상권·행정동) 안 같은 업종 매장 — 지도에서 어느 매장들과 비교한 숫자인지 강조하는 데 쓴다. */
export type PeerStoresResponse =
  | { status: "no_match" | "no_sales"; message: string; svc_nm?: string }
  | {
      status: "ok";
      svc_cd: string;
      svc_nm: string;
      unit: { level: "trdar" | "dong"; label: string; code: string; name: string; type: string | null; fallback_reason: string | null };
      count: number;
      store_ids: string[];
      /** 비교 단위 경계(GeoJSON geometry). 없으면 null */
      boundary: { type: string; coordinates: unknown } | null;
    };

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
export type ChurnStatus = "ok" | "partial" | "missing_values" | "short_period" | "too_small";

/** status 가 ok·partial 이 아니면 숫자 없이 message 만 온다 — 0건이 아니라 '자료 없음·관찰기간 부족·점포 적음'임을 말해 준다. */
export interface ChurnSummary {
  status: ChurnStatus;
  message: string | null;
  period: string;
  opened?: number;
  closed?: number;
  avg_stores?: number;
  open_rate?: number | null;
  close_rate?: number | null;
  peer_count?: number;
  peer_median_open?: number | null;
  peer_median_close?: number | null;
  caveat?: string;
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

/** 관측된 사실 / 가능한 해석(단정 아님) / 현장에서 확인할 사항을 나눈 점검 항목. */
export interface ImprovementRecommendation {
  area: string;
  title: string;
  observed: string[];
  interpretations: string[];
  checks: string[];
  score: number;
}

export interface PeerBasis {
  unit_type?: string | null;
  worker_share?: number;
  band?: number;
  peers: number;
  candidates?: number;
  text?: string;
  reason?: string;
}

export interface ImprovementReportResponse {
  status: "ok" | "no_match" | "no_sales" | "no_data_in_dong";
  message?: string;
  unit?: SalesBenchmarkResponse["unit"];
  svc_nm?: string;
  /** 이 매장의 세부 업종 — 서울시 매출은 svc_nm 업종 전체 기준이라 세부 업종만의 값이 아님 */
  scls_nm?: string;
  quarter_label?: string;
  title?: string;
  benchmark?: { per_store_month: number | null; rank: number; peer_count: number };
  peer_basis?: PeerBasis;
  top_group?: { count: number; peers: number; names: string[]; per_store_month_min: number; self_in_top: boolean } | null;
  /** 비교군이 부족하면 '분석 자료 부족 — …' */
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
    /** 이 지표가 적용된 업종 범위('커피-음료 전체 기준') — 값 바로 옆에 보인다. 수요·임대 행은 업종과 무관해 null */
    scope: string | null;
    basis?: string | null;
    cells: { value: number | null; note?: string; partial?: boolean; caution?: boolean }[];
  }[];
  scope: FoodScope;
  notes: string[];
}

export interface HourSlot {
  label: string;
  pct: number | null;
}

export interface OverviewTrdar {
  code: string;
  name: string;
  type: string;
  area_m2: number | null;
  lon: number;
  lat: number;
  overlap_pct: number;
}

/** 행정동·상권 종합분석 보조 자료 — 시계열·시간대·유동인구·겹치는 상권. 지표 값은 FoodCompareResponse 가 준다. */
export interface UnitOverviewResponse {
  level: "dong" | "trdar";
  code: string;
  name: string;
  type: string | null;
  scope: FoodScope;
  latest_quarter: string;
  trend: { quarter: string; label: string; sales_q: number | null; stores: number | null; per_store_month: number | null; used: number; total: number }[];
  trend_source: string;
  trend_scope: string;
  hours: { quarter: string; label: string; used: number; total: number; slots: HourSlot[] };
  floating: {
    quarter: string;
    label: string;
    flpop: number | null;
    yoy_pct: number | null;
    weekend_pct: number | null;
    slots: HourSlot[];
    trend: { quarter: string; label: string; flpop: number | null }[];
  } | null;
  trdars?: OverviewTrdar[];
  trdars_excluded?: number;
  trdars_basis?: string;
  area_m2?: number | null;
  adong_cd?: string;
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

export type DemandType = "업무형" | "혼합형" | "주거형";

export interface LocationFactor {
  key: string;
  label: string;
  unit: string;
  definition: string;
  source: string;
  /** 표준편차 1 증가당 점포당 추정매출 차이(%) — 0/1 요인은 아래 pct 가 '없음→있음' 차이 */
  pct_per_sd: number;
  pct: number;
  pct_lo: number;
  pct_hi: number;
  p: number;
  significant: boolean;
  direction: "positive" | "negative";
  tendency: "높은 경향" | "낮은 경향" | "뚜렷한 관계 없음";
  binary: boolean;
  effect_unit: string;
  vif: number | null;
  store_value: number | null;
  store_percentile: number | null;
}

export interface LocationInfluenceResponse {
  store: { store_id: string; name: string; category: string; lon: number; lat: number };
  radius_m: number;
  radius_options: number[];
  radius_metrics: {
    anchors: {
      status: "ok" | "no_data";
      message?: string;
      brands: { brand: AnchorBrand; label: string; nearest_m: number | null; count: number; counts_by_radius: Record<string, number> }[];
      note?: string;
    };
    competitors: {
      same_category: { label: string; level: string; count: number; nearest_m: number | null };
      same_large_category: { label: string; level: string; count: number };
      all_stores: { label: string; count: number };
      basis: string;
    };
  };
  area: {
    level: "trdar" | "dong";
    level_label: string;
    code: string;
    name: string;
    trdar_type: string | null;
    fallback_reason: string | null;
    type_counts: Record<string, number>;
    demand_type: DemandType | null;
    message?: string;
    basis?: string;
    worker_share?: number | null;
    workers?: number | null;
    residents?: number | null;
    has_subway?: boolean | null;
    rule?: string;
    time_pattern?: { quarter: string; items: { key: string; label: string; share: number | null; median: number | null }[]; note: string } | null;
  };
  model: {
    status: "ok" | "insufficient";
    message?: string;
    useful?: boolean;
    reliability_note?: string | null;
    rows?: number;
    clusters?: number;
    services?: number;
    cv?: { r2_full: number; r2_base: number; delta: number; folds: number; groups: number; text: string };
    high_vif?: string[];
    factors?: LocationFactor[];
    store_in_sample?: boolean;
    not_in_sample_reason?: string | null;
    service?: { svc_cd: string | null; peers: number };
  };
  caveats: string[];
  source: { title: string; reference: string };
}

export interface FoodCategoriesResponse {
  groups: { svc_cd: string; svc_nm: string; has_sales: boolean; store_count: number; details: { code: string; name: string; store_count: number }[] }[];
  other: { code: string; name: string; store_count: number }[];
  note: string;
}

export interface FoodScope {
  sales_label: string;
  stores_label: string;
  /** 점포 수 기준 업종과 매출 기준 업종이 다른지(세부 업종을 골랐을 때) */
  differs: boolean;
  notice: string | null;
  metric_scope?: string;
}

export interface FoodCoverage {
  used: number;
  total: number;
  excluded_sales_share: number | null;
  /** 매출 증감률 계산에 쓴 비교 점포 수, 그리고 10~19곳이라 변동성 주의가 필요한지 */
  sample?: number;
  caution?: boolean;
}

export type FoodReason = "no_rows" | "missing_inputs" | "zero_stores" | "too_few_stores" | "short_period" | "no_compare" | "no_stores";

export interface FoodBubble {
  code: string;
  name: string;
  type: string | null;
  lon: number;
  lat: number;
  size: number | null;
  value: number | null;
  /** 계산에 쓴 업종 집단/전체 — 일부만 썼으면 전체 평균으로 오해하지 않게 보여준다 */
  coverage: FoodCoverage | null;
  /** 값이 없을 때의 이유(0 이 아니라 자료 없음·점포 0·점포 적음 등) */
  reason: FoodReason | null;
}

export interface FoodBubblesResponse {
  level: FoodLevel;
  quarter: string;
  metric: FoodMetric;
  /** 이 결과가 조회된 업종 조건 — 조건이 바뀐 뒤 이전 결과가 보이는지 가려내는 데 쓴다 */
  svc: string | null;
  scls: string | null;
  label: string;
  kind: "count" | "money" | "growth" | "rate";
  unit: string;
  size_source: string;
  metric_source: string | null;
  /** 여러 분기를 보는 지표(점포 수 증감·변동성)의 기간. 한 분기 지표는 null */
  period: string | null;
  /** 지표 값의 기준(기간·기준월·분기) — 범례·요약 패널은 이 값만 쓴다 */
  as_of: string;
  /** 지표 계산 기준 한 줄 */
  basis: string;
  scope: FoodScope & { metric_scope: string };
  reasons: Record<FoodReason, string>;
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

/** 화면 범위 안 매장 점 — svc/scls 는 이 결과가 어떤 업종 조건으로 조회됐는지(조건이 바뀐 뒤 이전 결과인지 가려내는 데 쓴다) */
export interface FoodStoresResponse {
  svc: string | null;
  scls: string | null;
  total: number;
  truncated: boolean;
  stores: FoodStorePoint[];
}

export type UnitStoreSort = "distance" | "name";

export interface FoodUnitStoresResponse {
  level: FoodLevel;
  code: string;
  name: string;
  sort: UnitStoreSort;
  /** 조건에 맞는 전체 매장 수(버블 점포 수와 같은 기준) */
  total: number;
  offset: number;
  returned: number;
  has_more: boolean;
  /** 이어 받을 시작 위치. 더 없으면 null */
  next_offset: number | null;
  records: FoodUnitStore[];
}

export type SearchKind = "station" | "trdar" | "dong" | "address" | "store";

export interface SearchResult {
  kind: SearchKind;
  name: string;
  subtitle: string;
  lon: number;
  lat: number;
  level?: FoodLevel;
  code?: string;
  store_id?: string;
}

export interface SearchResponse {
  query: string;
  too_short: boolean;
  min_chars: number;
  results: SearchResult[];
  counts: Partial<Record<SearchKind, number>>;
  note?: string;
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
  getPeerStores: (storeId: string) => request<PeerStoresResponse>(`/api/stores/${encodeURIComponent(storeId)}/peer-stores`),
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
    return request<FoodStoresResponse>(`/api/food/stores?${q}`);
  },
  searchPlaces: (query: string) => request<SearchResponse>(`/api/search?${new URLSearchParams({ q: query })}`),
  getFoodUnitStores: (level: FoodLevel, code: string, svc: string | null, scls: string | null, offset = 0, sort: UnitStoreSort = "distance", limit = 50) => {
    const q = new URLSearchParams({ limit: String(limit), offset: String(offset), sort });
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
  getUnitOverview: (level: "dong" | "trdar", code: string, svc: string | null, scls: string | null) => {
    const q = new URLSearchParams();
    if (svc) q.set("svc", svc);
    if (scls) q.set("scls", scls);
    return request<UnitOverviewResponse>(`/api/food/units/${level}/${encodeURIComponent(code)}/overview?${q}`);
  },
  getFoodAnchors: () => request<FoodAnchorsResponse>("/api/food/anchors"),
  getStoreAnchors: (storeId: string) => request<StoreAnchorsResponse>(`/api/stores/${encodeURIComponent(storeId)}/anchors`),
  getStore: (storeId: string) => request<StoreDetailResponse>(`/api/stores/${encodeURIComponent(storeId)}`),
  getNearbyAnalysis: (storeId: string, radiusM = 500) =>
    request<NearbyAnalysisResponse>(`/api/stores/${encodeURIComponent(storeId)}/nearby-analysis?radius_m=${radiusM}`),
  getLocationInfluence: (storeId: string, radiusM = 500) =>
    request<LocationInfluenceResponse>(`/api/stores/${encodeURIComponent(storeId)}/location-influence?radius_m=${radiusM}`),
  getGooglePlaceLink: (storeId: string) =>
    request<GooglePlaceLinkResponse>(`/api/stores/${encodeURIComponent(storeId)}/google-place`),
  reserveGoogleView: (storeId: string) =>
    request<GoogleViewReservation>(`/api/stores/${encodeURIComponent(storeId)}/google-place/view`, "POST"),
};
