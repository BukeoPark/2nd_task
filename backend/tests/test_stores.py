"""업종 트리·데이터 원천·매장 상세(운영이력)·주변 상권 분석 — 실제 파이프라인 산출물 기준."""
from __future__ import annotations

import pandas as pd
import pytest

from app.services import data_store


@pytest.fixture(scope="module")
def stores_links() -> pd.DataFrame:
    stores = data_store.load_parquet("stores.parquet")
    links = data_store.load_parquet("store_license_links.parquet")
    return stores.merge(links, on="bizesId", how="left")


def _pick(df: pd.DataFrame, scls: str | None = None, status: str | None = None) -> str:
    sel = df
    if scls:
        sel = sel.loc[sel["indsSclsCd"] == scls]
    if status:
        sel = sel.loc[sel["link_status"] == status]
    assert not sel.empty, f"검증용 매장 없음: {scls} {status}"
    return sel.sort_values("bizesId").iloc[0]["bizesId"]


def test_category_tree_exposes_full_official_taxonomy(client):
    body = client.get("/api/categories/tree").json()
    assert body["counts"] == {"lcls": 10, "mcls": 75, "scls": 247}
    smalls = [s for l in body["tree"] for m in l["children"] for s in m["children"]]
    assert len(smalls) == 247 and len({s["code"] for s in smalls}) == 247
    assert all(s["coverage"] in {"connected", "pending", "not_connected", "not_applicable"} for s in smalls)
    assert sum(s["store_count"] for s in smalls) == len(data_store.load_parquet("stores.parquet"))
    # 예시 업종만이 아니라 서로 다른 대분류의 소분류가 모두 들어있다
    codes = {s["code"] for s in smalls}
    assert {"I20101", "S20701", "R10307", "I10102", "P10501", "G20405", "M10301", "L10203"} <= codes


def test_sources_have_reference_dates(client):
    body = client.get("/api/sources").json()
    assert body["seoul_localdata"]["reference"]["collected_at"]
    assert body["sbiz_store"]["reference"]["stdrYm"]
    assert body["neis_academy"]["status"] == "pending"
    assert body["google_places_ui_kit"]["verification"] == "docs_only"


@pytest.mark.parametrize("scls,kind", [
    ("S20701", "미용"), ("R10307", "체육"), ("I10102", "숙박"), ("I20101", "음식"),
])
def test_licensed_industries_show_permit_based_age(client, stores_links, scls, kind):
    bid = _pick(stores_links, scls, "matched")
    oh = client.get(f"/api/stores/{bid}").json()["operation_history"]
    assert oh["coverage"]["status"] == "connected"
    assert oh["link"]["status"] == "matched"
    lic = oh["license"]
    assert lic["age_basis"] == "인허가 기준 업력"
    assert lic["permit_date"] and lic["age_label"].endswith("개월")
    assert "현재 운영자" in lic["age_caveat"]
    assert oh["sources"][0]["reference"]


def test_model_restaurant_designation_only_when_linked(client, stores_links):
    model = data_store.load_parquet("model_restaurants.parquet")
    designated = stores_links.loc[stores_links["license_id"].isin(model["license_id"]) & (stores_links["link_status"] == "matched")]
    oh = client.get(f"/api/stores/{designated.sort_values('bizesId').iloc[0]['bizesId']}").json()["operation_history"]
    assert oh["certifications"][0]["status"] == "designated"
    # 음식점인데 인허가 연결이 불확실하면 지정 여부는 '미확인'이지 '미지정'이 아니다
    bid = _pick(stores_links.loc[stores_links["indsLclsCd"] == "I2"], status="ambiguous")
    cert = client.get(f"/api/stores/{bid}").json()["operation_history"]["certifications"][0]
    assert cert["status"] == "unverified" and "미확인" in cert["label"]
    # 음식점이 아니면 '해당 없음'
    bid = _pick(stores_links, "S20701", "matched")
    assert client.get(f"/api/stores/{bid}").json()["operation_history"]["certifications"][0]["status"] == "not_applicable"
    # 휴게음식점 인허가와 연결된 매장도 지정 대상이 아니므로 '해당 없음'
    lic = data_store.load_parquet("licenses.parquet")
    snack = stores_links.loc[stores_links["license_id"].isin(lic.loc[lic["license_code"] == "072405", "license_id"])
                             & (stores_links["link_status"] == "matched")]
    cert = client.get(f"/api/stores/{snack.sort_values('bizesId').iloc[0]['bizesId']}").json()["operation_history"]["certifications"][0]
    assert cert["status"] == "not_applicable" and "휴게음식점" in cert["label"]


@pytest.mark.parametrize("status", ["needs_check", "ambiguous", "closed_only", "no_match"])
def test_uncertain_links_never_show_age(client, stores_links, status):
    bid = _pick(stores_links, status=status)
    oh = client.get(f"/api/stores/{bid}").json()["operation_history"]
    assert oh["link"]["status"] == status
    assert oh["license"] is None  # 업력·영업상태를 추정해서 채우지 않는다


def test_education_pending_and_retail_not_applicable(client, stores_links):
    edu = client.get(f"/api/stores/{_pick(stores_links, 'P10501')}").json()
    assert edu["operation_history"]["link"]["status"] == "pending"
    assert "연동 준비 중" in edu["operation_history"]["link"]["message"]
    retail = client.get(f"/api/stores/{_pick(stores_links, 'G20405')}").json()
    assert retail["operation_history"]["coverage"]["status"] == "not_applicable"
    assert retail["store"]["name"]  # 정보가 부족해도 기본정보는 제공
    near = client.get(f"/api/stores/{_pick(stores_links, 'G20405')}/nearby-analysis").json()
    assert near["status"] == "unavailable"


def test_nearby_analysis_defines_cohort(client, stores_links):
    body = client.get(f"/api/stores/{_pick(stores_links, 'S20701', 'matched')}/nearby-analysis").json()
    assert body["status"] == "ok" and body["radius_m"] == 500
    c = body["closure_cohort"]
    assert {"numerator", "denominator", "cohort_permit_from", "cohort_permit_to", "horizon_years"} <= c.keys()
    assert c["status"] in {"ok", "insufficient"}
    if c["status"] == "ok":
        assert c["rate"] == round(c["numerator"] / c["denominator"], 4)
    assert "신뢰도" in body["disclaimer"]
    assert all(isinstance(y["opened"], int) for y in body["trend"])


def test_lodging_without_close_dates_is_insufficient(client, stores_links):
    body = client.get(f"/api/stores/{_pick(stores_links, 'I10102', 'matched')}/nearby-analysis").json()
    if body["scope"]["license_names"] == ["숙박업"]:
        assert body["closure_cohort"]["status"] == "insufficient"
        assert all(y["closed"] is None for y in body["trend"])  # 0 이 아니라 '알 수 없음'
        assert any("폐업일자" in w for w in body["warnings"])


def test_unknown_store_404(client):
    for path in ("", "/nearby-analysis", "/google-place"):
        assert client.get(f"/api/stores/NOPE0000{path}").status_code == 404


def test_grid_counts_by_category(client):
    body = client.get("/api/grid-counts", params={"size_m": 250, "level": "scls", "code": "R10307"}).json()
    stores = data_store.load_parquet("stores.parquet")
    assert body["store_total"] == int((stores["indsSclsCd"] == "R10307").sum())
    assert client.get("/api/grid-counts", params={"size_m": 250, "level": "mcls", "code": "없는코드"}).status_code == 404
    assert client.get("/api/grid-counts", params={"size_m": 300, "level": "scls", "code": "R10307"}).status_code == 400
