"""상권 운영 점검 — 외부 AI 없이 규칙 + 비슷한 상권 비교로 '관측된 차이'를 보여주고 현장 확인 항목을 제안한다.

입력은 sales_benchmark.benchmark() 결과(내 상권·행정동의 매출 구성, 유동인구, 추이, 수요 기반)와, 같은 업종에서
**상권 유형과 수요 구조(직장인구 비중)가 비슷한** 비교 상권들 중 점포당 추정매출이 높은 상위 25%의 매출 구성이다.

이 서비스가 말할 수 있는 것과 없는 것
  - 말하는 것: 비교 상권과 이 상권의 매출 구성·인구 구성이 어떻게 다른지(관측된 사실), 그 차이를 설명할 수 있는 몇 가지 가능성(가능한 해석),
    그 가능성을 가려내려면 현장에서 무엇을 확인할지(확인할 사항).
  - 말하지 않는 것: 차이가 매출의 원인이라는 것, 비중을 바꾸면 매출이 오른다는 것, 유동인구 대비 매출이 낮으면 구매 전환이 부족하다는 것,
    점포당 추정매출이 높은 상권이 수익성이 좋다는 것(임대료·인건비·원가는 자료에 없다).
  - 비교군이 부족하면(같은 유형·비슷한 수요 구조의 상권이 MIN_PEERS 곳 미만) 구성비 비교는 하지 않고 '분석 자료 부족'으로 표시한다.
사장님 매출은 서버로 받지 않는다(이 점검은 입력 매출과 무관하다).
"""
from __future__ import annotations

import pandas as pd

from app.services import data_store, franchise, sales_benchmark

TOP_SHARE = 0.25
MIN_TOP_GROUP = 3
MIN_PEERS = 8
PEER_WORKER_SHARE_BAND = 0.15   # 직장인구 ÷ (직장+상주인구) 가 이 폭(±) 안이면 수요 구조가 비슷하다고 본다
GAP_PCTP = 5.0
FLPOP_BONUS_PCTP = 5.0
MAX_RECS = 5
TREND_SCORE_CAP = 30.0
EXTREME_YOY_PCT = 50.0
FRANCHISE_HEAVY_SHARE = 0.5
MIN_UNIT_STORES_FOR_SHARE = 5
BRAND_CHURN_HIGH = 0.10
HINTERLAND_GAP_PCTP = 5.0   # 직장·상주인구 연령/성별 비중이 매출 비중보다 이만큼 이상 높으면 '주변에 있는 손님층'
HINTERLAND_BONUS = 5.0
LARGE_POP_RATIO = 1.5       # 직장·상주인구가 비교 단위 중앙값의 1.5배 이상이면 시간대 관측의 맥락으로 쓴다
LARGE_POP_BONUS = 3.0
WORKER_TIME_KEYS = {"share_t11_14"}                                      # 점심 — 직장인구
RESIDENT_TIME_KEYS = {"share_t17_21", "share_t21_24", "share_weekend"}   # 저녁·주말 — 상주인구
MIN_CHURN_EVENTS = 2       # 1년에 1곳 열고 닫힌 정도는 우연일 수 있어 규칙에서 뺀다
CHURN_GAP_PCTP = 5.0       # 비교군 중앙값보다 이만큼(%p) 이상 높을 때만
CHURN_SCORE_CAP = 20.0
SHARE_LABELS_SHORT = {"share_female": "여성", "share_age20": "20대", "share_age30": "30대", "share_age40": "40대",
                      "share_age50": "50대", "share_age60": "60대 이상"}
TIME_KEYS = ["share_t06_11", "share_t11_14", "share_t14_17", "share_t17_21", "share_t21_24"]  # 0~6시는 제외(주민 체류)
AGE_KEYS = ["share_age20", "share_age30", "share_age40", "share_age50", "share_age60"]
TITLE = "상권 운영 점검"
DISCLAIMER = ("서울시 추정매출·유동인구·인구 자료로 찾은 '관측된 차이'와 '가능한 해석'입니다. 차이가 매출의 원인이라는 뜻도, 바꾸면 매출이 오른다는 뜻도 아니며 "
              "개별 매장 진단이 아닙니다. 점포당 추정매출이 높은 상권이 수익성이 좋다는 뜻도 아닙니다(임대료·인건비·원가는 이 자료에 없음). "
              "실제 손님 흐름·원가·인력 사정과 함께 판단하세요.")
COMPARISON_CAVEAT = "비교 상권은 같은 유형·비슷한 수요 구조로 골랐지만 완전히 같지는 않아, 차이의 일부는 상권 특성일 수 있습니다."

ACTION = {  # 서비스업종 대분류별 표현
    "CS1": {"offer": "메뉴·가격대", "hours": "영업·주문 가능 시간"},
    "CS2": {"offer": "서비스 구성·가격대", "hours": "운영·예약 가능 시간"},
    "CS3": {"offer": "상품 구성·진열", "hours": "영업시간"},
}


def worker_share(workplace: float | None, resident: float | None) -> float | None:
    """직장인구 ÷ (직장인구 + 상주인구) — 낮에 일하러 오는 수요 대 사는 수요의 구조. 둘 중 하나라도 없으면 None."""
    if workplace is None or resident is None or pd.isna(workplace) or pd.isna(resident) or workplace + resident <= 0:
        return None
    return float(workplace) / float(workplace + resident)


def _profile(level: str) -> pd.DataFrame:
    """단위 코드 → (상권 유형, 직장인구 비중). 유형은 상권만 있고 행정동은 None."""
    unit = sales_benchmark.UNITS[level]
    hl = data_store.load_parquet(unit["hinterland"]).set_index(unit["cd"])
    prof = pd.DataFrame({"wshare": [worker_share(a, b) for a, b in zip(hl["wrc_total"], hl["repop_total"])]}, index=hl.index)
    if level == "trdar":
        prof["type"] = data_store.load_parquet("trdar_areas.parquet").set_index("trdar_cd")["trdar_type"].reindex(prof.index)
    else:
        prof["type"] = None
    return prof


def comparable_peers(level: str, svc: str, code: str) -> tuple[pd.DataFrame | None, dict]:
    """같은 업종·같은 유형·비슷한 수요 구조의 비교 상권(자기 자신 제외) 행과 비교 기준 설명.

    비교군이 MIN_PEERS 곳 미만이면 (None, basis) — 호출하는 쪽은 '분석 자료 부족'으로 표시한다.
    """
    unit = sales_benchmark.UNITS[level]
    df = data_store.load_parquet(unit["table"])
    sel = df.loc[(df["svc_cd"] == svc) & (df["quarter"] == df["quarter"].max()) & df["per_store_q"].notna()
                 & (df["stores"] >= sales_benchmark.MIN_STORES)]
    try:
        prof = _profile(level)
    except data_store.DataNotReady:
        return None, {"peers": 0, "reason": "직장·상주인구 자료가 아직 없어 수요 구조가 비슷한 비교 대상을 고를 수 없습니다."}
    mine = prof.loc[code] if code in prof.index else None
    if mine is None or mine["wshare"] is None or pd.isna(mine["wshare"]):
        return None, {"peers": 0, "reason": "이 단위의 직장·상주인구 자료가 없어 수요 구조가 비슷한 비교 대상을 고를 수 없습니다."}
    cand = sel.loc[sel[unit["cd"]] != code].join(prof, on=unit["cd"])
    near = cand["wshare"].notna() & ((cand["wshare"] - mine["wshare"]).abs() <= PEER_WORKER_SHARE_BAND)
    same_type = (cand["type"] == mine["type"]) if mine["type"] is not None and not pd.isna(mine["type"]) else True
    peers = cand.loc[near & same_type]
    type_text = f"같은 {mine['type']}" if mine["type"] is not None and not pd.isna(mine["type"]) else f"같은 {unit['label']} 단위"
    basis = {"unit_type": None if pd.isna(mine["type"]) else mine["type"], "worker_share": round(float(mine["wshare"]), 3),
             "band": PEER_WORKER_SHARE_BAND, "peers": len(peers), "candidates": len(cand),
             "text": f"{type_text}, 직장인구 비중이 비슷한(이 {unit['label']} {mine['wshare'] * 100:.0f}% ±{PEER_WORKER_SHARE_BAND * 100:.0f}%p) 같은 업종 {unit['label']}"}
    if len(peers) < MIN_PEERS:
        basis["reason"] = (f"비교할 수 있는 같은 업종 {unit['label']}이 {len(peers)}곳뿐이라(최소 {MIN_PEERS}곳 필요) 구성비 비교는 하지 않았습니다. "
                           "유형이나 수요 구조가 다른 곳과 섞어 비교하면 오해를 만들 수 있기 때문입니다.")
        return None, basis
    return peers, basis


def top_group_mix(level: str, svc: str, code: str, own_per_store_q: float | None = None) -> tuple[dict | None, dict]:
    """비교 상권 중 점포당 추정매출 상위 25%의 매출 구성(매출 가중 평균)과 비교 기준. 부족하면 (None, basis).

    상위 25%는 '점포당 추정매출'이 높다는 뜻일 뿐 수익성(이익)과는 다르다.
    """
    peers, basis = comparable_peers(level, svc, code)
    if peers is None:
        return None, basis
    unit = sales_benchmark.UNITS[level]
    cut = peers["per_store_q"].quantile(1 - TOP_SHARE)
    top = peers.loc[peers["per_store_q"] >= cut]
    if len(top) < MIN_TOP_GROUP:
        basis["reason"] = f"비교 {unit['label']} {len(peers)}곳 중 상위 25%가 {len(top)}곳뿐이라(최소 {MIN_TOP_GROUP}곳 필요) 구성비 비교는 하지 않았습니다."
        return None, basis
    w = top["sales_q"]
    keys = [k for g in sales_benchmark.GROUPS.values() for k in g]
    mix = {k: float((top[k] * w).sum() / w[top[k].notna()].sum()) for k in keys if top[k].notna().any()}
    return {"mix": mix, "count": len(top), "peers": len(peers),
            "names": top.sort_values("per_store_q", ascending=False)[unit["nm"]].head(3).tolist(),
            "per_store_month_min": float(cut / 3),
            "self_in_top": bool(own_per_store_q is not None and own_per_store_q >= cut)}, basis


def _share(bm: dict, key: str) -> float | None:
    for g in bm.get("composition") or []:
        for it in g["items"]:
            if it["key"] == key:
                return it["dong"]
    return None


def _rec(area: str, title: str, observed: list[str], interpretations: list[str], checks: list[str], score: float) -> dict:
    """관측된 사실 / 가능한 해석 / 현장에서 확인할 사항을 분리한 점검 항목."""
    return {"area": area, "title": title, "observed": observed, "interpretations": interpretations, "checks": checks, "score": round(score, 1)}


def _transit_facts(hl: dict | None, unit_label: str) -> list[str]:
    fac = (hl or {}).get("facility") or {}
    items = {it["key"]: it for it in fac.get("items", [])}
    # 비교 단위 중앙값보다 많을 때만 쓴다(행정동은 버스정류장 수십 곳이 보통이라 개수만으로는 의미가 없다).
    parts = [f"{name} {it['count']}곳(중앙값 {it['peer_median']:g}곳)"
             for k, name in (("fac_subway", "지하철역"), ("fac_bus_stop", "버스정류장"))
             if (it := items.get(k)) and it.get("peer_median") is not None and it["count"] > it["peer_median"]]
    return [f"이 {unit_label} 안 " + "·".join(parts) + " — 교통시설이 비교 단위보다 많음"] if parts else []


def _demand_share(hl: dict, key: str) -> tuple[float, int] | None:
    """직장+상주인구에서 해당 연령대·여성 비중(인구 가중)과 인구 합. 매출 비중과 같은 축으로 비교한다."""
    blocks = [b for b in (hl.get("workplace"), hl.get("resident")) if b]
    if not blocks:
        return None
    total = sum(b["total"] for b in blocks)
    if key == "share_female":
        part = sum(b["female_share"] * b["total"] for b in blocks if b["female_share"] is not None)
    elif key.startswith("share_age"):
        age = key.removeprefix("share_")
        part = sum((b["age_share"].get(age) or 0) * b["total"] for b in blocks)
    else:
        return None
    return part / total, total


def _hinterland_context(hl: dict | None, key: str, mine: float, unit_label: str) -> tuple[list[str], list[str], float]:
    """(관측, 해석, 가산점). 직장·상주인구 구성과 매출 구성의 차이를 사실로 적고, 인구가 있다고 곧 소비한다는 뜻은 아니라고 덧붙인다."""
    if not hl:
        return [], [], 0.0
    label = SHARE_LABELS_SHORT.get(key, key)
    ds = _demand_share(hl, key)
    if ds is not None:
        share, total = ds
        gap = (share - mine) * 100
        if gap >= HINTERLAND_GAP_PCTP:
            return ([f"이 {unit_label} 직장·상주인구 {total:,}명 중 {label} {share * 100:.0f}% · 매출 비중 {mine * 100:.0f}% (주변 인구 비중이 매출 비중보다 큼)"],
                    [f"주변에 {label}이 있는 만큼 접근성·메뉴·홍보가 맞는지 볼 여지가 있습니다. 다만 인구가 있다고 같은 비율로 소비하는 것은 아닙니다."],
                    HINTERLAND_BONUS)
        if gap <= -HINTERLAND_GAP_PCTP:
            return ([f"이 {unit_label} 직장·상주인구 중 {label}은 {share * 100:.0f}%로 많지 않음"],
                    [f"주변 인구가 적다면 {label} 손님은 다른 지역에서 찾아오는 경우일 수 있어 홍보·배달·예약 경로가 중요할 수 있습니다."], 0.0)
        return [], [], 0.0
    med = hl.get("peer_median") or {}
    wrc, rep = hl.get("workplace"), hl.get("resident")
    if key in WORKER_TIME_KEYS and wrc and med.get("workplace") and wrc["total"] >= med["workplace"] * LARGE_POP_RATIO:
        return ([f"이 {unit_label} 직장인구 {wrc['total']:,}명({hl['peer_label']} 중앙값 {med['workplace']:,.0f}명)으로 많은 편"],
                ["점심 시간대 수요의 규모가 큰 곳이라 이 시간대 비중 차이가 의미 있을 수 있습니다(인구가 곧 매출은 아님)."], LARGE_POP_BONUS)
    if key in RESIDENT_TIME_KEYS and rep and med.get("resident") and rep["total"] >= med["resident"] * LARGE_POP_RATIO:
        hh = f"·{rep['households']:,.0f}세대" if rep.get("households") else ""
        return ([f"이 {unit_label} 상주인구 {rep['total']:,}명{hh}({hl['peer_label']} 중앙값 {med['resident']:,.0f}명)으로 많은 편"],
                ["저녁·주말에 동네 수요가 큰 곳이라 이 시간대 비중 차이가 의미 있을 수 있습니다(인구가 곧 매출은 아님)."], LARGE_POP_BONUS)
    return [], [], 0.0


def _mix_checks(key: str, label: str, action: dict) -> list[str]:
    if key in TIME_KEYS:
        return [f"내 가게의 {label} 영업 여부와 주문·결제 건수(POS·배달앱 통계)", f"{label}에 가게 앞 손님 흐름과 주변 가게의 영업 여부를 직접 확인"]
    if key == "share_weekend":
        return ["내 가게의 주말 영업 여부와 주말 결제 비중", "주말에 주변 가게·상권 전체가 열려 있는지, 주말 손님 흐름 직접 확인"]
    return [f"내 가게 손님 중 {label} 비중(예약·회원·배달앱 통계)", f"주변에서 {label} 손님이 많이 오가는 시간대와 장소(학교·직장·주거) 확인"]


def build_recommendations(bm: dict, top: dict | None, brand: dict | None = None) -> list[dict]:
    """순수 함수 — benchmark 결과와 상위 그룹 구성으로 우선순위가 매겨진 점검 항목을 만든다.

    각 항목은 observed(관측된 사실) · interpretations(가능한 해석, 단정 아님) · checks(현장에서 확인할 사항)로 나뉜다.
    """
    recs: list[dict] = []
    action = ACTION.get((bm.get("svc_cd") or "")[:3], ACTION["CS1"])
    unit_label = bm["unit"]["label"]
    fl = bm.get("floating") or {}
    fl_items = {it["key"]: it for g in fl.get("mix", []) for it in g["items"]}
    hl = bm.get("hinterland")

    if top and not top.get("self_in_top"):
        for key in TIME_KEYS + ["share_weekend"] + AGE_KEYS + ["share_female"]:
            mine, best = _share(bm, key), top["mix"].get(key)
            if mine is None or best is None:
                continue
            gap = (best - mine) * 100
            if gap < GAP_PCTP:
                continue
            label = sales_benchmark.SHARE_LABELS[key]
            observed = [f"점포당 추정매출 상위 25% 비교 상권의 {label} 매출 비중 {best * 100:.0f}% · 이 {unit_label} {mine * 100:.0f}% ({gap:.1f}%p 낮음)"]
            score = gap
            flp = fl_items.get(key)
            if flp and flp["flpop"] is not None and flp["sales"] is not None and (flp["flpop"] - flp["sales"]) * 100 >= FLPOP_BONUS_PCTP:
                observed.append(f"이 {unit_label}의 {label} 유동인구 비중 {flp['flpop'] * 100:.0f}% · 매출 비중 {flp['sales'] * 100:.0f}% "
                                "(두 비중의 차이이며 구매 전환율을 뜻하지 않음)")
                score += FLPOP_BONUS_PCTP
            h_obs, h_interp, bonus = _hinterland_context(hl, key, mine, unit_label)
            observed += h_obs
            score += bonus
            interpretations = [f"{label}에 맞는 {action['hours']}이나 {action['offer']}가 비교 상권의 상위 점포와 다를 수 있습니다.",
                               f"또는 이 {unit_label}의 손님 구성이 원래 달라서일 수 있습니다. {COMPARISON_CAVEAT}", *h_interp]
            if key in TIME_KEYS:
                area, title = "영업시간", f"{label} 매출 비중이 비교 상권보다 낮음"
            elif key == "share_weekend":
                area, title = "요일", "주말 매출 비중이 비교 상권보다 낮음"
            elif key == "share_female":
                area, title = "손님층", "여성 손님 매출 비중이 비교 상권보다 낮음"
            else:
                area, title = "손님층", f"{label} 매출 비중이 비교 상권보다 낮음"
            recs.append(_rec(area, title, observed, interpretations, _mix_checks(key, label, action), score))

    yoy = bm.get("per_store_yoy_pct")
    trend = [t for t in bm.get("trend") or [] if t.get("stores")]
    if yoy is not None and yoy <= -5:
        observed = [f"이 {unit_label} 같은 업종 점포당 추정매출이 전년 동기 대비 {yoy:+.1f}%"]
        interpretations = ["내 매출 변화가 상권 전체 흐름과 같은 방향일 수 있습니다(상권 전체의 수요 변화)."]
        if len(trend) >= 5 and trend[-5]["stores"]:
            st_change = (trend[-1]["stores"] / trend[-5]["stores"] - 1) * 100
            observed.append(f"같은 기간 점포 수 {trend[-5]['stores']}곳 → {trend[-1]['stores']}곳 ({st_change:+.0f}%)")
            if st_change >= 5:
                interpretations.append("점포가 늘어 손님이 나뉘었을 수 있습니다(경쟁 증가). 다만 점포 수와 매출의 인과는 이 자료로 알 수 없습니다.")
            elif st_change <= -5:
                interpretations.append("점포가 줄어든 만큼 상권 수요 자체가 줄었을 수 있습니다. 원인은 이 자료로 알 수 없습니다.")
        if abs(yoy) >= EXTREME_YOY_PCT:
            observed.append("변동 폭이 매우 커 업종 분류·표본 변화의 영향일 수 있음(데이터 확인 필요)")
        recs.append(_rec("상권 흐름", "상권 전체 흐름과 내 매출 변화 비교", observed, interpretations,
                         ["내 매출의 최근 4분기 추이가 상권 흐름과 같은 폭·방향인지", "내 가게에서만 바뀐 것(메뉴·가격·휴무·인력)이 있었는지"],
                         min(abs(yoy), TREND_SCORE_CAP)))

    recs.extend(_churn_recs(bm.get("churn"), unit_label, action))

    if fl.get("rank") and fl.get("peer_count", 0) >= MIN_PEERS and fl["rank"] / fl["peer_count"] > 0.7:
        recs.append(_rec(
            "유동인구", "유동인구 1만 명당 매출이 비교 단위 중 낮은 편",
            [f"유동인구 1만 명당 매출 {fl['rank']}/{fl['peer_count']}위(하위 30%)", *_transit_facts(hl, unit_label)],
            ["유동인구는 길 위 상대 지수라 건물 안 인구는 적게 반영되고, 업종마다 지나가는 사람이 손님이 되는 비율이 달라, 이 지표가 낮다는 이유만으로 원인을 단정할 수 없습니다.",
             "이 업종이 지나가는 사람보다 목적 방문 손님 중심이라면 이 지표가 낮은 것이 자연스러울 수 있습니다."],
            ["가게 앞 통행량과 입구 쪽 노출(간판·시야)을 시간대별로 직접 확인", "손님이 지나가다 들어온 비율과 목적 방문 비율(손님에게 물어보기)"],
            10 * fl["rank"] / fl["peer_count"]))

    fs = bm.get("franchise_share")
    if (brand is None and fs and fs["share"] is not None and fs["stores"] >= MIN_UNIT_STORES_FOR_SHARE
            and fs["share"] >= FRANCHISE_HEAVY_SHARE):
        recs.append(_rec(
            "경쟁", "프랜차이즈 비율이 높은 상권",
            [f"이 {unit_label} 같은 업종 {fs['stores']}곳 중 프랜차이즈 {fs['frc_stores']}곳({fs['share'] * 100:.0f}%)"
             + (f", 비교군 중앙값 {fs['peer_median'] * 100:.0f}%" if fs.get("peer_median") is not None else "")],
            ["가격·브랜드 경쟁이 클 수 있습니다. 반대로 프랜차이즈가 많다는 것은 상권에 수요가 있다는 신호일 수도 있습니다."],
            ["가까운 프랜차이즈 점포의 가격·메뉴·영업시간을 직접 비교", f"내 가게만의 {action['offer']}·단골 관리가 있는지"],
            fs["share"] * 20))

    if brand and brand.get("churn_rate") is not None and brand["churn_rate"] >= BRAND_CHURN_HIGH:
        recs.append(_rec(
            "브랜드", "브랜드 가맹점 계약 종료·해지 현황",
            [f"'{brand['brand']}' {brand['year']}년 가맹점 {brand['frcs_cnt']:.0f}곳 중 계약 종료·해지 "
             f"{(brand['end_cnt'] or 0) + (brand['cancel_cnt'] or 0):.0f}곳({brand['churn_rate'] * 100:.1f}%) — 공정위 전국 자료"],
            ["전국 평균이라 이 매장·이 상권의 상황과 다를 수 있고, 매장 개별 평가가 아닙니다."],
            ["본사 지원(판촉·원가)·계약 조건·영업지역 보호 범위를 가맹본부에 확인"],
            brand["churn_rate"] * 60))

    recs.sort(key=lambda r: -r["score"])
    return recs[:MAX_RECS]


def _churn_flag(ch: dict, kind: str) -> float | None:
    """비교군 상위 25% 이상 + 중앙값보다 5%p 이상 높고 1년 2곳 이상이면 (중앙값 대비 %p 차) 를 돌려준다."""
    rate, med, p75 = ch[f"{kind}_rate"], ch[f"peer_median_{kind}"], ch[f"peer_p75_{kind}"]
    count = ch["opened" if kind == "open" else "closed"]
    if rate is None or med is None or p75 is None or count < MIN_CHURN_EVENTS:
        return None
    gap = (rate - med) * 100
    return gap if rate >= p75 and gap >= CHURN_GAP_PCTP else None


def _churn_recs(ch: dict | None, unit_label: str, action: dict) -> list[dict]:
    if not ch or ch.get("status") != "ok" or ch.get("peer_count", 0) < MIN_PEERS:
        return []  # 자료 없음·관찰기간 부족·일부 결측은 '폐업이 많다/적다'는 근거로 쓰지 않는다
    o_gap, c_gap = _churn_flag(ch, "open"), _churn_flag(ch, "close")
    base = (f"최근 1년({ch['period']}) 이 {unit_label} 같은 업종 평균 {ch['avg_stores']:g}곳 중 "
            f"개업 {ch['opened']}곳 · 폐업 {ch['closed']}곳")
    o_ev = f"연 개업률 {ch['open_rate'] * 100:.0f}% (비교 단위 중앙값 {ch['peer_median_open'] * 100:.0f}%)"
    c_ev = f"연 폐업률 {ch['close_rate'] * 100:.0f}% (비교 단위 중앙값 {ch['peer_median_close'] * 100:.0f}%)"
    moved = "업종 변경·이전도 개폐업으로 잡힐 수 있어 실제 영업 중단 수와 다를 수 있습니다."
    if o_gap is not None and c_gap is not None:
        return [_rec("개폐업", "개업과 폐업이 모두 비교 단위보다 많음", [base, o_ev, c_ev],
                     ["가게가 자주 바뀌는 자리일 수 있습니다. 고정비(임대료·인건비)가 이 상권의 매출 수준과 맞지 않았을 수도, 단순히 거래가 활발한 상권일 수도 있습니다.", moved],
                     ["오래 영업 중인 주변 가게는 어떤 점이 다른지(영업 연수·메뉴·시간)", "내 고정비가 이 상권 매출 수준에서 감당 가능한지 계산"],
                     min(max(o_gap, c_gap), CHURN_SCORE_CAP))]
    if c_gap is not None:
        return [_rec("개폐업", "같은 업종 폐업이 비교 단위보다 많음", [base, c_ev],
                     ["수요가 부족했을 수도, 고정비 부담이 컸을 수도 있습니다. 원인은 이 자료로 알 수 없습니다.", moved],
                     ["폐업한 주변 가게가 있다면 이유 확인(이웃 가게·부동산)", f"내 {action['offer']}와 주 손님층이 이 상권 수요와 맞는지"],
                     min(c_gap, CHURN_SCORE_CAP))]
    if o_gap is not None:
        return [_rec("개폐업", "새로 여는 같은 업종 가게가 비교 단위보다 많음", [base, o_ev],
                     ["경쟁이 늘어나는 중일 수 있습니다. 반대로 수요가 있는 상권으로 가게들이 모이는 신호일 수도 있습니다.", moved],
                     ["새로 연 가게의 가격·메뉴·손님 수를 직접 확인", "내 단골 관리(재방문 혜택·안내) 현황"],
                     min(o_gap, CHURN_SCORE_CAP))]
    return []


def report(bizes_id: str) -> dict:
    bm = sales_benchmark.benchmark(bizes_id)
    if bm["status"] != "ok":
        return {"status": bm["status"], "title": TITLE, "message": bm.get("message"), "disclaimer": DISCLAIMER}
    top, basis = top_group_mix(bm["unit"]["level"], bm["svc_cd"], bm["unit"]["code"], bm.get("per_store_q"))
    brand = franchise.brand_info(bizes_id)
    recs = build_recommendations(bm, top, brand)
    return {
        "status": "ok", "title": TITLE,
        "unit": bm["unit"], "svc_nm": bm["svc_nm"], "scls_nm": bm.get("scls_nm"), "quarter_label": bm["quarter_label"],
        "benchmark": {"per_store_month": bm["per_store_month"], "rank": bm["rank"], "peer_count": bm["peer_count"]},
        "peer_basis": basis,
        "top_group": None if top is None else {k: top[k] for k in ("count", "peers", "names", "per_store_month_min", "self_in_top")},
        "top_group_note": None if top else f"분석 자료 부족 — {basis.get('reason', '비교군을 만들 수 없습니다.')}",
        "recommendations": recs,
        "brand": None if brand is None else {k: brand[k] for k in ("brand", "avg_sales_month", "avg_sales_year_label")},
        "disclaimer": DISCLAIMER,
        "source": bm["source"],
    }
