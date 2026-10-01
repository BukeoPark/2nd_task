"""매출 개선 리포트 — 규칙 함수는 합성 데이터로, API 는 실제 산출물로 검증."""
from __future__ import annotations

import pandas as pd

from app.services import data_store
from app.services.improvement_report import build_recommendations

UNIT = {"level": "trdar", "label": "상권", "name": "테스트상권", "type": "골목상권", "peer_label": "파일럿 구 상권", "fallback_reason": None}


def _bm(**shares) -> dict:
    items = [{"key": k, "label": k, "dong": v, "pilot": None} for k, v in shares.items()]
    return {"svc_cd": "CS100001", "unit": UNIT, "composition": [{"group": "x", "items": items}],
            "per_store_yoy_pct": None, "trend": [], "floating": None}


def test_gap_against_top_group_becomes_recommendation():
    bm = _bm(share_t17_21=0.30, share_t11_14=0.40)
    top = {"mix": {"share_t17_21": 0.42, "share_t11_14": 0.41}}
    recs = build_recommendations(bm, top)
    assert [r["title"] for r in recs] == ["17~21시 매출 비중 늘리기"]
    assert "+12.0%p" in recs[0]["evidence"][0] and recs[0]["area"] == "영업시간"


def test_early_morning_is_never_recommended():
    recs = build_recommendations(_bm(share_t00_06=0.01), {"mix": {"share_t00_06": 0.20}})
    assert recs == []


def test_floating_population_strengthens_priority():
    bm = _bm(share_t17_21=0.30, share_age30=0.20)
    bm["floating"] = {"mix": [{"group": "시간대별", "items": [{"key": "share_t17_21", "flpop": 0.45, "sales": 0.30}]}]}
    recs = build_recommendations(bm, {"mix": {"share_t17_21": 0.37, "share_age30": 0.28}})
    assert recs[0]["title"].startswith("17~21시") and len(recs[0]["evidence"]) == 2


def test_declining_area_and_no_top_group():
    bm = _bm()
    bm["per_store_yoy_pct"] = -12.0
    bm["trend"] = [{"stores": s} for s in (10, 10, 11, 12, 14)]
    recs = build_recommendations(bm, None)
    assert recs[0]["area"] == "상권 흐름" and "10곳 → 14곳" in recs[0]["evidence"][1]
    assert "경쟁 점포" in recs[0]["suggestion"]


def test_extreme_decline_is_capped_and_flagged():
    bm = _bm(share_t17_21=0.30)
    bm["per_store_yoy_pct"] = -70.0
    bm["trend"] = [{"stores": s} for s in (46, 45, 44, 43, 42)]
    recs = build_recommendations(bm, {"mix": {"share_t17_21": 0.70}})
    flow = next(r for r in recs if r["area"] == "상권 흐름")
    assert flow["score"] == 30.0 and "데이터 확인 필요" in flow["evidence"][-1]
    assert "수요 자체가 줄었을" in flow["suggestion"] and "경쟁 점포" not in flow["suggestion"]
    assert recs[0]["area"] == "영업시간"  # 40%p 차이가 상한 걸린 하락 신호보다 앞선다


def test_report_api(client):
    stores = data_store.load_parquet("stores.parquet")
    st = data_store.load_parquet("store_trdar.parquet")
    bid = stores.loc[(stores["indsSclsCd"] == "I20101") & stores["bizesId"].isin(st["bizesId"])].sort_values("bizesId").iloc[0]["bizesId"]
    body = client.get(f"/api/stores/{bid}/improvement-report").json()
    assert body["status"] in {"ok", "no_data_in_dong"}
    if body["status"] == "ok":
        assert len(body["recommendations"]) <= 5 and "보장하지 않습니다" in body["disclaimer"]
        assert all(r["evidence"] and r["suggestion"] for r in body["recommendations"])
    no_match = data_store.load_parquet("sales_industry_crosswalk.parquet")
    code = no_match.loc[no_match["status"] == "no_match", "indsSclsCd"].iloc[0]
    bid2 = stores.loc[stores["indsSclsCd"] == code].sort_values("bizesId").iloc[0]["bizesId"]
    assert client.get(f"/api/stores/{bid2}/improvement-report").json()["status"] == "no_match"
    assert client.get("/api/stores/NOPE0000/improvement-report").status_code == 404
