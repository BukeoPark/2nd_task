"""입지 영향력 분석 — 매장 주변을 숫자로 바꾸고(반경 지표), 상권의 수요 유형을 알리고, 입지 요인과 점포당 추정매출의 관계를 보여준다.

네 부분으로 나뉜다.
  1. 반경 지표(공간분석): 매장 좌표 기준 250m·500m·1km 안의 앵커 브랜드(스타벅스·다이소)와 같은 업종 점포 수·최근접 거리,
     버스정류장 수·최근접 거리·이용량 연결 정류장(bus_access — 같은 반경의 값만 응답한다),
     철도 역사 수·출입구·최근접·2025 일평균 승하차(rail_access — 같은 반경의 값만 응답한다).
     거리는 직선거리다(보행 네트워크 거리는 아님).
  2. 수요 유형: 상권(없으면 행정동)의 직장인구 비중으로 업무형·혼합형·주거형. 기준은 pipelines 의 build_location_model 이
     location_features.parquet 에 기록해 둔 값을 읽는다(기준값은 location_model.json 의 thresholds).
  3. 입지 요인 모델: 상권×음식 업종의 점포당 추정매출을 직장인구·상주인구·지하철역 유무·같은 업종 점포 밀도·앵커 노출로 설명한 회귀의
     계수. 이 매장의 상권이 그 요인에서 같은 업종 상권 중 어디쯤인지(백분위)를 함께 보여준다.
  4. 해석 한계: 상관이지 인과가 아니고, 상권·업종 평균을 설명할 뿐 이 매장의 매출 예측이 아니다. 표본이 작아(파일럿 두 구) 계수 구간이 넓다.
     행정동 단위 교차검증에서 요인이 업종만 넣은 모델보다 나아지지 않으면(useful=false) 화면은 '참고용'으로 낮춰 표시한다.

backend 는 pipelines/ 를 import 하지 않는다 — 모델 계수·특성표는 data/processed 의 산출물만 읽는다.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from app.services import competitors as competitors_service
from app.services import bus_access, data_store, food_map, rail_access, store_churn, store_profile

RADII_M = (250, 500, 1000)
DEFAULT_RADIUS_M = 500
FOOD_SVC_PREFIX = "CS1"
BINARY = {"has_subway"}
TYPE_BASIS = {
    "업무형": "직장인구가 상주인구보다 훨씬 많은 낮 수요 중심 상권",
    "혼합형": "직장인구와 상주인구가 섞여 있는 상권",
    "주거형": "상주인구가 직장인구보다 훨씬 많은 생활 수요 중심 상권",
}
CAVEATS = [
    "상관관계이며 인과가 아닙니다. 직장인구가 많아서 매출이 높다고 단정할 수 없습니다.",
    "상권·업종 점포들의 평균을 설명하는 통계이고, 이 매장의 매출을 예측하지 않습니다.",
    "거리는 직선거리입니다. 큰 도로·철도·하천 때문에 실제 도보 거리는 더 길 수 있습니다.",
    "지하철역은 상권 영역 안에 있는지(있음/없음)만 씁니다. 역 좌표 자료가 없어 역까지의 거리는 계산하지 않았습니다.",
    "서울시 매출은 점포당 평균이라 매출이 큰 점포가 평균을 끌어올릴 수 있습니다.",
    "분석 지역이 서울 양천구·영등포구 상권뿐이라 표본이 작습니다. 다른 지역에는 그대로 적용할 수 없습니다.",
]
MODEL_NOT_USEFUL = ("행정동 단위 교차검증에서 입지 요인이 업종만 넣은 기준 모델보다 나아지지 않았습니다 — 아래 값은 참고용이며 입지 평가의 근거로 쓰지 마세요.")


def _num(v, nd: int = 1):
    return None if v is None or pd.isna(v) else round(float(v), nd)


def _int(v):
    return None if v is None or pd.isna(v) else int(round(float(v)))


def _load_model() -> dict:
    return data_store.load_json("location_model.json")


# ───────────────────────── 1. 반경 지표 ─────────────────────────

def _anchor_metrics(bizes_id: str, radius_m: int) -> dict:
    sa = data_store.load_parquet("store_anchor.parquet")
    hit = sa.loc[sa["bizesId"] == bizes_id]
    if hit.empty:
        return {"status": "no_data", "message": "이 매장은 앵커 브랜드 거리 계산 대상이 아닙니다.", "brands": []}
    r = hit.iloc[0]
    brands = []
    for b, label in food_map.ANCHOR_LABELS.items():
        brands.append({
            "brand": b, "label": label, "nearest_m": _int(r[f"{b}_nearest_m"]), "count": int(r[f"{b}_cnt_{radius_m}m"]),
            "counts_by_radius": {str(x): int(r[f"{b}_cnt_{x}m"]) for x in RADII_M},
        })
    return {"status": "ok", "brands": brands, "note": "직선거리 기준, 파일럿 두 구 밖 매장은 포함하지 않아 구 경계 근처는 실제보다 적게 나올 수 있습니다."}


def _competitor_metrics(store: dict, radius_m: int) -> dict:
    """반경 안 같은 소분류(경쟁)와 같은 대분류(업종 밀집) 점포 수. 같은 상호·주소·업종 중복 등록은 1곳으로 센다."""
    me = (store["bizesNm"], store["rdnmAdr"] or store["lnoAdr"])

    def others(res: dict) -> list[dict]:
        return [r for r in res["records"] if r["store_id"] != store["bizesId"] and (r["name"], r["address"]) != me]

    same = competitors_service.find_competitors(store["lon"], store["lat"], radius_m, "scls", store["indsSclsCd"], limit=100_000)
    same_recs = others(same)
    large = competitors_service.find_competitors(store["lon"], store["lat"], radius_m, "lcls", store["indsLclsCd"], limit=100_000)
    large_recs = others(large)
    nearest = min((r["distance_m"] for r in same_recs), default=None)
    return {
        "same_category": {"label": store["indsSclsNm"], "level": "소분류", "count": len(same_recs), "nearest_m": _int(nearest)},
        "same_large_category": {"label": store["indsLclsNm"], "level": "대분류", "count": len(large_recs)},
        "all_stores": {"label": "반경 안 전체 업소", "count": max(int(same["total_in_radius"]) - 1, 0)},
        "basis": "소상공인 상가정보 기준, 선택 매장 제외, 같은 상호·주소·업종 중복 등록은 1곳으로 계산",
    }


# ───────────────────────── 2. 수요 유형 ─────────────────────────

def _pick_area(store: dict) -> tuple[str, str, str, str | None, str | None]:
    """(단위, 코드, 이름, 상권 유형, 행정동 대체 사유). 서울시 지정 상권 안이면 상권, 아니면 행정동."""
    st = data_store.load_parquet("store_trdar.parquet")
    hit = st.loc[st["bizesId"] == store["bizesId"]]
    if hit.empty:
        return "dong", store["adongCd"], store["adongNm"], None, "매장이 서울시 지정 상권(골목·발달·전통시장) 밖에 있어 행정동 기준으로 보여줍니다."
    t = hit.iloc[0]
    return "trdar", t["trdar_cd"], t["trdar_nm"], t["trdar_type"], None


def _time_pattern(level: str, code: str) -> dict | None:
    """유동인구의 점심·저녁·주말 비중과 같은 단위 전체 중앙값 — 수요 유형이 실제 시간대 패턴과 맞는지 눈으로 확인하는 보조 자료."""
    name = "trdar_floating_pop.parquet" if level == "trdar" else "dong_floating_pop.parquet"
    cd = "trdar_cd" if level == "trdar" else "adongCd"
    try:
        fp = data_store.load_parquet(name)
    except data_store.DataNotReady:
        return None
    latest = fp.loc[fp["quarter"] == fp["quarter"].max()]
    mine = latest.loc[latest[cd] == code]
    if mine.empty:
        return None
    mine = mine.iloc[0]
    items = [("lunch", "점심(11~14시)", "share_t11_14"), ("evening", "저녁(17~21시)", "share_t17_21"), ("weekend", "주말", "share_weekend")]
    return {"quarter": store_churn.quarter_label(str(latest["quarter"].iloc[0])),
            "items": [{"key": k, "label": lb, "share": _num(mine[c] * 100), "median": _num(latest[c].median() * 100)} for k, lb, c in items],
            "note": "유동인구 시간대 비중은 서울시·KT 생활인구를 길 단위로 배분한 추정 지수입니다."}


def _area_block(store: dict, model: dict) -> dict:
    level, code, name, trdar_type, fallback = _pick_area(store)
    feats = data_store.load_parquet("location_features.parquet")
    same_level = feats.loc[feats["level"] == level]
    row = same_level.loc[same_level["code"] == code]
    counts = same_level["demand_type"].value_counts()
    base = {"level": level, "level_label": "상권" if level == "trdar" else "행정동", "code": code, "name": name, "trdar_type": trdar_type,
            "fallback_reason": fallback, "type_counts": {t: int(counts.get(t, 0)) for t in TYPE_BASIS}}
    if row.empty or pd.isna(row.iloc[0]["demand_type"]):
        return {**base, "demand_type": None, "message": f"이 {base['level_label']}의 직장·상주인구 자료가 없어 수요 유형을 분류하지 않았습니다(0 이 아니라 자료 없음)."}
    r = row.iloc[0]
    th = model["thresholds"]
    return {
        **base, "demand_type": r["demand_type"], "basis": TYPE_BASIS[r["demand_type"]],
        "worker_share": _num(r["worker_share"] * 100, 0), "workers": _int(r["workers"]), "residents": _int(r["residents"]),
        "has_subway": None if pd.isna(r["has_subway"]) else bool(r["has_subway"]),
        "rule": f"직장인구 ÷ (직장+상주인구) {th['worker_type_min'] * 100:.0f}% 이상 업무형, {th['resident_type_max'] * 100:.0f}% 이하 주거형, 사이는 혼합형",
        "time_pattern": _time_pattern(level, code),
    }


# ───────────────────────── 3. 입지 요인 모델 ─────────────────────────

def _store_service(store: dict) -> str | None:
    cw = data_store.load_parquet("sales_industry_crosswalk.parquet")
    hit = cw.loc[cw["indsSclsCd"] == store["indsSclsCd"]]
    if hit.empty or pd.isna(hit.iloc[0]["svc_cd"]):
        return None
    return str(hit.iloc[0]["svc_cd"])


def _tendency(c: dict) -> str:
    if not c["significant"]:
        return "뚜렷한 관계 없음"
    return "높은 경향" if c["direction"] == "positive" else "낮은 경향"


def _per_unit_pct(pct_per_sd: float, sd: float) -> float:
    """'표준편차 1 증가당 %' → '값 1 증가당 %'. 표준화 계수 b 는 b_unit × sd 이므로 ln(1+pct) 를 sd 로 나눈다."""
    return round((float(np.exp(np.log1p(pct_per_sd / 100) / sd)) - 1) * 100, 1)


def _raw_value(key: str, logged: float) -> float:
    return float(logged) if key in BINARY else float(np.expm1(logged))


def _percentile(series: pd.Series, value: float) -> int:
    return int(round(float((series <= value).mean()) * 100))


def _model_block(store: dict, area: dict, model: dict) -> dict:
    meta = {k: model[k] for k in ("target", "features") if k in model}
    if model["status"] != "ok":
        return {"status": "insufficient", "message": model["message"], **meta}
    svc = _store_service(store)
    cv = model["cv"]
    feat_info = {f["key"]: f for f in model["features"]}
    vif = model.get("vif", {})
    base = {
        "status": "ok", "useful": model["useful"], "reliability_note": None if model["useful"] else MODEL_NOT_USEFUL,
        "rows": model["rows"], "clusters": model["clusters"], "services": model["services"],
        "cv": {"r2_full": cv["r2_full"], "r2_base": cv["r2_base"], "delta": cv["delta"], "folds": cv["folds"], "groups": cv["n_groups"],
               "text": f"행정동 {cv['n_groups']}곳을 {cv['folds']}묶음으로 나눠 처음 보는 동네를 맞힌 설명력 — 입지 요인 모델 {cv['r2_full']:.2f}, 업종만 넣은 기준 모델 {cv['r2_base']:.2f}"},
        "target": model["target"], "high_vif": [k for k, v in vif.items() if v is None or v > 5],
    }
    mine = peers = None
    reason = None
    n_peers = 0
    if svc is None or not svc.startswith(FOOD_SVC_PREFIX):
        reason = "회귀 모델은 서울시 음식 업종(한식·중식·카페 등) 상권을 대상으로 만들었습니다. 이 매장 업종은 대상이 아니어서 계수만 보여줍니다."
    elif area["level"] != "trdar":
        reason = "회귀 모델은 서울시 지정 상권 단위로 만들었습니다. 이 매장은 지정 상권 밖이라 계수만 보여줍니다."
    else:
        rows = data_store.load_parquet("location_model_rows.parquet")
        same_svc = rows.loc[rows["svc_cd"] == svc]
        n_peers = len(same_svc)
        hit = same_svc.loc[same_svc["trdar_cd"] == area["code"]]
        if hit.empty:
            reason = "이 상권·업종은 점포 수가 적거나 매출이 비공개여서 모델 표본에 들어가지 않았습니다. 계수만 보여줍니다."
        else:
            mine, peers = hit.iloc[0], same_svc
    factors = []
    for c in model["coefficients"]:
        key = c["key"]
        pct, lo, hi = c["pct_per_sd"], c["pct_lo"], c["pct_hi"]
        if key in BINARY:  # 0/1 요인은 '표준편차 1 증가'가 아니라 '없음 → 있음'의 차이로 바꿔 보여준다
            pct, lo, hi = (_per_unit_pct(v, c["sd"]) for v in (pct, lo, hi))
        f = {
            "key": key, "label": feat_info[key]["label"], "unit": feat_info[key].get("unit", ""), "definition": feat_info[key]["definition"], "source": feat_info[key]["source"],
            "pct_per_sd": c["pct_per_sd"], "pct": pct, "pct_lo": lo, "pct_hi": hi, "p": c["p"], "significant": c["significant"],
            "direction": c["direction"], "tendency": _tendency(c), "binary": key in BINARY,
            "effect_unit": "없음→있음" if key in BINARY else "표준편차 1 증가",
            "vif": vif.get(key), "store_value": None, "store_percentile": None,
        }
        if mine is not None:
            f["store_value"] = _num(_raw_value(key, mine[key]), 2 if key in BINARY else 1)
            f["store_percentile"] = None if key in BINARY else _percentile(peers[key], float(mine[key]))
        factors.append(f)
    return {**base, "factors": factors, "store_in_sample": mine is not None, "not_in_sample_reason": reason,
            "service": {"svc_cd": svc, "peers": n_peers}, **meta}


# ───────────────────────── 진입점 ─────────────────────────

def analyze(bizes_id: str, radius_m: int = DEFAULT_RADIUS_M) -> dict:
    if radius_m not in RADII_M:
        raise ValueError(f"radius_m 은 {list(RADII_M)} 중 하나여야 합니다")
    store = store_profile.get_store(bizes_id)
    model = _load_model()
    data_store.load_parquet("location_features.parquet")  # 없으면 DataNotReady → 503
    area = _area_block(store, model)
    return {
        "store": {"store_id": bizes_id, "name": store["bizesNm"], "category": store["indsSclsNm"], "lon": store["lon"], "lat": store["lat"]},
        "radius_m": radius_m, "radius_options": list(RADII_M),
        "radius_metrics": {"anchors": _anchor_metrics(bizes_id, radius_m), "competitors": _competitor_metrics(store, radius_m),
                           "bus": bus_access.metrics(store, radius_m), "rail": rail_access.metrics(store, radius_m)},
        "area": area,
        "model": _model_block(store, area, model),
        "caveats": CAVEATS,
        "source": {"title": "소상공인 상가(상권)정보 · 서울시 상권분석서비스(인구·집객시설·추정매출)",
                   "reference": f"추정매출 {model['target']['recent_quarters']}개 분기 평균 기준"},
    }
