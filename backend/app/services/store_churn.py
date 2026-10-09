"""분기 시계열 공통 계산 — 분기 이동과 최근 1년 연 개업률·폐업률.

동네 매출 비교(sales_benchmark)와 외식 지도·입지 비교(food_map)가 같은 기준을 쓰도록 한 곳에 둔다.
기준이 두 곳에 있으면 한쪽만 바뀌어 같은 상권이 화면마다 다른 폐업률을 보이게 된다.
"""
from __future__ import annotations

import pandas as pd

CHURN_QUARTERS = 4
MIN_CHURN_STORES = 5  # 평균 점포 수가 이보다 적으면 1~2곳 개폐업만으로 비율이 크게 튀어 비교에서 뺀다


def shift_quarter(q: str, n: int) -> str:
    """'20262' 에서 n 분기 전(n<0 이면 이후)."""
    idx = int(q[:4]) * 4 + int(q[4]) - 1 - n
    return f"{idx // 4}{idx % 4 + 1}"


def quarter_label(q: str) -> str:
    return f"{q[:4]}년 {q[4]}분기"


def churn_quarters(latest: str) -> list[str]:
    """최근 1년(최신 분기 포함 4개 분기), 오래된 순."""
    return [shift_quarter(latest, n) for n in range(CHURN_QUARTERS - 1, -1, -1)]


def annual_churn(df: pd.DataFrame, latest: str, unit_col: str, raw_col: str) -> pd.DataFrame:
    """단위별 최근 1년 개업·폐업 점포 수와 연 개업률·폐업률(비율, 0~1).

    - 4개 분기가 모두 있는 (원 단위 raw_col, 업종) 행만 합산한다 — 점포 3곳 미만 비공개 등으로 어떤 분기 행이
      빠지면 합계·평균이 가짜로 출렁이기 때문이다.
    - 연 비율 = 4개 분기 합 ÷ 같은 기간 평균 점포 수. 평균 점포 수가 MIN_CHURN_STORES 미만인 단위는 결과에서 뺀다.
    반환: 인덱스 = unit_col 값, 칸 = opened, closed, avg_stores, open_rate, close_rate.
    """
    win = df.loc[df["quarter"].isin(churn_quarters(latest))]
    full = win.groupby([raw_col, "svc_cd"])["quarter"].transform("nunique") == CHURN_QUARTERS
    g = win.loc[full].groupby(unit_col)
    out = pd.DataFrame({"opened": g["open_stores"].sum(), "closed": g["close_stores"].sum(),
                        "avg_stores": g["stores"].sum() / CHURN_QUARTERS})
    out = out.loc[out["avg_stores"] >= MIN_CHURN_STORES]
    return out.assign(open_rate=out["opened"] / out["avg_stores"], close_rate=out["closed"] / out["avg_stores"])
