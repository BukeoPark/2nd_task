"""매출 개선 리포트 — 외부 AI 없이 규칙 + '잘 되는 상권' 벤치마크로 점검 후보를 만든다.

입력은 sales_benchmark.benchmark() 결과(내 상권·행정동의 매출 구성, 유동인구, 추이)와
같은 업종에서 점포당 매출 상위 25%인 비교 단위들의 매출 구성 평균이다.
제안은 '데이터로 찾은 점검 후보'이며 매출 증가를 보장하지 않는다. 사장님 매출은 서버로 받지 않는다.
"""
from __future__ import annotations

import pandas as pd

from app.services import data_store, sales_benchmark

TOP_SHARE = 0.25
MIN_TOP_GROUP = 3
MIN_PEERS = 8
GAP_PCTP = 5.0
FLPOP_BONUS_PCTP = 5.0
MAX_RECS = 5
TREND_SCORE_CAP = 30.0
EXTREME_YOY_PCT = 50.0
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


def build_recommendations(bm: dict, top: dict | None) -> list[dict]:
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

    if fl.get("rank") and fl.get("peer_count", 0) >= MIN_PEERS and fl["rank"] / fl["peer_count"] > 0.7:
        recs.append({"area": "유입 전환", "title": "다니는 사람을 손님으로 바꾸기",
                     "evidence": [f"유동인구 1만 명당 매출 {fl['rank']}/{fl['peer_count']}위(하위 30%)"],
                     "suggestion": "간판·입구 노출, 테이크아웃·포장, 지나가는 사람이 보는 가격·대표 상품 안내를 점검해 보세요.",
                     "score": round(10 * fl["rank"] / fl["peer_count"], 1)})

    recs.sort(key=lambda r: -r["score"])
    return recs[:MAX_RECS]


def report(bizes_id: str) -> dict:
    bm = sales_benchmark.benchmark(bizes_id)
    if bm["status"] != "ok":
        return {"status": bm["status"], "message": bm.get("message"), "disclaimer": DISCLAIMER}
    top = top_group_mix(bm["unit"]["level"], bm["svc_cd"])
    recs = build_recommendations(bm, top)
    return {
        "status": "ok",
        "unit": bm["unit"], "svc_nm": bm["svc_nm"], "quarter_label": bm["quarter_label"],
        "benchmark": {"per_store_month": bm["per_store_month"], "rank": bm["rank"], "peer_count": bm["peer_count"]},
        "top_group": None if top is None else {k: top[k] for k in ("count", "peers", "names", "per_store_month_min")},
        "top_group_note": None if top else f"비교 단위가 {MIN_PEERS}곳 미만이라 '잘 되는 곳' 비교는 생략했습니다.",
        "recommendations": recs,
        "disclaimer": DISCLAIMER,
        "source": bm["source"],
    }
