"""입지 영향력 분석(/api/stores/{id}/location-influence) 테스트."""
from __future__ import annotations

import pytest

from app.services import data_store, location_influence


def _stores():
    stores = data_store.load_parquet("stores.parquet")
    cw = data_store.load_parquet("sales_industry_crosswalk.parquet")[["indsSclsCd", "svc_cd"]]
    st = data_store.load_parquet("store_trdar.parquet")[["bizesId", "trdar_cd"]]
    return stores.merge(cw, on="indsSclsCd", how="left").merge(st, on="bizesId", how="left")


def _in_sample_store() -> str:
    rows = data_store.load_parquet("location_model_rows.parquet")[["trdar_cd", "svc_cd"]]
    return _stores().merge(rows, on=["trdar_cd", "svc_cd"]).sort_values("bizesId").iloc[0]["bizesId"]


def test_response_shape_for_in_sample_food_store(client):
    bid = _in_sample_store()
    body = client.get(f"/api/stores/{bid}/location-influence", params={"radius_m": 500}).json()
    assert body["radius_m"] == 500 and body["radius_options"] == [250, 500, 1000]
    a = body["radius_metrics"]["anchors"]
    assert a["status"] == "ok" and {b["brand"] for b in a["brands"]} == {"starbucks", "daiso", "oliveyoung"}
    for b in a["brands"]:  # 반경이 넓을수록 점포 수는 줄지 않는다
        c = b["counts_by_radius"]
        assert c["250"] <= c["500"] <= c["1000"] and b["count"] == c["500"]
    comp = body["radius_metrics"]["competitors"]
    assert comp["same_category"]["count"] <= comp["same_large_category"]["count"] <= comp["all_stores"]["count"]
    area = body["area"]
    assert area["level"] == "trdar" and area["demand_type"] in {"업무형", "혼합형", "주거형"}
    assert 0 <= area["worker_share"] <= 100 and "rule" in area
    m = body["model"]
    assert m["status"] == "ok" and m["store_in_sample"] is True
    assert {f["key"] for f in m["factors"]} == {"workers", "residents", "has_subway", "comp_density", "anchor_500m"}
    assert m["cv"]["text"] and "caveats" in body and any("인과" in c for c in body["caveats"])


def test_factor_fields_are_consistent(client):
    m = client.get(f"/api/stores/{_in_sample_store()}/location-influence").json()["model"]
    for f in m["factors"]:
        assert f["pct_lo"] <= f["pct"] <= f["pct_hi"]
        assert f["significant"] == (f["pct_lo"] > 0 or f["pct_hi"] < 0)
        assert f["tendency"] == ("뚜렷한 관계 없음" if not f["significant"] else ("높은 경향" if f["direction"] == "positive" else "낮은 경향"))
        if f["binary"]:
            assert f["store_percentile"] is None and f["effect_unit"] == "없음→있음"
        else:
            assert 0 <= f["store_percentile"] <= 100 and f["effect_unit"] == "표준편차 1 증가"
    if not m["useful"]:  # 교차검증에서 기준 모델보다 나아지지 않으면 참고용 문구를 반드시 싣는다
        assert m["reliability_note"]


def test_radius_changes_counts_but_not_area(client):
    bid = _in_sample_store()
    a = client.get(f"/api/stores/{bid}/location-influence", params={"radius_m": 250}).json()
    b = client.get(f"/api/stores/{bid}/location-influence", params={"radius_m": 1000}).json()
    assert a["area"] == b["area"] and a["model"] == b["model"]
    assert a["radius_metrics"]["competitors"]["all_stores"]["count"] <= b["radius_metrics"]["competitors"]["all_stores"]["count"]


def test_store_outside_trdar_falls_back_to_dong_and_skips_store_values(client):
    outside = _stores()
    bid = outside.loc[outside["trdar_cd"].isna() & outside["svc_cd"].fillna("").str.startswith("CS1")].sort_values("bizesId").iloc[0]["bizesId"]
    body = client.get(f"/api/stores/{bid}/location-influence").json()
    assert body["area"]["level"] == "dong" and body["area"]["fallback_reason"]
    assert body["model"]["store_in_sample"] is False and body["model"]["not_in_sample_reason"]
    assert all(f["store_value"] is None and f["store_percentile"] is None for f in body["model"]["factors"])


def test_non_food_store_gets_coefficients_only(client):
    s = _stores()
    bid = s.loc[~s["svc_cd"].fillna("").str.startswith("CS1") & s["trdar_cd"].notna()].sort_values("bizesId").iloc[0]["bizesId"]
    m = client.get(f"/api/stores/{bid}/location-influence").json()["model"]
    assert m["store_in_sample"] is False and "음식 업종" in m["not_in_sample_reason"]


@pytest.mark.parametrize("radius", [0, 100, 300, 2000])
def test_rejects_unsupported_radius(client, radius):
    res = client.get(f"/api/stores/{_in_sample_store()}/location-influence", params={"radius_m": radius})
    assert res.status_code == 422 and "250" in res.json()["detail"]


def test_unknown_store_is_404(client):
    res = client.get("/api/stores/NO_SUCH_STORE/location-influence")
    assert res.status_code == 404 and "찾을 수 없습니다" in res.json()["detail"]


def test_missing_pipeline_output_returns_503(client, monkeypatch):
    def boom(name):
        raise data_store.DataNotReady("'data/processed/location_model.json' 가 없습니다. pipelines/ 파이프라인을 먼저 실행하세요.")
    monkeypatch.setattr(location_influence, "_load_model", lambda: boom("location_model.json"))
    res = client.get(f"/api/stores/{_in_sample_store()}/location-influence")
    assert res.status_code == 503 and "파이프라인" in res.json()["detail"]


def test_unit_pct_conversion_roundtrip():
    sd = 0.4
    per_sd = (2.718281828 ** 0.4 - 1) * 100  # 단위 계수 1.0 → 표준화 계수 0.4
    assert location_influence._per_unit_pct(per_sd, sd) == pytest.approx((2.718281828 - 1) * 100, abs=0.2)


def test_oliveyoung_radius_counts_use_store_coordinates():
    from app.services.area_character import oliveyoung_stores
    from app.services.bus_access import _haversine_m
    stores = data_store.load_parquet("stores.parquet")
    olive = oliveyoung_stores(stores)
    assert not olive.empty
    me = olive.iloc[0]
    # 앵커 계산 대상인 외식 매장 중 올리브영과 가장 가까운 매장을 검증한다.
    anchors = data_store.load_parquet("store_anchor.parquet")
    candidates = stores[stores.bizesId.isin(anchors.bizesId)].copy()
    distances = _haversine_m(float(me.lon), float(me.lat), candidates.lon.to_numpy(), candidates.lat.to_numpy())
    chosen = candidates.iloc[int(distances.argmin())]
    result = location_influence._anchor_metrics(chosen.bizesId, 500)
    row = next(b for b in result["brands"] if b["brand"] == "oliveyoung")
    expected = _haversine_m(float(chosen.lon), float(chosen.lat), olive.lon.to_numpy(), olive.lat.to_numpy())
    assert row["count"] == int((expected <= 500).sum()) > 0
    assert row["nearest_m"] == round(float(expected.min()))
