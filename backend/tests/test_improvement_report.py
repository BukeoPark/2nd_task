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


def test_franchise_rules():
    bm = _bm()
    bm["franchise_share"] = {"share": 0.6, "frc_stores": 6, "stores": 10, "peer_median": 0.2}
    indie = build_recommendations(bm, None)
    assert indie[0]["area"] == "경쟁" and "6곳(60%)" in indie[0]["evidence"][0]
    brand = {"brand": "테스트커피", "year": 2025, "frcs_cnt": 100.0, "end_cnt": 9.0, "cancel_cnt": 3.0, "churn_rate": 0.12}
    owned = build_recommendations(bm, None, brand)
    assert [r["area"] for r in owned] == ["브랜드"]  # 가맹점에는 '개인 가게 차별화' 규칙을 내지 않는다
    assert "12곳(12.0%)" in owned[0]["evidence"][0]


def _churn(**kw) -> dict:
    base = {"period": "2025년 3분기~2026년 2분기", "opened": 1, "closed": 1, "avg_stores": 10.0, "open_rate": 0.1, "close_rate": 0.1,
            "peer_count": 20, "peer_median_open": 0.1, "peer_p75_open": 0.15, "peer_median_close": 0.1, "peer_p75_close": 0.15}
    return {**base, **kw}


def test_churn_rules():
    bm = _bm()
    bm["churn"] = _churn(closed=3, close_rate=0.3)
    recs = build_recommendations(bm, None)
    assert recs[0]["area"] == "개폐업" and "폐업" in recs[0]["title"] and "연 폐업률 30%" in recs[0]["evidence"][1]
    assert recs[0]["score"] == 20.0  # 중앙값 대비 +20%p, 상한 20

    bm["churn"] = _churn(opened=3, open_rate=0.3)
    assert "새 경쟁" in build_recommendations(bm, None)[0]["title"]

    bm["churn"] = _churn(opened=3, open_rate=0.3, closed=2, close_rate=0.2)
    both = build_recommendations(bm, None)
    assert len([r for r in both if r["area"] == "개폐업"]) == 1 and "자주 바뀌는" in both[0]["title"]


def test_churn_rules_skip_small_or_normal():
    bm = _bm()
    bm["churn"] = _churn(closed=1, close_rate=0.3)  # 1년 1곳은 우연일 수 있음
    assert build_recommendations(bm, None) == []
    bm["churn"] = _churn(closed=2, close_rate=0.14)  # 상위 25% 아님
    assert build_recommendations(bm, None) == []
    bm["churn"] = _churn(closed=3, close_rate=0.3, peer_count=5)  # 비교 단위 부족
    assert build_recommendations(bm, None) == []


def test_benchmark_churn_matches_raw_quarters(client):
    """API 의 최근 1년 개·폐업 수가 원 분기 자료 합과 같은지(실제 산출물)."""
    stores = data_store.load_parquet("stores.parquet")
    sample = stores.loc[stores["indsSclsCd"] == "I20101"].sort_values("bizesId").head(40)
    checked = 0
    for sid in sample["bizesId"]:
        bm = client.get(f"/api/stores/{sid}/sales-benchmark").json()
        ch = bm.get("churn")
        if bm.get("status") != "ok" or not ch:
            continue
        lvl = bm["unit"]["level"]
        table, cd, nm = ("trdar_industry_sales.parquet", "trdar_cd", "trdar_nm") if lvl == "trdar" else ("dong_industry_sales.parquet", "adongCd", "adongNm")
        df = data_store.load_parquet(table)
        qs = sorted(df["quarter"].unique())[-4:]
        rows = df.loc[(df["svc_cd"] == bm["svc_cd"]) & (df[nm] == bm["unit"]["name"]) & df["quarter"].isin(qs)]
        assert ch["closed"] == int(rows["close_stores"].sum()) and ch["opened"] == int(rows["open_stores"].sum())
        checked += 1
        if checked >= 3:
            break
    assert checked >= 1
