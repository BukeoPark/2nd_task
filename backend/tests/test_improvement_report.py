"""상권 운영 점검 — 규칙 함수·비교군은 합성 데이터로, API 는 실제 산출물로 검증."""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from app.services import data_store, improvement_report
from app.services.improvement_report import build_recommendations

UNIT = {"level": "trdar", "label": "상권", "name": "테스트상권", "type": "골목상권", "peer_label": "파일럿 구 상권", "fallback_reason": None}
OVERCLAIM = ("구매 전환이 부족", "전환 부족", "매출로 덜 이어짐", "늘리세요", "개선 효과", "원인입니다", "때문입니다", "수익성이 좋", "손님을 놓치")  # 단정·인과·수익성 표현


def _bm(**shares) -> dict:
    items = [{"key": k, "label": k, "dong": v, "pilot": None} for k, v in shares.items()]
    return {"svc_cd": "CS100001", "unit": UNIT, "composition": [{"group": "x", "items": items}],
            "per_store_yoy_pct": None, "trend": [], "floating": None}


def _texts(rec: dict) -> str:
    return " ".join(rec["observed"] + rec["interpretations"] + rec["checks"] + [rec["title"]])


def test_every_item_separates_observation_interpretation_and_checks():
    bm = _bm(share_t17_21=0.30)
    bm["floating"] = {"rank": 9, "peer_count": 10, "mix": []}
    bm["franchise_share"] = {"share": 0.6, "frc_stores": 6, "stores": 10, "peer_median": 0.2}
    bm["per_store_yoy_pct"] = -12.0
    recs = build_recommendations(bm, {"mix": {"share_t17_21": 0.42}})
    assert {r["area"] for r in recs} >= {"영업시간", "상권 흐름", "유동인구", "경쟁"}
    for r in recs:
        assert r["observed"] and r["interpretations"] and r["checks"], r["title"]
        assert not any(w in _texts(r) for w in OVERCLAIM), (r["title"], _texts(r))
        assert "suggestion" not in r and "evidence" not in r   # 예전의 '→ ~하세요' 형식 제거


def test_gap_against_top_group_is_reported_as_a_difference_not_a_cause():
    bm = _bm(share_t17_21=0.30, share_t11_14=0.40)
    recs = build_recommendations(bm, {"mix": {"share_t17_21": 0.42, "share_t11_14": 0.41}})
    assert [r["title"] for r in recs] == ["17~21시 매출 비중이 비교 상권보다 낮음"]
    assert "12.0%p 낮음" in recs[0]["observed"][0] and recs[0]["area"] == "영업시간"
    assert any("상권 특성" in i for i in recs[0]["interpretations"])        # 비교의 한계를 해석에 명시


def test_early_morning_is_never_reported():
    assert build_recommendations(_bm(share_t00_06=0.01), {"mix": {"share_t00_06": 0.20}}) == []


def test_a_unit_already_in_the_top_group_gets_no_composition_items():
    recs = build_recommendations(_bm(share_t17_21=0.30), {"mix": {"share_t17_21": 0.60}, "self_in_top": True})
    assert recs == []


def test_floating_gap_is_stated_without_claiming_poor_conversion():
    bm = _bm(share_t17_21=0.30, share_age30=0.20)
    bm["floating"] = {"mix": [{"group": "시간대별", "items": [{"key": "share_t17_21", "flpop": 0.45, "sales": 0.30}]}]}
    recs = build_recommendations(bm, {"mix": {"share_t17_21": 0.37, "share_age30": 0.28}})
    first = recs[0]
    assert first["title"].startswith("17~21시") and len(first["observed"]) == 2
    assert "구매 전환율을 뜻하지 않음" in first["observed"][1]


def test_low_sales_per_floating_population_is_not_called_a_conversion_failure():
    bm = _bm()
    bm["floating"] = {"rank": 9, "peer_count": 10}
    rec = next(r for r in build_recommendations(bm, None) if r["area"] == "유동인구")
    assert "단정할 수 없습니다" in " ".join(rec["interpretations"])  # 부정문으로 한계를 밝히는 것은 허용
    assert not any(w in _texts(rec) for w in OVERCLAIM)


def test_declining_area_and_no_top_group():
    bm = _bm()
    bm["per_store_yoy_pct"] = -12.0
    bm["trend"] = [{"stores": s} for s in (10, 10, 11, 12, 14)]
    recs = build_recommendations(bm, None)
    assert recs[0]["area"] == "상권 흐름" and "10곳 → 14곳" in recs[0]["observed"][1]
    assert any("점포 수와 매출의 인과는 이 자료로 알 수 없습니다" in i for i in recs[0]["interpretations"])


def test_extreme_decline_is_capped_and_flagged():
    bm = _bm(share_t17_21=0.30)
    bm["per_store_yoy_pct"] = -70.0
    bm["trend"] = [{"stores": s} for s in (46, 45, 44, 43, 42)]
    recs = build_recommendations(bm, {"mix": {"share_t17_21": 0.70}})
    flow = next(r for r in recs if r["area"] == "상권 흐름")
    assert flow["score"] == 30.0 and "데이터 확인 필요" in flow["observed"][-1]
    assert any("상권 수요 자체가 줄었을" in i for i in flow["interpretations"]) and not any("경쟁 증가" in i for i in flow["interpretations"])
    assert recs[0]["area"] == "영업시간"  # 40%p 차이가 상한 걸린 하락 신호보다 앞선다


def test_franchise_rules():
    bm = _bm()
    bm["franchise_share"] = {"share": 0.6, "frc_stores": 6, "stores": 10, "peer_median": 0.2}
    indie = build_recommendations(bm, None)
    assert indie[0]["area"] == "경쟁" and "6곳(60%)" in indie[0]["observed"][0]
    brand = {"brand": "테스트커피", "year": 2025, "frcs_cnt": 100.0, "end_cnt": 9.0, "cancel_cnt": 3.0, "churn_rate": 0.12}
    owned = build_recommendations(bm, None, brand)
    assert [r["area"] for r in owned] == ["브랜드"]  # 가맹점에는 '개인 가게 차별화' 규칙을 내지 않는다
    assert "12곳(12.0%)" in owned[0]["observed"][0]


def _churn(**kw) -> dict:
    base = {"status": "ok", "period": "2025년 3분기~2026년 2분기", "opened": 1, "closed": 1, "avg_stores": 10.0, "open_rate": 0.1, "close_rate": 0.1,
            "peer_count": 20, "peer_median_open": 0.1, "peer_p75_open": 0.15, "peer_median_close": 0.1, "peer_p75_close": 0.15}
    return {**base, **kw}


def test_churn_rules():
    bm = _bm()
    bm["churn"] = _churn(closed=3, close_rate=0.3)
    recs = build_recommendations(bm, None)
    assert recs[0]["area"] == "개폐업" and "폐업" in recs[0]["title"] and "연 폐업률 30%" in recs[0]["observed"][1]
    assert recs[0]["score"] == 20.0  # 중앙값 대비 +20%p, 상한 20

    bm["churn"] = _churn(opened=3, open_rate=0.3)
    assert "새로 여는" in build_recommendations(bm, None)[0]["title"]

    bm["churn"] = _churn(opened=3, open_rate=0.3, closed=2, close_rate=0.2)
    both = build_recommendations(bm, None)
    assert len([r for r in both if r["area"] == "개폐업"]) == 1 and "모두 비교 단위보다 많음" in both[0]["title"]


def test_churn_rules_skip_small_normal_or_incomplete():
    bm = _bm()
    bm["churn"] = _churn(closed=1, close_rate=0.3)  # 1년 1곳은 우연일 수 있음
    assert build_recommendations(bm, None) == []
    bm["churn"] = _churn(closed=2, close_rate=0.14)  # 상위 25% 아님
    assert build_recommendations(bm, None) == []
    bm["churn"] = _churn(closed=3, close_rate=0.3, peer_count=5)  # 비교 단위 부족
    assert build_recommendations(bm, None) == []
    for status in ("missing_values", "short_period", "too_small", "partial"):  # 자료 없음·관찰기간 부족 등은 근거로 쓰지 않는다
        bm["churn"] = _churn(closed=3, close_rate=0.3, status=status)
        assert build_recommendations(bm, None) == [], status


def _hl(wrc_total=1000, rep_total=1000, age30=0.3, female=0.5, med_wrc=1000, med_rep=1000):
    block = {"total": 0, "female_share": female, "age_share": {"age10": 0.1, "age20": 0.2, "age30": age30, "age40": 0.2, "age50": 0.1, "age60": 0.1}}
    return {"workplace": {**block, "total": wrc_total}, "resident": {**block, "total": rep_total, "households": 500.0},
            "facility": {"total": 10, "items": [{"key": "fac_subway", "label": "지하철역", "count": 1, "peer_median": 0}, {"key": "fac_bus_stop", "label": "버스정류장", "count": 4, "peer_median": 6}]},
            "peer_median": {"workplace": med_wrc, "resident": med_rep, "facility": 5}, "peer_label": "파일럿 구 상권"}


def test_hinterland_context_is_an_observation_with_a_caveat():
    top = {"mix": {"share_age30": 0.30}}
    bm = _bm(share_age30=0.20)
    base = build_recommendations(bm, top)[0]
    bm["hinterland"] = _hl(age30=0.35)  # 직장·상주인구 30대 35% vs 매출 20%
    rec = build_recommendations(bm, top)[0]
    assert rec["score"] == base["score"] + 5.0
    assert any("직장·상주인구 2,000명 중 30대 35%" in e and "주변 인구 비중이 매출 비중보다 큼" in e for e in rec["observed"])
    assert any("인구가 있다고 같은 비율로 소비하는 것은 아닙니다" in i for i in rec["interpretations"])
    bm["hinterland"] = _hl(age30=0.10)  # 주변에 30대가 적으면 가산 없이 사실만 적는다
    rec = build_recommendations(bm, top)[0]
    assert rec["score"] == base["score"] and any("많지 않음" in e for e in rec["observed"])


def test_large_worker_population_is_context_for_lunch_not_a_conclusion():
    top = {"mix": {"share_t11_14": 0.45}}
    bm = _bm(share_t11_14=0.30)
    bm["hinterland"] = _hl(wrc_total=5000, med_wrc=1000)
    rec = build_recommendations(bm, top)[0]
    assert rec["score"] == 18.0 and any("직장인구 5,000명" in e for e in rec["observed"])
    assert any("인구가 곧 매출은 아님" in i for i in rec["interpretations"])
    bm["hinterland"] = _hl(wrc_total=1200, med_wrc=1000)  # 중앙값 1.5배 미만이면 맥락으로 쓰지 않음
    assert build_recommendations(bm, top)[0]["score"] == 15.0


def test_transit_facts_only_above_peer_median():
    bm = _bm()
    bm["floating"] = {"rank": 9, "peer_count": 10}
    bm["hinterland"] = _hl()
    rec = next(r for r in build_recommendations(bm, None) if r["area"] == "유동인구")
    assert rec["observed"][1] == "이 상권 안 지하철역 1곳(중앙값 0곳) — 교통시설이 비교 단위보다 많음"  # 버스 4곳 < 중앙값 6곳은 뺀다


# ── 비교군: 같은 업종 + 같은 상권 유형 + 비슷한 수요 구조, 부족하면 '분석 자료 부족' ─────────────────────────────

def _tables(rows: list[tuple]) -> dict[str, pd.DataFrame]:
    """rows: (코드, 유형, 직장인구, 상주인구, 점포당 분기 매출). 합성 산출물 이름 → 표."""
    sales, hl, areas = [], [], []
    shares = {k: 0.1 for g in improvement_report.sales_benchmark.GROUPS.values() for k in g}
    for code, typ, wrc, rep, per_store in rows:
        sales.append({"trdar_cd": code, "trdar_nm": f"상권{code}", "svc_cd": "CS100001", "quarter": "20262", "per_store_q": per_store, "stores": 5,
                      "sales_q": per_store * 5, **shares})
        hl.append({"trdar_cd": code, "wrc_total": wrc, "repop_total": rep})
        areas.append({"trdar_cd": code, "trdar_type": typ})
    return {"trdar_industry_sales.parquet": pd.DataFrame(sales), "trdar_hinterland.parquet": pd.DataFrame(hl), "trdar_areas.parquet": pd.DataFrame(areas)}


@pytest.fixture
def synthetic(monkeypatch):
    def use(rows):
        tables = _tables(rows)
        monkeypatch.setattr(improvement_report.data_store, "load_parquet", lambda name: tables[name])
    return use


def _rows_with_peers(n_same: int, n_other_type: int = 0, n_other_demand: int = 0) -> list[tuple]:
    me = [("ME", "골목상권", 300, 700, 100.0)]                                         # 직장인구 비중 30%
    same = [(f"S{i}", "골목상권", 300 + i, 700, 100.0 + i) for i in range(n_same)]        # 같은 유형·비슷한 수요 구조
    other_type = [(f"T{i}", "발달상권", 300, 700, 500.0 + i) for i in range(n_other_type)]  # 수요 구조는 같지만 유형이 다름
    other_demand = [(f"D{i}", "골목상권", 9000, 1000, 500.0 + i) for i in range(n_other_demand)]  # 유형은 같지만 직장 중심(90%)
    return me + same + other_type + other_demand


def test_peers_must_share_the_trade_area_type_and_a_similar_demand_structure(synthetic):
    synthetic(_rows_with_peers(10, n_other_type=6, n_other_demand=6))
    peers, basis = improvement_report.comparable_peers("trdar", "CS100001", "ME")
    assert peers is not None and set(peers["trdar_cd"]) == {f"S{i}" for i in range(10)}   # 다른 유형·다른 수요 구조는 섞이지 않음
    assert "ME" not in set(peers["trdar_cd"])                                           # 자기 자신 제외
    assert basis["unit_type"] == "골목상권" and basis["peers"] == 10 and "직장인구 비중" in basis["text"]


def test_too_few_comparable_units_is_reported_as_insufficient_even_if_other_types_are_many(synthetic):
    synthetic(_rows_with_peers(5, n_other_type=20, n_other_demand=20))   # 전체로는 45곳이지만 비슷한 곳은 5곳
    top, basis = improvement_report.top_group_mix("trdar", "CS100001", "ME")
    assert top is None and basis["peers"] == 5
    assert "최소 8곳" in basis["reason"] and "섞어 비교하면 오해" in basis["reason"]


def test_top_group_uses_only_the_comparable_peers(synthetic):
    synthetic(_rows_with_peers(12, n_other_type=6))
    top, basis = improvement_report.top_group_mix("trdar", "CS100001", "ME", own_per_store_q=100.0)
    assert top is not None and top["peers"] == 12 and top["count"] == 3
    assert set(top["names"]) <= {f"상권S{i}" for i in range(12)}        # 점포당 매출이 훨씬 높은 '다른 유형' 상권(500+)이 상위군에 들어오지 않음
    assert top["self_in_top"] is False
    top2, _ = improvement_report.top_group_mix("trdar", "CS100001", "ME", own_per_store_q=10_000.0)
    assert top2["self_in_top"] is True


def test_unit_without_demand_data_gets_no_comparison(synthetic):
    rows = _rows_with_peers(10)
    rows[0] = ("ME", "골목상권", np.nan, np.nan, 100.0)
    synthetic(rows)
    top, basis = improvement_report.top_group_mix("trdar", "CS100001", "ME")
    assert top is None and "직장·상주인구 자료가 없어" in basis["reason"]


def test_worker_share_handles_missing_and_zero():
    assert improvement_report.worker_share(300, 700) == pytest.approx(0.3)
    assert improvement_report.worker_share(None, 700) is None and improvement_report.worker_share(0, 0) is None
    assert improvement_report.worker_share(np.nan, 5) is None


# ── 실제 산출물 ─────────────────────────────────────────────────────────────────────────────────────────────

def test_report_api(client):
    stores = data_store.load_parquet("stores.parquet")
    st = data_store.load_parquet("store_trdar.parquet")
    bid = stores.loc[(stores["indsSclsCd"] == "I20101") & stores["bizesId"].isin(st["bizesId"])].sort_values("bizesId").iloc[0]["bizesId"]
    body = client.get(f"/api/stores/{bid}/improvement-report").json()
    assert body["status"] in {"ok", "no_data_in_dong"}
    if body["status"] == "ok":
        assert body["title"] == "상권 운영 점검" and len(body["recommendations"]) <= 5 and body["scls_nm"]
        assert "보장" not in body["disclaimer"] and "수익성이 좋다는 뜻도 아닙니다" in body["disclaimer"]
        assert body["peer_basis"]["peers"] >= 0 and (body["top_group"] is not None or "분석 자료 부족" in body["top_group_note"])
        assert all(r["observed"] and r["interpretations"] and r["checks"] for r in body["recommendations"])
    no_match = data_store.load_parquet("sales_industry_crosswalk.parquet")
    code = no_match.loc[no_match["status"] == "no_match", "indsSclsCd"].iloc[0]
    bid2 = stores.loc[stores["indsSclsCd"] == code].sort_values("bizesId").iloc[0]["bizesId"]
    assert client.get(f"/api/stores/{bid2}/improvement-report").json()["status"] == "no_match"
    assert client.get("/api/stores/NOPE0000/improvement-report").status_code == 404


def test_real_reports_never_use_overclaiming_wording_and_peers_share_type(client):
    stores = data_store.load_parquet("stores.parquet")
    sample = stores.loc[stores["indsLclsCd"] == "I2"].sort_values("bizesId").iloc[::700].head(40)
    seen_top = seen_insufficient = 0
    for sid in sample["bizesId"]:
        body = client.get(f"/api/stores/{sid}/improvement-report").json()
        if body["status"] != "ok":
            continue
        for r in body["recommendations"]:
            assert not any(w in _texts(r) for w in OVERCLAIM), _texts(r)
        if body["top_group"]:
            seen_top += 1
            assert body["peer_basis"]["peers"] >= improvement_report.MIN_PEERS
        else:
            seen_insufficient += 1
            assert body["top_group_note"].startswith("분석 자료 부족")
    assert seen_top + seen_insufficient > 0


def test_benchmark_churn_matches_raw_quarters(client):
    """API 의 최근 1년 개·폐업 수가 원 분기 자료 합과 같은지(실제 산출물)."""
    stores = data_store.load_parquet("stores.parquet")
    sample = stores.loc[stores["indsSclsCd"] == "I20101"].sort_values("bizesId").head(40)
    checked = 0
    for sid in sample["bizesId"]:
        bm = client.get(f"/api/stores/{sid}/sales-benchmark").json()
        ch = bm.get("churn")
        if bm.get("status") != "ok" or not ch or ch.get("status") != "ok":
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


def test_benchmark_hinterland_api(client):
    stores = data_store.load_parquet("stores.parquet")
    trdar = data_store.load_parquet("store_trdar.parquet")
    sid = stores.loc[stores["bizesId"].isin(trdar["bizesId"]) & (stores["indsSclsCd"] == "I21201")].sort_values("bizesId")["bizesId"].iloc[0]
    hl = client.get(f"/api/stores/{sid}/sales-benchmark").json()["hinterland"]
    assert hl and hl["workplace"]["total"] > 0
    assert abs(sum(hl["workplace"]["age_share"].values()) - 1) < 0.01
    assert "배후지는 포함하지 않습니다" in hl["caveat"]
