"""단위(자치구·행정동·상권)별 지표 계산 — 결측과 0 을 구분하고, 계산에 쓴 범위를 함께 돌려준다.

입력 표(서울시 상권분석서비스, 분기 × 단위 × 업종 1행)의 칸이 비어 있을 수 있다:
  - 매출은 있는데 점포 수가 없음(결측) / 점포 수가 0 / 개업·폐업·프랜차이즈 수가 없음 / 유동인구가 없음
pandas 의 합계는 결측을 0 으로 건너뛰므로, 분자와 분모를 따로 더하면 서로 다른 집단 범위로 나눗셈하게 된다
(예: 점포 10곳·매출 9,000만 원 집단 + 점포 수 없는 매출 9,000만 원 집단 → 점포당 월 600만 원으로 부풀음).
그래서 각 지표는 '필요한 칸이 모두 값인 집단(행)'만 분자·분모에 함께 넣고, 몇 집단 중 몇 집단을 썼는지
(used/total)와 제외된 매출 비중, 값이 없을 때의 사유(reason)를 같이 돌려준다. 값이 없으면 NaN → 화면의 '자료 없음'.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from app.services import store_churn

MIN_STORES_FOR_RATE = 3          # 점포 3곳 미만이면 분기 개업률·폐업률·프랜차이즈 비율은 1~2곳 차이로 튀어 계산하지 않는다
DYNAMICS_QUARTERS = 8            # 상권 시계열이 8개 분기라 두 단위 모두 같은 창(최근 2년)을 쓴다
MIN_STORES_FOR_YOY = 10          # 매출 증감률은 비교에 쓴 업종의 점포가 (이번·전년 동기 중 적은 쪽) 10곳 미만이면 몇 곳의 변화만으로 수백 %가 튀어 계산하지 않는다
YOY_CAUTION_BELOW = 20           # 비교 점포 10~19곳은 값은 보이되 '소규모 상권: 변동성 주의'를 붙인다(20곳 이상은 일반 표시)
MIN_STORES_FOR_VOLATILITY = 10   # 평균 10곳 미만은 1~2곳 증감만으로 변동폭이 크게 튀어 '자료 없음'으로 둔다

NO_ROWS = "no_rows"
MISSING_INPUTS = "missing_inputs"
ZERO_STORES = "zero_stores"
TOO_FEW_STORES = "too_few_stores"
SHORT_PERIOD = "short_period"
NO_COMPARE = "no_compare"
REASON_TEXT = {
    NO_ROWS: "이 업종·조건의 매출 자료가 없어요",
    MISSING_INPUTS: "필요한 값(매출·점포 수 등)이 원천에서 비어 있어 계산하지 않음(0 이 아니라 자료 없음)",
    ZERO_STORES: "점포 수가 0 이라 점포당·비율 값을 계산할 수 없음",
    TOO_FEW_STORES: "점포가 너무 적어(표본 작음) 비율·증감률을 계산하지 않음",
    SHORT_PERIOD: "관찰 기간이 부족해 계산하지 않음",
    NO_COMPARE: "비교 분기(전년 동기·직전 분기)의 자료가 없어 계산하지 않음",
}
COLUMNS = ["value", "used", "total", "excluded_sales_share", "reason"]


def _frame(index: pd.Index) -> pd.DataFrame:
    return pd.DataFrame({"value": np.nan, "used": 0, "total": 0, "excluded_sales_share": np.nan, "reason": None}, index=index)


def _reasons(frame: pd.DataFrame, missing: pd.Series, zero: pd.Series) -> pd.Series:
    """값이 없는 단위마다 사유 하나."""
    reason = pd.Series(None, index=frame.index, dtype=object)
    no_value = frame["value"].isna()
    reason[no_value & (frame["total"] == 0)] = NO_ROWS
    reason[no_value & (frame["total"] > 0) & (frame["used"] == 0) & (zero > 0) & (missing == 0)] = ZERO_STORES
    reason[no_value & (frame["total"] > 0) & (frame["used"] == 0) & (missing > 0)] = MISSING_INPUTS
    reason[no_value & (frame["used"] > 0)] = TOO_FEW_STORES
    return reason


def growth_status(sample) -> str:
    """증감률 표시 정책 — 지도 상권분석과 매장 상세가 함께 쓴다.

    sample = 비교하는 두 분기(이번 분기와 전년 동기, 또는 이번 분기와 직전 분기)의 점포 수 중 작은 값.
      없음/결측 → no_compare(비교 분기 자료 없음) · 10곳 미만 → too_few(산출 제외) · 10~19곳 → caution(변동성 주의) · 20곳 이상 → ok
    """
    if sample is None or pd.isna(sample):
        return "no_compare"
    if sample < MIN_STORES_FOR_YOY:
        return "too_few"
    return "caution" if sample < YOY_CAUTION_BELOW else "ok"


def per_store_growth(per_store_now, stores_now, per_store_cmp, stores_cmp) -> dict:
    """점포당 평균매출(분기) 증감률 — 총매출 증감과는 다른 지표다(점포 수 변화가 분모에 반영됨). 같은 표본 정책을 쓴다.

    값은 (이번 점포당 ÷ 비교 점포당 − 1) × 100. 비교 분기 값이 없거나 0 이면 no_compare.
    """
    ok = all(v is not None and not pd.isna(v) for v in (per_store_now, per_store_cmp, stores_now, stores_cmp)) and per_store_cmp > 0
    sample = min(stores_now, stores_cmp) if ok else None
    status = growth_status(sample)
    value = (per_store_now / per_store_cmp - 1) * 100 if status in ("ok", "caution") else None
    return {"value": None if value is None else round(float(value), 2), "status": status, "sample": None if sample is None else int(sample)}


def ratio_metric(now: pd.DataFrame, key: str, num: str, den: str, *, scale: float = 1.0, min_den: float = 0.0,
                 share_of_sales: bool = False) -> pd.DataFrame:
    """Σ분자 ÷ Σ분모 × scale — 분자·분모가 모두 값이고 분모가 0 보다 큰 집단(행)만 함께 합산한다.

    share_of_sales: 매출이 분자일 때, 제외된 집단의 매출이 전체 매출에서 차지하는 비중도 계산한다.
    """
    out = _frame(pd.Index(now[key].unique()))
    ok = now[num].notna() & now[den].notna() & (now[den] > 0)
    g = now.loc[ok].groupby(key)
    n, d = g[num].sum(), g[den].sum()
    out["total"] = now.groupby(key).size()
    out["used"] = g.size().reindex(out.index).fillna(0).astype(int)
    out["value"] = (n / d.where(d > 0) * scale).where(d >= max(min_den, np.finfo(float).tiny)).reindex(out.index)
    if share_of_sales:
        sales_all = now.groupby(key)["sales_q"].sum()
        sales_out = now.loc[~ok].groupby(key)["sales_q"].sum()
        out["excluded_sales_share"] = (sales_out / sales_all.where(sales_all > 0)).reindex(out.index).fillna(0.0).where(sales_all.reindex(out.index) > 0)
    missing = (now[num].isna() | now[den].isna()).groupby(now[key]).sum().reindex(out.index).fillna(0)
    zero = ((now[den] == 0) & now[num].notna()).groupby(now[key]).sum().reindex(out.index).fillna(0)
    out["reason"] = _reasons(out, missing, zero)
    return out


def sales_per_flpop(now: pd.DataFrame, key: str, raw: str) -> pd.DataFrame:
    """유동인구 1만 명당 분기 매출 — 매출과 유동인구가 모두 있는 원 단위의 매출만, 그 단위들의 유동인구와 함께."""
    out = _frame(pd.Index(now[key].unique()))
    ok = now["sales_q"].notna() & now["flpop"].notna() & (now["flpop"] > 0)
    used = now.loc[ok]
    sales = used.groupby(key)["sales_q"].sum()
    flpop = used.drop_duplicates([key, raw]).groupby(key)["flpop"].sum()  # 유동인구는 업종과 무관한 단위 값 — 업종 행마다 더하지 않는다
    out["total"] = now.groupby(key).size()
    out["used"] = used.groupby(key).size().reindex(out.index).fillna(0).astype(int)
    out["value"] = (sales / flpop.where(flpop > 0) * 1e4).reindex(out.index)
    sales_all = now.groupby(key)["sales_q"].sum()
    out["excluded_sales_share"] = (now.loc[~ok].groupby(key)["sales_q"].sum() / sales_all.where(sales_all > 0)).reindex(out.index).fillna(0.0).where(sales_all.reindex(out.index) > 0)
    missing = (now["sales_q"].isna() | now["flpop"].isna()).groupby(now[key]).sum().reindex(out.index).fillna(0)
    out["reason"] = _reasons(out, missing, pd.Series(0, index=out.index))
    return out


def sales_yoy(now: pd.DataFrame, ago: pd.DataFrame, key: str, raw: str) -> pd.DataFrame:
    """비교 분기(전년 동기 또는 직전 분기) 대비 총매출 증감률(명목) — 이번·전년 동기 매출이 모두 값인 (원 단위·업종)만 양쪽에서 합산한다.

    점포 수 변화가 섞인 총매출 증감이고 물가는 보정하지 않는다. 비교에 쓴 업종의 점포가 두 분기 중 적은 쪽이 10곳 미만이면
    표본이 너무 작아 값을 계산하지 않는다(사유 too_few_stores).
    """
    out = _frame(pd.Index(now[key].unique()))
    cols = [raw, "svc_cd"]
    a = now.loc[now["sales_q"].notna(), [key, *cols, "sales_q", "stores"]]
    b = ago.loc[ago["sales_q"].notna(), [*cols, "sales_q", "stores"]]
    both = a.merge(b, on=cols, suffixes=("", "_ago"))
    g = both.groupby(key)
    out["total"] = now.groupby(key).size()
    out["used"] = g.size().reindex(out.index).fillna(0).astype(int)
    base = g["sales_q_ago"].sum()
    # 점포 수는 값이 있는 칸만 더한다(결측을 0 으로 세지 않음). 둘 중 적은 쪽을 표본 크기로 본다.
    sample = pd.concat([g["stores"].sum(), g["stores_ago"].sum()], axis=1).min(axis=1).reindex(out.index)
    out["sample"] = sample  # 비교에 쓴 점포 수(이번·비교 분기 중 적은 쪽) — 화면의 '변동성 주의' 판단에 쓴다
    unknown = (out["used"] > 0) & ((g["stores"].count().reindex(out.index).fillna(0) == 0) | (g["stores_ago"].count().reindex(out.index).fillna(0) == 0))
    small = (out["used"] > 0) & ~unknown & (sample < MIN_STORES_FOR_YOY)
    out["value"] = ((g["sales_q"].sum() / base.where(base > 0) - 1) * 100).reindex(out.index).where(~small & ~unknown)
    sales_all = now.groupby(key)["sales_q"].sum()
    used_sales = g["sales_q"].sum().reindex(out.index).fillna(0.0)
    out["excluded_sales_share"] = ((sales_all.reindex(out.index) - used_sales) / sales_all.reindex(out.index).where(sales_all.reindex(out.index) > 0)).clip(lower=0).where(sales_all.reindex(out.index) > 0)
    no_prev = out["value"].isna() & (out["total"] > 0) & ~small
    out["reason"] = pd.Series(None, index=out.index, dtype=object)
    # 이번 분기 매출이 비었으면 입력 결측, 그게 아닌데 비교할 쌍이 없으면 '비교 분기 자료 없음'(관찰 기간 부족과 구분)
    out.loc[no_prev, "reason"] = np.where(now["sales_q"].isna().groupby(now[key]).any().reindex(out.index)[no_prev], MISSING_INPUTS, NO_COMPARE)
    out.loc[unknown, "reason"] = MISSING_INPUTS
    out.loc[small, "reason"] = TOO_FEW_STORES
    out.loc[out["total"] == 0, "reason"] = NO_ROWS
    return out


def store_dynamics(df: pd.DataFrame, latest: str, key: str, raw: str) -> tuple[pd.DataFrame, str, pd.DataFrame]:
    """최근 8개 분기 점포 수로 단위별 2년 증감률과 분기 평균 변동폭.

    (원 단위·업종) 집단이 8개 분기 모두 행이 있고 점포 수가 값이어야 쓴다 — 어떤 분기 행이 빠지거나(점포 3곳 미만 비공개 등)
    값이 비면 합계가 가짜로 출렁이기 때문이다. 반환: (지표 두 칸, 기간 라벨, 사용 범위 표 used/total/reason).
    """
    qs = [store_churn.shift_quarter(latest, n) for n in range(DYNAMICS_QUARTERS - 1, -1, -1)]
    win = df.loc[df["quarter"].isin(qs), [key, raw, "svc_cd", "quarter", "stores"]]
    keys = list(dict.fromkeys([key, raw, "svc_cd"]))
    g = win.groupby(keys)
    groups = pd.DataFrame({"rows": g["quarter"].nunique(), "valid": g["stores"].count()}).reset_index()
    groups["ok"] = (groups["rows"] == DYNAMICS_QUARTERS) & (groups["valid"] == DYNAMICS_QUARTERS)
    groups["has_missing"] = (groups["rows"] == DYNAMICS_QUARTERS) & ~groups["ok"]
    by_unit = groups.groupby(key)
    cov = pd.DataFrame({"used": by_unit["ok"].sum().astype(int), "total": by_unit.size(), "any_missing": by_unit["has_missing"].any()})
    cov["reason"] = np.where(cov["used"] > 0, None, np.where(cov["any_missing"], MISSING_INPUTS, SHORT_PERIOD))
    cov = cov.drop(columns="any_missing")
    used = win.merge(groups.loc[groups["ok"], keys], on=keys)
    tot = used.groupby([key, "quarter"])["stores"].sum().unstack().reindex(columns=qs)
    values = pd.DataFrame(index=cov.index, columns=["stores_change_2y", "stores_volatility"], dtype=float)
    if not tot.empty:
        change = (tot[qs[-1]] / tot[qs[0]].replace(0, np.nan) - 1) * 100
        vol = (tot.pct_change(axis=1).abs().iloc[:, 1:].mean(axis=1) * 100).where(tot.mean(axis=1) >= MIN_STORES_FOR_VOLATILITY)
        values["stores_change_2y"] = change.reindex(values.index)
        values["stores_volatility"] = vol.reindex(values.index)
    period = f"{store_churn.quarter_label(qs[0])}~{store_churn.quarter_label(qs[-1])}"
    return values, period, cov


def annual_churn_metrics(df: pd.DataFrame, latest: str, key: str, raw: str) -> dict[str, pd.DataFrame]:
    """최근 1년 연 개업률·폐업률(%) — store_churn 의 상태(자료 없음·관찰기간 부족·점포 적음·일부 집단만)를 사유로 옮긴다."""
    c = store_churn.annual_churn(df, latest, key, raw)
    reason = c["status"].map({store_churn.STATUS_MISSING: MISSING_INPUTS, store_churn.STATUS_SHORT: SHORT_PERIOD,
                              store_churn.STATUS_TOO_SMALL: TOO_FEW_STORES}).where(~c["status"].isin(store_churn.USABLE))
    base = pd.DataFrame({"used": c["groups_used"], "total": c["groups_total"], "excluded_sales_share": np.nan, "reason": reason})
    return {"open_rate_y": base.assign(value=c["open_rate"] * 100)[COLUMNS], "close_rate_y": base.assign(value=c["close_rate"] * 100)[COLUMNS]}


def latest_metrics(df: pd.DataFrame, latest: str, key: str = "_unit", raw: str = "_unit_raw") -> tuple[dict[str, pd.DataFrame], str]:
    """최신 분기 기준 모든 지표의 (값·사용 범위·사유) 표와 2년 기간 라벨."""
    now = df.loc[df["quarter"] == latest]
    ago = df.loc[df["quarter"] == store_churn.shift_quarter(latest, 4)]
    m: dict[str, pd.DataFrame] = {
        "per_store_month": ratio_metric(now, key, "sales_q", "stores", scale=1 / 3, share_of_sales=True),
        "sales_per_10k_flpop": sales_per_flpop(now, key, raw),
        "sales_yoy_pct": sales_yoy(now, ago, key, raw),
        "open_rate": ratio_metric(now, key, "open_stores", "stores", scale=100.0, min_den=MIN_STORES_FOR_RATE),
        "close_rate": ratio_metric(now, key, "close_stores", "stores", scale=100.0, min_den=MIN_STORES_FOR_RATE),
        "frc_share": ratio_metric(now, key, "frc_stores", "stores", scale=100.0, min_den=MIN_STORES_FOR_RATE),
    }
    values, period, dyn_cov = store_dynamics(df, latest, key, raw)
    for name in ("stores_change_2y", "stores_volatility"):
        f = dyn_cov.assign(value=values[name], excluded_sales_share=np.nan)[COLUMNS].copy()
        small = f["value"].isna() & (f["used"] > 0)
        f.loc[small, "reason"] = TOO_FEW_STORES
        m[name] = f
    m.update(annual_churn_metrics(df, latest, key, raw))
    return m, period
