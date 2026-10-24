"""상권분석 보고서 부가 자료 — 외식 업종별 비교표, 서울시 상권변화지표, 인허가 기준 영업 기간·생존."""
from __future__ import annotations

import pandas as pd
import pytest
from shapely.geometry import box

from app.services import area_report_extras as svc


def _first(client, level: str) -> str:
    return client.get("/api/food/bubbles", params={"level": level, "metric": "stores"}).json()["bubbles"][0]["code"]


def test_dong_extras_have_ten_food_rows_without_rank_or_score(client):
    code = _first(client, "dong")
    body = client.get(f"/api/food/units/dong/{code}/report-extras").json()
    ind = body["industry"]
    assert ind["status"] == "ok" and len(ind["rows"]) == 10
    assert all(r["svc_cd"].startswith("CS1") for r in ind["rows"])
    assert [r["svc_cd"] for r in ind["rows"]] == sorted(r["svc_cd"] for r in ind["rows"])   # 표준 순서이지 순위가 아니다
    assert not any("rank" in r or "score" in r for r in ind["rows"])
    assert ind["total"]["stores"] == pytest.approx(sum(r["stores"] for r in ind["rows"] if r["stores"] is not None))
    assert body["change_index"]["scope"] == "행정동"


def test_trdar_change_index_is_labeled_as_parent_dong(client):
    code = _first(client, "trdar")
    body = client.get(f"/api/food/units/trdar/{code}/report-extras").json()
    assert body["change_index"]["scope"] == "소속 행정동"


def test_selected_service_is_marked(client):
    code = _first(client, "dong")
    body = client.get(f"/api/food/units/dong/{code}/report-extras", params={"svc": "CS100001"}).json()
    assert [r["svc_cd"] for r in body["industry"]["rows"] if r["selected"]] == ["CS100001"]


def test_license_age_bands_add_up_to_active_count(client):
    code = _first(client, "dong")
    lic = client.get(f"/api/food/units/dong/{code}/report-extras").json()["license"]
    assert lic["status"] == "ok"
    assert sum(b["count"] for b in lic["active"]["bands"]) == lic["active"]["count"]
    assert 0 <= lic["no_coord_pct"] <= 100


def test_report_extras_rejects_bad_level_and_unknown_code(client):
    assert client.get("/api/food/units/gu/양천구/report-extras").status_code == 400
    assert client.get("/api/food/units/dong/0000/report-extras").status_code == 404


def test_days_in_quarter():
    assert svc._days_in_quarter("20262") == 91
    assert svc._days_in_quarter("20263") == 92


def test_small_store_counts_are_not_compared(monkeypatch):
    df = pd.DataFrame([
        {"quarter": "20262", "adongCd": "A", "svc_cd": "CS100001", "svc_nm": "한식음식점", "stores": 2.0, "sales_q": 3.0e8, "tx_count_q": 9000.0, "open_rate": 4.0, "close_rate": 4.0},
        {"quarter": "20262", "adongCd": "A", "svc_cd": "CS100002", "svc_nm": "중식음식점", "stores": 8.0, "sales_q": 9.0e8, "tx_count_q": 27000.0, "open_rate": 4.0, "close_rate": 6.0},
        {"quarter": "20262", "adongCd": "A", "svc_cd": "CS100003", "svc_nm": "일식음식점", "stores": 20.0, "sales_q": 1.8e9, "tx_count_q": 54000.0, "open_rate": 2.0, "close_rate": 4.0},
    ])
    monkeypatch.setattr(svc.data_store, "load_parquet", lambda name: df)
    rows = {r["svc_cd"]: r for r in svc.industry_comparison("dong", "A")["rows"]}
    assert rows["CS100001"]["per_store_month"] is None and rows["CS100001"]["close_rate"] is None and "3곳 미만" in rows["CS100001"]["note"]
    assert rows["CS100002"]["per_store_month"] == pytest.approx(9.0e8 / 8 / 3, abs=1) and "참고용" in rows["CS100002"]["note"]
    assert rows["CS100003"]["note"] is None and rows["CS100003"]["ticket"] == pytest.approx(1.8e9 / 54000, abs=1)
    assert rows["CS100003"]["daily_tx_per_store"] == pytest.approx(54000 / 20 / 91, abs=0.05)


def test_short_lived_closures_are_excluded_and_counted(monkeypatch):
    permit = pd.Timestamp("2020-01-01")
    rows = ([{"status_norm": "closed", "permit_date": permit, "close_date": permit + pd.Timedelta(days=10)} for _ in range(6)]
            + [{"status_norm": "closed", "permit_date": pd.Timestamp("2023-01-01"), "close_date": pd.Timestamp("2025-01-01")} for _ in range(6)]
            + [{"status_norm": "active", "permit_date": pd.Timestamp("2019-01-01"), "close_date": pd.NaT} for _ in range(6)])
    lic = pd.DataFrame(rows).assign(license_code="X", uptae="u", lon=0.5, lat=0.5)
    lic["dup_group"] = [f"g{i}" for i in range(len(lic))]
    src = pd.DataFrame([{"license_code": "X", "collected_at": "2026-09-23", "has_close_date": True}])
    monkeypatch.setattr(svc.data_store, "load_parquet", lambda name: {"licenses.parquet": lic, "license_sources.parquet": src}[name])
    monkeypatch.setattr(svc, "_license_scope", lambda s, c: ([(("X",), None)], "시험 업종"))
    monkeypatch.setattr(svc, "_boundary", lambda level, code: box(0, 0, 1, 1))
    out = svc.license_survival("dong", "A", None, None)
    assert out["short_lived_excluded"] == 6
    assert out["closed"]["count"] == 6 and out["closed"]["median_years"] == pytest.approx(2.0, abs=0.05)
    assert out["active"]["count"] == 6 and sum(b["count"] for b in out["active"]["bands"]) == 6


def test_missing_close_dates_turn_closure_metrics_into_no_data(monkeypatch):
    lic = pd.DataFrame([{"status_norm": "active", "permit_date": pd.Timestamp("2019-01-01"), "close_date": pd.NaT, "license_code": "X", "uptae": "u", "lon": 0.5, "lat": 0.5, "dup_group": f"g{i}"} for i in range(6)])
    src = pd.DataFrame([{"license_code": "X", "collected_at": "2026-09-23", "has_close_date": False}])
    monkeypatch.setattr(svc.data_store, "load_parquet", lambda name: {"licenses.parquet": lic, "license_sources.parquet": src}[name])
    monkeypatch.setattr(svc, "_license_scope", lambda s, c: ([(("X",), None)], "시험 업종"))
    monkeypatch.setattr(svc, "_boundary", lambda level, code: box(0, 0, 1, 1))
    out = svc.license_survival("dong", "A", None, None)
    assert out["closed"] is None and out["cohort"] is None and "폐업일자" in out["message"]
