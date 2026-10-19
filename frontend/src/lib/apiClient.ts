/** 백엔드 `/api` 호출은 이 모듈을 통해서만 한다 — 컴포넌트에서 fetch 직접 호출 금지. */
import type { FacilityCountState, FacilityType } from "./facilityText";

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

/** 상권 매출 비교의 비교 단위(상권·행정동) 안 같은 업종 매장 — 지도에서 어느 매장들과 비교한 숫자인지 강조하는 데 쓴다. */
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

/** 지도 히트맵 — 상권 단위 점(중심점 + 값). 값이 없는 상권은 0 이 아니라 빠져 있다(missing). weight 는 상위 5% 값을 1 로 둔 비율. */
export interface FoodHeatResponse {
  metric: "flpop" | "resident" | "worker";
  level: "trdar";
  label: string;
  unit: string;
  quarter: string;
  source: string;
  basis: string;
  caveats: string[];
  count: number;
  missing: number;
  total_trdars: number;
  scale: { p50: number; p95: number; max: number };
  points: { code: string; name: string; type: string | null; lon: number; lat: number; value: number; weight: number }[];
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

export interface BusSlice {
  radius_m: number;
  count: number;
  count_state: "zero" | "incomplete_zero" | "lower_bound" | "ok";
  scope_complete: boolean;
  linked: number;
  unlinked: number;
  linked_ratio: number | null;
  usage_state: "no_stops" | "none_linked" | "all_linked" | "partial";
  boardings_observed: number | null;
  alightings_observed: number | null;
  unlinked_breakdown: { reason: string; label: string; count: number }[];
}

/** 버스 접근성(직선거리 반경). 'unavailable' 이면 자료 파일이 없어 확인 불가. */
export type BusAccess =
  | { status: "unavailable"; message: string; caveats?: string[] }
  | {
      status: "ok";
      radius_m: number;
      selected: BusSlice;
      by_radius: Record<string, BusSlice>;
      nearest: { distance_m: number; name: string; reliable: boolean } | null;
      scope: { complete: boolean; covered_radius_m: number; distance_to_pilot_m: number | null; extent: string; reason: string | null };
      usage_basis: { year: number; text: string };
      caveats: string[];
      source: { title: string; reference: string };
    };

/** 상권 유형 및 입지 특성(경계 기준) — 서버 area_character.py. 종합점수는 없다. */
export interface CharacterCell {
  value: number | null;
  note?: string;
  as_of?: string;
  source?: string;
  caution?: boolean;
  partial?: boolean;
}

export interface CharacterStation {
  name: string;
  lines: string;
  where: "inside" | "within_250m";
  distance_m: number;
  boardings: number | null;
  alightings: number | null;
  usage_state: "all_linked" | "partial" | "none_linked";
  lines_with_usage: number;
  lines_total: number;
  complete_2025: boolean;
  region: string;
  /** 같은 역이 함께 잡히는 같은 단위 수(2 이상이면 단위끼리 더하면 중복) */
  shared_units?: number;
}

export interface AreaCharacter {
  status: "ok";
  level: "dong" | "trdar";
  code: string;
  name: string;
  trdar_type: string | null;
  type: {
    kind: "traits" | "mixed" | "hold";
    headline: string;
    traits: { key: "business" | "residential" | "transit" | "commercial"; label: string; evidence: string[] }[];
    held: { key: string; reason: string }[];
    worker_share: number | null;
    demand_label?: "업무형" | "혼합형" | "주거형" | null;
    mixed_evidence?: string[];
    hold_reason?: string;
  };
  sections: {
    transit: {
      rail: {
        inside: CharacterStation[];
        within_250m: CharacterStation[];
        nearest_m: number | null;
        count: number;
        linked: number;
        usage_state: "no_stations" | "none_linked" | "partial" | "all_linked";
        boardings_observed: number | null;
        alightings_observed: number | null;
        year: number;
        basis: string;
      };
      bus: {
        count: number;
        per_km2: number | null;
        linked: number;
        linked_ratio: number | null;
        usage_state: "no_stops" | "none_linked" | "partial" | "all_linked";
        boardings_observed: number | null;
        alightings_observed: number | null;
        year: number;
        basis: string;
        caution?: string | null;
      };
      note: string;
    };
    demand: {
      workers: CharacterCell;
      residents: CharacterCell;
      worker_share_pct: number | null;
      demand_type: "업무형" | "혼합형" | "주거형" | null;
      base_ok: boolean;
      floating: { quarter: string; label: string; flpop: number | null; weekend_pct: number | null; slots: { label: string; pct: number | null }[]; lunch_pct: number | null; late_pct: number | null; lunch_rank: number | null; late_rank: number | null; yoy_pct: number | null } | null;
      note: string;
    };
    anchor: {
      starbucks: { inside: number; nearest_m: number | null; zone_share: CharacterCell };
      daiso: { inside: number; nearest_m: number | null; zone_share: CharacterCell };
      facilities: { total: CharacterCell; per_km2: number | null; reference_median: number | null };
      note: string;
    };
    competition: {
      scope: { sales_label: string; stores_label: string; differs: boolean; notice: string | null };
      stores: CharacterCell;
      density_per_km2: number | null;
      area_km2: number | null;
      small_area: boolean;
      change_2y: CharacterCell;
      open_rate_y: CharacterCell;
      close_rate_y: CharacterCell;
      reference_applies?: boolean;
      reference_density_p75: number | null;
      note: string;
    };
  };
  strengths: string[];
  cautions: string[];
  basis: {
    label: string;
    success_note?: string;
    relative_note?: string;
    data_notes?: string[];
    unit: string;
    rules: string[];
    reference: { units: number; store_density_p75: number | null; fac_density_median: number | null; transit_boardings_p75?: number | null; note: string };
    sources: { title: string; reference: string }[];
  };
}

export interface RailUsage {
  state: "all_linked" | "partial" | "none_linked";
  boardings: number | null;
  alightings: number | null;
  lines_with_usage: number;
  lines_total: number | null;
  months_observed: number | null;
  complete_2025: boolean;
  sources: string[];
  reason: "no_source_for_region" | "no_usage_row" | null;
}

export interface RailEntrance {
  exit_label: string;
  exit_no: string | null;
  lon: number;
  lat: number;
  distance_m: number;
}

export interface RailStation {
  complex_id: string;
  name: string;
  lines: string;
  operators: string;
  region: string;
  lon: number;
  lat: number;
  distance_m: number;
  basis: "entrance" | "center";
  center_distance_m: number;
  has_entrances: boolean;
  entrances: RailEntrance[];
  usage: RailUsage;
}

export interface RailSlice {
  radius_m: number;
  count: number;
  count_state: "zero" | "ok";
  stations_by_basis: { entrance: number; center: number };
  mixed_basis: boolean;
  entrances: number;
  entrance_scope_complete: boolean;
  center_inside_but_entrance_outside: number;
  linked: number;
  unlinked: number;
  linked_ratio: number | null;
  usage_state: "no_stations" | "none_linked" | "partial" | "all_linked";
  boardings_observed: number | null;
  alightings_observed: number | null;
  complete_2025_stations: number;
  partial_line_stations: number;
  no_source_region_stations: number;
}

/** 철도(지하철·도시철도) 접근성(직선거리 반경). 'unavailable' 이면 자료 파일이 없어 확인 불가. */
export type RailAccess =
  | { status: "unavailable"; message: string; caveats?: string[] }
  | {
      status: "ok";
      radius_m: number;
      selected: RailSlice;
      by_radius: Record<string, RailSlice>;
      stations: RailStation[];
      nearest_station: { name: string; lines: string; distance_m: number; basis: "entrance" | "center"; center_distance_m: number; in_radius: boolean } | null;
      nearest_entrance: { station_name: string | null; exit_label: string; exit_no: string | null; distance_m: number; source: string; in_radius: boolean } | null;
      inclusion_rule: string;
      /** 출입구 좌표 사용 여부 — enabled=false 면 모든 역사를 공식 역 중심점 거리로 판단한다(없으면 구버전 응답) */
      entrance_data?: { enabled: boolean; reason: string | null };
      scope: {
        entrance_scope_complete: boolean;
        distance_to_pilot_m: number | null;
        entrance_extent: string;
        location_extent: string;
        location_regions: { region: string; stations: number }[];
        usage_regions: string[];
      };
      usage_basis: { year: number | null; text: string; sources: string[]; periods: Record<string, [string | null, string | null]> };
      caveats: string[];
      source: { title: string; reference: string };
    };

/** 주요 집객시설 반경 분석(직선거리, 공식 자료·이용 권한 확인 시설만). 'unavailable' 이면 자료 파일이 없어 확인 불가. */
export interface FacilityTypeStat {
  type: FacilityType;
  label: string;
  count: number | null;
  count_state: FacilityCountState;
  nearest: { distance_m: number; name: string; display_name?: string } | null;
  reliable: boolean;
  incomplete: boolean;
  reason: string | null;
  by_subtype?: Record<string, number>;
  status_unknown?: number;
  source_names?: string[];
  reference_date?: { from: string; to: string } | null;
  coord_coverage?: { pilot_located: number; pilot_unlocated: number; pilot_coord_rate: number | null } | null;
  /** 경계 인접 구·시 주소인데 좌표가 없어 빠진 공식 시설 수(반경이 경계에 걸칠 때만) — 개수 상태를 바꾸지 않는 알림 */
  neighbor_unlocated?: number;
  /** 좌표 없는 오래된 인허가(5년 넘게 갱신 없음) 수와 반경 안 오래된 기록 수 — 개수 판단에서 빼고 알리기만 한다 */
  stale_unlocated?: number;
  stale_in_radius?: number;
}

export interface FacilityItem {
  facility_id: string;
  name: string;
  /** 화면 표시명(영화관은 운영사 법인명을 뗀 이름) — 공식 명칭은 name */
  display_name?: string;
  reference_stale?: boolean;
  type: FacilityType;
  subtype: string | null;
  lon: number;
  lat: number;
  distance_m: number;
  status: string;
  status_label: string;
  source_name: string | null;
  source_type: string;
  coordinate_source: string | null;
  reference_date: string | null;
  usage_permission_status: string;
  coverage_status: string;
  attribution: string | null;
}

export type FacilityAccess =
  | { status: "unavailable"; message: string; caveats?: string[] }
  | {
      status: "ok";
      radius_m: number;
      selected: { radius_m: number; extent_complete: boolean; by_type: Record<FacilityType, FacilityTypeStat> };
      facilities: FacilityItem[];
      /** 등록 구분이 '구분없음'이라 종류를 알 수 없는 공식 대규모점포(반경 안) — 개수에 넣지 않는다 */
      unclassified_retail?: { facility_id: string; name: string; distance_m: number; lon: number; lat: number; status_label: string; reference_date: string | null; registered_class: string; attribution: string | null }[];
      official_only: boolean;
      includes_unconfirmed: boolean;
      attributions: string[];
      caveats: string[];
      scope: { distance_to_pilot_m: number | null; boundary_distance_m: number | null; buffer_m: number };
    };

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
    bus: BusAccess;
    /** 새 필드 — 없을 수 있다(구버전 응답과 호환) */
    rail?: RailAccess;
    /** 새 필드 — 없을 수 있다(구버전 응답과 호환). 공식 자료·이용 권한 확인 시설만 담는다. */
    facilities?: FacilityAccess;
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
  getAreaCharacter: (level: "dong" | "trdar", code: string, svc: string | null, scls: string | null) => {
    const q = new URLSearchParams();
    if (svc) q.set("svc", svc);
    if (scls) q.set("scls", scls);
    return request<AreaCharacter>(`/api/food/units/${level}/${encodeURIComponent(code)}/character?${q}`);
  },
  getUnitOverview: (level: "dong" | "trdar", code: string, svc: string | null, scls: string | null) => {
    const q = new URLSearchParams();
    if (svc) q.set("svc", svc);
    if (scls) q.set("scls", scls);
    return request<UnitOverviewResponse>(`/api/food/units/${level}/${encodeURIComponent(code)}/overview?${q}`);
  },
  getFoodAnchors: () => request<FoodAnchorsResponse>("/api/food/anchors"),
  getFoodHeat: (metric: FoodHeatResponse["metric"]) => request<FoodHeatResponse>(`/api/food/heat?${new URLSearchParams({ metric })}`),
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
