"""'주변 상권 분석' — 선택 매장과 같은 업종 범위의 인허가 이력으로 개폐업 추이·영업 지속 지표를 낸다.

범위
  - 공간: 매장 좌표 중심 반경 radius_m(기본 500m — 경쟁업체 조회와 같은 기준). 좌표 없는 인허가는 판정 불가로 따로 센다.
  - 업종: 매장이 인허가와 연결됐으면 그 인허가의 원천 코드+업태, 아니면 업종 대응표의 원천 코드(+업태).
  - 집계 단위: 인허가 1건. 상호·주소·인허가일이 같은 중복 인허가(dup_group)는 1건으로 센다.

지표 정의 (분자·분모·관찰기간을 응답에 그대로 싣는다)
  3년 내 폐업 비율 = 분모 중 인허가일로부터 3년 이내에 폐업일자가 있는 인허가 수 / 분모
  분모 = 인허가일이 [기준일-13년, 기준일-3년] 인 인허가 — 모두 3년 관찰기간이 확보된 집단
         (취소·말소·제외 상태, 폐업인데 폐업일자 없음, 폐업일<인허가일 인 건은 종료 시점을 알 수 없어 제외하고 건수를 보고)
  분모가 MIN_COHORT 미만이거나 원천이 폐업일자를 제공하지 않으면 '분석 자료 부족'.

해석 한계: 상권 전체의 과거 통계이며 특정 매장의 폐업 가능성이나 신뢰도가 아니다.
'최근 N년 폐업 수 ÷ 전체 과거 등록 수' 같은 관찰기간이 섞인 비율은 쓰지 않는다.
최신 매장 목록(상가업소)에서 사라진 사실만으로 폐업을 판단하지 않는다 — 폐업은 인허가 원천의 폐업 상태·일자만 쓴다.
"""
from __future__ import annotations

from datetime import date
from functools import lru_cache

import numpy as np
import pandas as pd
from shapely.geometry import Point, shape
from shapely.ops import unary_union
from shapely.prepared import prep

from app.services import data_store, place_matching, store_profile, taxonomy

HORIZON_YEARS = 3
COHORT_SPAN_YEARS = 10
TREND_YEARS = 10
MIN_COHORT = 20
ACTIVE = {"active", "suspended"}
UNKNOWN_END = {"cancelled", "removed", "other"}
DISCLAIMER = "주변 같은 업종 인허가의 과거 통계입니다. 이 매장의 폐업 가능성이나 신뢰도를 뜻하지 않습니다."


@lru_cache(maxsize=1)
def _pilot_area():
    gj = data_store.load_json("regions.geojson")
    return prep(unary_union([shape(f["geometry"]) for f in gj["features"]]))


def _circle_inside_pilot(lon: float, lat: float, radius_m: float) -> bool:
    area = _pilot_area()
    dlat = radius_m / 111_320
    dlon = radius_m / (111_320 * np.cos(np.radians(lat)))
    pts = [Point(lon + dlon * np.cos(a), lat + dlat * np.sin(a)) for a in np.linspace(0, 2 * np.pi, 24, endpoint=False)]
    return all(area.contains(p) for p in pts)


def _years_before(d: date, years: int) -> pd.Timestamp:
    return pd.Timestamp(d) - pd.DateOffset(years=years)


def cohort_close_rate(df: pd.DataFrame, as_of: date, horizon_years: int = HORIZON_YEARS,
                      span_years: int = COHORT_SPAN_YEARS, min_n: int = MIN_COHORT) -> dict:
    """관찰기간을 맞춘 'N년 내 폐업 비율'. df 는 permit_date/close_date/status_norm 열을 가진 인허가 표(중복 제거 후)."""
    latest_permit = _years_before(as_of, horizon_years)
    earliest_permit = _years_before(as_of, horizon_years + span_years)
    cohort = df.loc[df["permit_date"].between(earliest_permit, latest_permit)]
    excl_state = cohort["status_norm"].isin(UNKNOWN_END)
    excl_nodate = (cohort["status_norm"] == "closed") & cohort["close_date"].isna()
    excl_order = cohort["close_date"].notna() & (cohort["close_date"] < cohort["permit_date"])
    usable = cohort.loc[~(excl_state | excl_nodate | excl_order)]
    deadline = usable["permit_date"] + pd.DateOffset(years=horizon_years)
    closed_within = (usable["status_norm"] == "closed") & (usable["close_date"] <= deadline)
    n, k = len(usable), int(closed_within.sum())
    base = {
        "name": f"인허가 후 {horizon_years}년 이내 폐업 비율",
        "definition": f"인허가일이 {earliest_permit.date()}~{latest_permit.date()}인 인허가(모두 {horizon_years}년 관찰 가능) 중 "
                      f"인허가일로부터 {horizon_years}년 이내에 폐업일자가 있는 비율",
        "numerator": k, "denominator": n,
        "cohort_permit_from": earliest_permit.date().isoformat(), "cohort_permit_to": latest_permit.date().isoformat(),
        "horizon_years": horizon_years, "observation_end": as_of.isoformat(),
        "excluded": {"종료 사유·시점 불명(취소·말소·제외 등)": int(excl_state.sum()),
                     "폐업이나 폐업일자 없음": int(excl_nodate.sum()), "폐업일이 인허가일보다 이름": int(excl_order.sum())},
        "min_denominator": min_n,
    }
    if n < min_n:
        return {**base, "status": "insufficient", "rate": None, "message": f"분석 자료 부족 — 비교 표본 {n}건(최소 {min_n}건 필요)"}
    return {**base, "status": "ok", "rate": round(k / n, 4)}


def yearly_trend(df: pd.DataFrame, as_of: date, years: int = TREND_YEARS, closures_available: bool = True) -> list[dict]:
    out = []
    for y in range(as_of.year - years + 1, as_of.year + 1):
        opened = int((df["permit_date"].dt.year == y).sum())
        closed = int(((df["status_norm"] == "closed") & (df["close_date"].dt.year == y)).sum()) if closures_available else None
        out.append({"year": y, "opened": opened, "closed": closed, "partial_year": y == as_of.year})
    return out


def analyze(bizes_id: str, radius_m: float = 500.0) -> dict:
    store = store_profile.get_store(bizes_id)
    tax = taxonomy.scls_row(store["indsSclsCd"])
    base = {"radius_m": radius_m, "center": {"lon": store["lon"], "lat": store["lat"]}, "disclaimer": DISCLAIMER}
    if tax["status"] != "connected":
        return {**base, "status": "unavailable", "reason": store_profile.COVERAGE_MESSAGE[tax["status"]]}

    lic = data_store.load_parquet("licenses.parquet")
    links = data_store.load_parquet("store_license_links.parquet")
    link = links.loc[links["bizesId"] == bizes_id]
    scope_codes, scope_uptae, scope_basis = list(tax["license_codes"]), tax["uptae"], "업종 대응표"
    if not link.empty and link.iloc[0]["link_status"] == "matched":
        own = lic.loc[lic["license_id"] == link.iloc[0]["license_id"]].iloc[0]
        scope_codes = [own["license_code"]]
        scope_uptae = [own["uptae"]] if isinstance(own["uptae"], str) else None
        scope_basis = "연결된 인허가의 업종·업태"

    scope = lic.loc[lic["license_code"].isin(scope_codes)]
    if scope_uptae:
        scope = scope.loc[scope["uptae"].isin(scope_uptae)]
    scope = scope.drop_duplicates("dup_group")
    no_coord = int(scope["lon"].isna().sum())
    geo = scope.dropna(subset=["lon", "lat"])
    dist = place_matching.haversine_many(store["lon"], store["lat"], geo["lon"].to_numpy(), geo["lat"].to_numpy())
    within = geo.loc[dist <= radius_m] if len(geo) else geo

    src = data_store.load_parquet("license_sources.parquet")
    src = src.loc[src["license_code"].isin(scope_codes)]
    closures_available = bool(len(src)) and bool(src["has_close_date"].all())
    as_of = date.fromisoformat(src["collected_at"].min()) if len(src) else date.today()

    warnings = []
    if not _circle_inside_pilot(store["lon"], store["lat"], radius_m):
        warnings.append("반경 일부가 파일럿 지역(양천구·영등포구) 밖이라 인접 구의 인허가는 포함되지 않습니다.")
    if no_coord:
        warnings.append(f"파일럿 2개 구의 같은 업종 인허가 중 좌표가 없는 {no_coord:,}건은 반경 포함 여부를 알 수 없어 제외했습니다.")
    if not closures_available:
        warnings.append("이 업종의 인허가 원천은 폐업일자를 제공하지 않아 폐업 추이와 폐업 비율을 계산할 수 없습니다.")

    cohort = (cohort_close_rate(within, as_of) if closures_available else
              {"status": "insufficient", "rate": None, "message": "분석 자료 부족 — 원천이 폐업일자를 제공하지 않음"})
    return {
        **base,
        "status": "ok",
        "scope": {"basis": scope_basis, "license_names": sorted(scope["license_name"].unique().tolist()),
                  "uptae": scope_uptae},
        "as_of": as_of.isoformat(),
        "active_count": int(within["status_norm"].isin(ACTIVE).sum()),
        "total_records": len(within),
        "trend": yearly_trend(within, as_of, closures_available=closures_available),
        "closure_cohort": cohort,
        "warnings": warnings,
        "source": {"title": taxonomy.sources()["seoul_localdata"]["title"], "reference": f"{as_of.isoformat()} 수집"},
    }
