"""매출 개선 리포트 — 외부 AI 없이 규칙 + '잘 되는 상권' 벤치마크로 점검 후보를 만든다.

입력은 sales_benchmark.benchmark() 결과(내 상권·행정동의 매출 구성, 유동인구, 추이)와
같은 업종에서 점포당 매출 상위 25%인 비교 단위들의 매출 구성 평균이다.
제안은 '데이터로 찾은 점검 후보'이며 매출 증가를 보장하지 않는다. 사장님 매출은 서버로 받지 않는다.
"""
from __future__ import annotations

import pandas as pd

from app.services import data_store, franchise, sales_benchmark

TOP_SHARE = 0.25
MIN_TOP_GROUP = 3
MIN_PEERS = 8
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
LARGE_POP_RATIO = 1.5       # 직장·상주인구가 비교 단위 중앙값의 1.5배 이상이면 시간대 제안 근거로 쓴다
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
DISCLAIMER = ("서울시 추정매출·유동인구(상권·행정동 평균)로 찾은 점검 후보입니다. 개별 매장 진단이 아니며 매출 증가를 보장하지 않습니다. "
              "실제 손님 흐름·원가·인력 사정과 함께 판단하세요.")

ACTION = {  # 서비스업종 대분류별 표현
    "CS1": {"offer": "메뉴·가격대", "hours": "영업·주문 가능 시간"},
    "CS2": {"offer": "서비스 구성·가격대", "hours": "운영·예약 가능 시간"},
    "CS3": {"offer": "상품 구성·진열", "hours": "영업시간"},
}


def top_group_mix(unit_level: str, svc: str) -> dict | None:
    """같은 업종 최신 분기, 점포 3곳 이상인 비교 단위 중 점포당 매출 상위 25%의 매출 구성(매출 가중 평균)."""
    unit = sales_benchmark.UNITS[unit_level]
    df = data_store.load_parquet(unit["table"])
    sel = df.loc[(df["svc_cd"] == svc) & (df["quarter"] == df["quarter"].max()) & df["per_store_q"].notna()
                 & (df["stores"] >= sales_benchmark.MIN_STORES)]
    if len(sel) < MIN_PEERS:
        return None
    cut = sel["per_store_q"].quantile(1 - TOP_SHARE)
    top = sel.loc[sel["per_store_q"] >= cut]
    if len(top) < MIN_TOP_GROUP:
        return None
    w = top["sales_q"]
    keys = [k for g in sales_benchmark.GROUPS.values() for k in g]
    mix = {k: float((top[k] * w).sum() / w[top[k].notna()].sum()) for k in keys if top[k].notna().any()}
    return {"mix": mix, "count": len(top), "peers": len(sel),
            "names": top.sort_values("per_store_q", ascending=False)[unit["nm"]].head(3).tolist(),
            "per_store_month_min": float(cut / 3)}


def _share(bm: dict, key: str) -> float | None:
    for g in bm.get("composition") or []:
        for it in g["items"]:
            if it["key"] == key:
                return it["dong"]
    return None


def build_recommendations(bm: dict, top: dict | None, brand: dict | None = None) -> list[dict]:
    """순수 함수 — benchmark 결과와 상위 그룹 구성으로 우선순위가 매겨진 점검 후보 목록을 만든다."""
    recs: list[dict] = []
    action = ACTION.get((bm.get("svc_cd") or "")[:3], ACTION["CS1"])
    unit_label = bm["unit"]["label"]
    fl = bm.get("floating") or {}
    fl_items = {it["key"]: it for g in fl.get("mix", []) for it in g["items"]}

    if top:
        for key in TIME_KEYS + ["share_weekend"] + AGE_KEYS + ["share_female"]:
            mine, best = _share(bm, key), top["mix"].get(key)
            if mine is None or best is None:
                continue
            gap = (best - mine) * 100
            if gap < GAP_PCTP:
                continue
            label = sales_benchmark.SHARE_LABELS[key]
            evidence = [f"상위 25% 비교군의 {label} 매출 비중 {best * 100:.0f}% vs 이 {unit_label} {mine * 100:.0f}% (+{gap:.1f}%p)"]
            score = gap
            flp = fl_items.get(key)
            if flp and flp["flpop"] is not None and flp["sales"] is not None and (flp["flpop"] - flp["sales"]) * 100 >= FLPOP_BONUS_PCTP:
                evidence.append(f"이 {unit_label}의 {label} 유동인구 비중 {flp['flpop'] * 100:.0f}% · 매출 비중 {flp['sales'] * 100:.0f}% — 사람은 있는데 매출로 덜 이어짐")
                score += FLPOP_BONUS_PCTP
            extra, bonus = _hinterland_evidence(bm.get("hinterland"), key, mine, unit_label)
            evidence += extra
            score += bonus
            if key in TIME_KEYS:
                area, title = "영업시간", f"{label} 매출 비중 늘리기"
                suggestion = f"{label}에 {action['hours']}과 {action['offer']}가 맞춰져 있는지 점검해 보세요."
            elif key == "share_weekend":
                area, title = "요일", "주말 매출 비중 늘리기"
                suggestion = f"주말 {action['hours']}과 주말 손님에 맞는 {action['offer']}를 점검해 보세요."
            elif key == "share_female":
                area, title = "손님층", "여성 손님 비중 늘리기"
                suggestion = f"여성 손님이 선호할 {action['offer']}와 매장 분위기·후기 노출을 점검해 보세요."
            else:
                area, title = "손님층", f"{label} 손님 비중 늘리기"
                suggestion = f"{label} 손님에게 맞는 {action['offer']}와 홍보 채널을 점검해 보세요."
            recs.append({"area": area, "title": title, "evidence": evidence, "suggestion": suggestion, "score": round(score, 1)})

    yoy = bm.get("per_store_yoy_pct")
    trend = [t for t in bm.get("trend") or [] if t.get("stores")]
    if yoy is not None and yoy <= -5:
        evidence = [f"이 {unit_label} 같은 업종 점포당 매출 전년 동기 대비 {yoy:+.1f}%"]
        suggestion = "내 매출 감소가 상권 전체 흐름과 같은 폭인지 먼저 비교해 보세요."
        if len(trend) >= 5 and trend[-5]["stores"]:
            st_change = (trend[-1]["stores"] / trend[-5]["stores"] - 1) * 100
            evidence.append(f"같은 기간 점포 수 {trend[-5]['stores']}곳 → {trend[-1]['stores']}곳 ({st_change:+.0f}%)")
            if st_change >= 5:
                suggestion += " 경쟁 점포가 늘어 매출이 나뉘었을 수 있으니 차별화 포인트를 점검해 보세요."
            elif st_change <= -5:
                suggestion += " 점포 수도 줄어 상권 수요 자체가 줄었을 수 있으니 비용 구조와 주력 손님층을 점검해 보세요."
        if abs(yoy) >= EXTREME_YOY_PCT:
            evidence.append("변동 폭이 매우 커 업종 분류·표본 변화의 영향일 수 있음(데이터 확인 필요)")
        recs.append({"area": "상권 흐름", "title": "상권 전체 하락인지 먼저 구분하기", "evidence": evidence,
                     "suggestion": suggestion, "score": round(min(abs(yoy), TREND_SCORE_CAP), 1)})

    recs.extend(_churn_recs(bm.get("churn"), unit_label, action))

    if fl.get("rank") and fl.get("peer_count", 0) >= MIN_PEERS and fl["rank"] / fl["peer_count"] > 0.7:
        recs.append({"area": "유입 전환", "title": "다니는 사람을 손님으로 바꾸기",
                     "evidence": [f"유동인구 1만 명당 매출 {fl['rank']}/{fl['peer_count']}위(하위 30%)"] + _transit_evidence(bm.get("hinterland"), unit_label),
                     "suggestion": "간판·입구 노출, 테이크아웃·포장, 지나가는 사람이 보는 가격·대표 상품 안내를 점검해 보세요.",
                     "score": round(10 * fl["rank"] / fl["peer_count"], 1)})

    fs = bm.get("franchise_share")
    if (brand is None and fs and fs["share"] is not None and fs["stores"] >= MIN_UNIT_STORES_FOR_SHARE
            and fs["share"] >= FRANCHISE_HEAVY_SHARE):
        recs.append({"area": "경쟁", "title": "프랜차이즈가 많은 곳에서 개인 가게만의 강점 만들기",
                     "evidence": [f"이 {unit_label} 같은 업종 {fs['stores']}곳 중 프랜차이즈 {fs['frc_stores']}곳({fs['share'] * 100:.0f}%)"
                                  + (f", 비교군 중앙값 {fs['peer_median'] * 100:.0f}%" if fs.get("peer_median") is not None else "")],
                     "suggestion": f"가격 경쟁보다 프랜차이즈가 하기 어려운 {action['offer']}·단골 관리·지역 맞춤 서비스를 점검해 보세요.",
                     "score": round(fs["share"] * 20, 1)})

    if brand and brand.get("churn_rate") is not None and brand["churn_rate"] >= BRAND_CHURN_HIGH:
        recs.append({"area": "브랜드", "title": "브랜드 가맹점 이탈 현황 확인하기",
                     "evidence": [f"'{brand['brand']}' {brand['year']}년 가맹점 {brand['frcs_cnt']:.0f}곳 중 계약 종료·해지 "
                                  f"{(brand['end_cnt'] or 0) + (brand['cancel_cnt'] or 0):.0f}곳({brand['churn_rate'] * 100:.1f}%) — 공정위 전국 자료"],
                     "suggestion": "본사 지원(판촉·원가)·계약 조건·영업지역 보호 범위를 가맹본부와 점검해 보세요. 매장 개별 평가는 아닙니다.",
                     "score": round(brand["churn_rate"] * 60, 1)})

    recs.sort(key=lambda r: -r["score"])
    return recs[:MAX_RECS]


def _transit_evidence(hl: dict | None, unit_label: str) -> list[str]:
    fac = (hl or {}).get("facility") or {}
    items = {it["key"]: it for it in fac.get("items", [])}
    # 비교 단위 중앙값보다 많을 때만 근거로 쓴다(행정동은 버스정류장 수십 곳이 보통이라 개수만으로는 의미가 없다).
    parts = [f"{name} {it['count']}곳(중앙값 {it['peer_median']:g}곳)"
             for k, name in (("fac_subway", "지하철역"), ("fac_bus_stop", "버스정류장"))
             if (it := items.get(k)) and it.get("peer_median") is not None and it["count"] > it["peer_median"]]
    return [f"이 {unit_label} 안 " + "·".join(parts) + " — 교통시설이 많아 지나가는 사람이 많은 자리"] if parts else []


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


def _hinterland_evidence(hl: dict | None, key: str, mine: float, unit_label: str) -> tuple[list[str], float]:
    """손님층·시간대 제안에 직장·상주인구 근거를 붙이고 가산점을 준다. 근거가 약하면 그 사실도 적는다."""
    if not hl:
        return [], 0.0
    label = SHARE_LABELS_SHORT.get(key, key)
    ds = _demand_share(hl, key)
    if ds is not None:
        share, total = ds
        gap = (share - mine) * 100
        if gap >= HINTERLAND_GAP_PCTP:
            return [f"이 {unit_label} 직장·상주인구 {total:,}명 중 {label} {share * 100:.0f}% · 매출 비중 {mine * 100:.0f}% "
                    "— 주변에 있는 손님층이 매출로 덜 이어짐"], HINTERLAND_BONUS
        if gap <= -HINTERLAND_GAP_PCTP:
            return [f"이 {unit_label} 직장·상주인구 중 {label}은 {share * 100:.0f}%로 많지 않아, 주변 밖에서 오게 하는 홍보·배달·예약 채널이 함께 필요"], 0.0
        return [], 0.0
    med = hl.get("peer_median") or {}
    wrc, rep = hl.get("workplace"), hl.get("resident")
    if key in WORKER_TIME_KEYS and wrc and med.get("workplace") and wrc["total"] >= med["workplace"] * LARGE_POP_RATIO:
        return [f"이 {unit_label} 직장인구 {wrc['total']:,}명({hl['peer_label']} 중앙값 {med['workplace']:,.0f}명) — 점심 수요 기반이 큼"], LARGE_POP_BONUS
    if key in RESIDENT_TIME_KEYS and rep and med.get("resident") and rep["total"] >= med["resident"] * LARGE_POP_RATIO:
        hh = f"·{rep['households']:,.0f}세대" if rep.get("households") else ""
        return [f"이 {unit_label} 상주인구 {rep['total']:,}명{hh}({hl['peer_label']} 중앙값 {med['resident']:,.0f}명) — 저녁·주말 동네 수요 기반이 큼"], LARGE_POP_BONUS
    return [], 0.0


def _churn_flag(ch: dict, kind: str) -> float | None:
    """비교군 상위 25% 이상 + 중앙값보다 5%p 이상 높고 1년 2곳 이상이면 (중앙값 대비 %p 차) 를 돌려준다."""
    rate, med, p75 = ch[f"{kind}_rate"], ch[f"peer_median_{kind}"], ch[f"peer_p75_{kind}"]
    count = ch["opened" if kind == "open" else "closed"]
    if rate is None or med is None or p75 is None or count < MIN_CHURN_EVENTS:
        return None
    gap = (rate - med) * 100
    return gap if rate >= p75 and gap >= CHURN_GAP_PCTP else None


def _churn_recs(ch: dict | None, unit_label: str, action: dict) -> list[dict]:
    if not ch or ch.get("peer_count", 0) < MIN_PEERS:
        return []
    o_gap, c_gap = _churn_flag(ch, "open"), _churn_flag(ch, "close")
    base = (f"최근 1년({ch['period']}) 이 {unit_label} 같은 업종 평균 {ch['avg_stores']:g}곳 중 "
            f"개업 {ch['opened']}곳 · 폐업 {ch['closed']}곳")
    o_ev = f"연 개업률 {ch['open_rate'] * 100:.0f}% vs 비교 단위 중앙값 {ch['peer_median_open'] * 100:.0f}%"
    c_ev = f"연 폐업률 {ch['close_rate'] * 100:.0f}% vs 비교 단위 중앙값 {ch['peer_median_close'] * 100:.0f}%"
    if o_gap is not None and c_gap is not None:
        return [{"area": "개폐업", "title": "가게가 자주 바뀌는 자리 — 오래 버티는 가게와의 차이 찾기",
                 "evidence": [base, o_ev, c_ev],
                 "suggestion": (f"새로 여는 곳도 문 닫는 곳도 많습니다. 오래 영업 중인 주변 가게의 {action['offer']}·{action['hours']}을 "
                                "살펴보고, 고정비(임대료·인건비)가 이 상권 매출 수준에서 버틸 만한지 점검해 보세요."),
                 "score": round(min(max(o_gap, c_gap), CHURN_SCORE_CAP), 1)}]
    if c_gap is not None:
        return [{"area": "개폐업", "title": "같은 업종 폐업이 많은 곳 — 비용 구조와 수요 점검",
                 "evidence": [base, c_ev],
                 "suggestion": (f"문 닫는 곳이 비교 단위보다 많습니다. 고정비 비중, 주력 손님층과 {action['offer']}가 "
                                "이 상권 수요와 맞는지 먼저 점검해 보세요."),
                 "score": round(min(c_gap, CHURN_SCORE_CAP), 1)}]
    if o_gap is not None:
        return [{"area": "개폐업", "title": "새 경쟁 가게가 계속 들어오는 곳 — 단골 지키기",
                 "evidence": [base, o_ev],
                 "suggestion": (f"새로 문 여는 같은 업종 가게가 비교 단위보다 많습니다. 근처에 새 가게가 열리는 시기에 단골 관리(재방문 혜택·안내)와 "
                                f"내 가게만의 {action['offer']}를 점검해 보세요."),
                 "score": round(min(o_gap, CHURN_SCORE_CAP), 1)}]
    return []


def report(bizes_id: str) -> dict:
    bm = sales_benchmark.benchmark(bizes_id)
    if bm["status"] != "ok":
        return {"status": bm["status"], "message": bm.get("message"), "disclaimer": DISCLAIMER}
    top = top_group_mix(bm["unit"]["level"], bm["svc_cd"])
    brand = franchise.brand_info(bizes_id)
    recs = build_recommendations(bm, top, brand)
    return {
        "status": "ok",
        "unit": bm["unit"], "svc_nm": bm["svc_nm"], "quarter_label": bm["quarter_label"],
        "benchmark": {"per_store_month": bm["per_store_month"], "rank": bm["rank"], "peer_count": bm["peer_count"]},
        "top_group": None if top is None else {k: top[k] for k in ("count", "peers", "names", "per_store_month_min")},
        "top_group_note": None if top else f"비교 단위가 {MIN_PEERS}곳 미만이라 '잘 되는 곳' 비교는 생략했습니다.",
        "recommendations": recs,
        "brand": None if brand is None else {k: brand[k] for k in ("brand", "avg_sales_month", "avg_sales_year_label")},
        "disclaimer": DISCLAIMER,
        "source": bm["source"],
    }
