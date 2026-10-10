"""분기 시계열 공통 계산 — 분기 이동과 최근 1년 연 개업률·폐업률.

동네 매출 비교(sales_benchmark)와 외식 지도·입지 비교(food_map)가 같은 기준을 쓰도록 한 곳에 둔다.
기준이 두 곳에 있으면 한쪽만 바뀌어 같은 상권이 화면마다 다른 폐업률을 보이게 된다.

결측과 0 을 구분한다 — 개업·폐업·점포 수 칸이 비어 있는 것(자료 없음)을 0건·0% 로 계산하지 않는다.
"""
from __future__ import annotations

import pandas as pd

CHURN_QUARTERS = 4
MIN_CHURN_STORES = 5  # 평균 점포 수가 이보다 적으면 1~2곳 개폐업만으로 비율이 크게 튀어 비교에서 뺀다

# 연 개업·폐업 통계의 상태 — 화면은 이 값으로 '실제 0건'과 '자료 없음'·'관찰기간 부족'을 다르게 말한다.
STATUS_OK = "ok"                      # 모든 업종 집단이 4개 분기 값을 갖춤(개업·폐업이 실제 0건이어도 ok)
STATUS_PARTIAL = "partial"            # 일부 업종 집단만 갖춰 그 집단들로만 계산(전체 평균으로 오해 금지)
STATUS_MISSING = "missing_values"     # 행은 있으나 개업·폐업·점포 수 값이 결측인 분기가 있어 계산하지 않음
STATUS_SHORT = "short_period"         # 관찰 분기가 4개 미만(데이터 시작 전·신규 등)
STATUS_TOO_SMALL = "too_small"        # 평균 점포 수가 MIN_CHURN_STORES 미만
USABLE = (STATUS_OK, STATUS_PARTIAL)

STATUS_MESSAGE = {
    STATUS_MISSING: "개업·폐업 점포 수 자료가 빠진 분기가 있어 연 통계를 계산하지 않았습니다(0건이 아니라 자료 없음).",
    STATUS_SHORT: f"관찰 기간이 {CHURN_QUARTERS}개 분기보다 짧아 연 통계를 계산하지 않았습니다.",
    STATUS_TOO_SMALL: f"평균 점포 수가 {MIN_CHURN_STORES}곳 미만이라 비율을 계산하지 않았습니다.",
}


def shift_quarter(q: str, n: int) -> str:
    """'20262' 에서 n 분기 전(n<0 이면 이후)."""
    idx = int(q[:4]) * 4 + int(q[4]) - 1 - n
    return f"{idx // 4}{idx % 4 + 1}"


def quarter_label(q: str) -> str:
    return f"{q[:4]}년 {q[4]}분기"


def churn_quarters(latest: str) -> list[str]:
    """최근 1년(최신 분기 포함 4개 분기), 오래된 순."""
    return [shift_quarter(latest, n) for n in range(CHURN_QUARTERS - 1, -1, -1)]


REQUIRED = ("stores", "open_stores", "close_stores")


def annual_churn(df: pd.DataFrame, latest: str, unit_col: str, raw_col: str) -> pd.DataFrame:
    """단위별 최근 1년 개업·폐업 점포 수와 연 개업률·폐업률(비율, 0~1) + 계산 상태.

    집단 = (원 단위 raw_col, 업종). 한 집단이 '완전'하려면 최근 4개 분기 행이 모두 있고 각 행의 점포 수·개업·폐업이
    모두 값이어야 한다. 완전한 집단만 합산한다 — 빠진 분기·결측을 0 으로 더하면 0건·0% 로 보이기 때문이다.
    연 비율 = 4개 분기 합 ÷ 같은 기간 평균 점포 수.

    반환: 창 안에 행이 하나라도 있는 단위 전부(인덱스 = unit_col 값)
      opened, closed, avg_stores, open_rate, close_rate — 계산 불가면 NaN
      groups_used, groups_total — 합산에 쓴 집단 수 / 창 안 전체 집단 수
      status — STATUS_* (위 설명). USABLE 이 아니면 값 칸은 NaN.
    """
    keys = list(dict.fromkeys([unit_col, raw_col, "svc_cd"]))  # 단위와 원 단위가 같은 칸이어도 된다
    win = df.loc[df["quarter"].isin(churn_quarters(latest)), [*keys, "quarter", *REQUIRED]].copy()
    if win.empty:
        return pd.DataFrame(columns=["opened", "closed", "avg_stores", "open_rate", "close_rate", "groups_used", "groups_total", "status"])
    win["_complete_row"] = win[list(REQUIRED)].notna().all(axis=1)
    g = win.groupby(keys)
    groups = pd.DataFrame({"rows": g["quarter"].nunique(), "complete": g["_complete_row"].sum()}).reset_index()
    groups["ok"] = (groups["rows"] == CHURN_QUARTERS) & (groups["complete"] == CHURN_QUARTERS)
    groups["has_missing"] = (groups["rows"] == CHURN_QUARTERS) & ~groups["ok"]  # 행은 4개인데 값이 비어 있음
    ok_keys = groups.loc[groups["ok"], keys]
    used = win.merge(ok_keys, on=keys)
    u = used.groupby(unit_col)
    out = pd.DataFrame({"opened": u["open_stores"].sum(), "closed": u["close_stores"].sum(), "avg_stores": u["stores"].sum() / CHURN_QUARTERS})
    by_unit = groups.groupby(unit_col)
    info = pd.DataFrame({"groups_used": by_unit["ok"].sum(), "groups_total": by_unit.size(), "any_missing": by_unit["has_missing"].any()})
    out = info.join(out, how="left")
    out["groups_used"] = out["groups_used"].astype(int)

    status = pd.Series(STATUS_OK, index=out.index, dtype=object)
    status[out["groups_used"] < out["groups_total"]] = STATUS_PARTIAL
    status[out["groups_used"] == 0] = STATUS_SHORT
    status[(out["groups_used"] == 0) & out["any_missing"]] = STATUS_MISSING
    status[(out["groups_used"] > 0) & (out["avg_stores"] < MIN_CHURN_STORES)] = STATUS_TOO_SMALL
    usable = status.isin(USABLE)
    out["open_rate"] = (out["opened"] / out["avg_stores"]).where(usable)
    out["close_rate"] = (out["closed"] / out["avg_stores"]).where(usable)
    for c in ("opened", "closed", "avg_stores"):
        out[c] = out[c].where(out["groups_used"] > 0)
    out["status"] = status
    return out.drop(columns="any_missing")


def usable(churn: pd.DataFrame) -> pd.DataFrame:
    """비교 분포·표시에 쓸 수 있는(계산된) 단위만."""
    return churn.loc[churn["status"].isin(USABLE)]
