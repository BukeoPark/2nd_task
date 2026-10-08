"""서울시 추정매출·점포수·유동인구 분기 시계열 → 점포당 평균 매출, 증감률, 매출 구성, 유동인구 대비 매출.

실행: .venv/bin/python -m pipelines.transform.build_sales_timeseries [--level dong|trdar]
  dong  (기본) 파일럿 36개 행정동
  trdar        파일럿 구의 상권(골목·발달·전통시장, build_trdar_areas 산출물) — 행정동보다 촘촘한 비교용
입력: data/raw/seoul/<매출·점포·(상권)유동인구>_<분기>_<수집일>.json (분기별 최신 파일)
      dong : data/processed/{dong_crosswalk,seoul_floating_pop}.parquet
      trdar: data/processed/trdar_areas.parquet
출력: data/processed/{dong|trdar}_industry_sales.parquet  분기 × 단위 × 서비스업종 1행 (+ 유동인구 1만 명당 매출)
      data/processed/{dong|trdar}_floating_pop.parquet    분기 × 단위 유동인구 총량·구성비·전년 동기 대비
      data/processed/dong_sales_growth.parquet           (dong 만) 행정동별 최신 분기 매출 증감률(업종 합계)
      outputs/tables/sales_timeseries_<level>_log.csv     제외·보정 기준과 건수

해석 기준
  - 매출(THSMON_SELNG_AMT, 칼럼명은 '당월_매출_금액')은 분기 합계로 해석한다. 서울 열린데이터광장 안내:
    '분기 매출 금액은 개인 매출과 법인 매출의 합'. 월평균은 3으로 나눈다.
  - 점포당 평균의 분모는 유사업종 점포수(SIMILR_INDUTY_STOR_CO = 일반 점포 + 프랜차이즈, 실제 데이터로 확인).
  - 프랜차이즈 비율 = FRC_STOR_CO ÷ 유사업종 점포수. 개업·폐업 점포수/률(OPBIZ_*, CLSBIZ_*)은 서울시 원천 값을 그대로 싣는다.
  - 성별·연령 매출에는 법인 매출이 없어 합계와 다를 수 있다 → 구성비는 해당 항목들의 합을 분모로 쓴다.
  - 행정동 전체 증감률은 두 분기에 모두 있는 업종만 합산한다(업종 구성 변화로 생기는 착시 방지).
  - 유동인구(TOT_FLPOP_CO)는 서울시·KT 생활인구를 길 단위로 배분한 추정치다. 시간대 합 = 요일 합 = 총계라
    실제 행인 수가 아니라 단위끼리 비교하는 상대 지수로 쓴다. '유동인구 1만 명당 매출' = 분기 매출 ÷ 유동인구 × 10,000.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import numpy as np
import pandas as pd

from pipelines.common import config

RAW = config.RAW_DIR / "seoul"
TIME_COLS = ["TMZON_00_06_SELNG_AMT", "TMZON_06_11_SELNG_AMT", "TMZON_11_14_SELNG_AMT",
             "TMZON_14_17_SELNG_AMT", "TMZON_17_21_SELNG_AMT", "TMZON_21_24_SELNG_AMT"]
AGE_COLS = ["AGRDE_10_SELNG_AMT", "AGRDE_20_SELNG_AMT", "AGRDE_30_SELNG_AMT",
            "AGRDE_40_SELNG_AMT", "AGRDE_50_SELNG_AMT", "AGRDE_60_ABOVE_SELNG_AMT"]

LEVELS = {
    "dong": {"code": "ADSTRD_CD", "name": "ADSTRD_CD_NM", "out_cd": "adongCd", "out_nm": "adongNm", "label": "행정동",
             "sales": "sales_VwsmAdstrdSelngW", "stores": "stores_VwsmAdstrdStorW", "flpop": None},
    "trdar": {"code": "TRDAR_CD", "name": "TRDAR_CD_NM", "out_cd": "trdar_cd", "out_nm": "trdar_nm", "label": "상권",
              "sales": "trdar_sales_VwsmTrdarSelngQq", "stores": "trdar_stores_VwsmTrdarStorQq",
              "flpop": "trdar_flpop_VwsmTrdarFlpopQq"},
}


def _latest_per_quarter(prefix: str) -> list[Path]:
    latest: dict[str, Path] = {}
    for p in sorted(RAW.glob(f"{prefix}_*.json")):
        m = re.match(rf"{re.escape(prefix)}_(\d{{5}})_\d{{8}}\.json$", p.name)
        if m:
            latest[m.group(1)] = p
    return [latest[q] for q in sorted(latest)]


def _load(prefix: str, code_col: str, units: set[str], key: list[str], log: list) -> pd.DataFrame:
    frames = []
    for p in _latest_per_quarter(prefix):
        env = json.loads(p.read_text(encoding="utf-8"))
        df = pd.DataFrame(env["rows"])
        if env["item_count"] != env["total_count"]:
            log.append((f"{p.name}: 수집 {env['item_count']} != 원천 {env['total_count']}", env["total_count"] - env["item_count"]))
        frames.append(df.loc[df[code_col].isin(units)])
    out = pd.concat(frames, ignore_index=True)
    dup = out.duplicated(key, keep="last")
    log.append((f"{prefix}: 중복 행 제거", int(dup.sum())))
    return out.loc[~dup]


def _shift_quarter(q: str, n: int) -> str:
    idx = int(q[:4]) * 4 + int(q[4]) - 1 - n
    return f"{idx // 4}{idx % 4 + 1}"


def _floating_pop(f: pd.DataFrame, code_col: str, out_cd: str, log: list) -> pd.DataFrame:
    f = f.drop_duplicates(["STDR_YYQU_CD", code_col], keep="last").copy()
    cols = [c for c in f.columns if c.endswith("_FLPOP_CO")]
    f[cols] = f[cols].apply(pd.to_numeric, errors="coerce")
    out = pd.DataFrame({"quarter": f["STDR_YYQU_CD"], out_cd: f[code_col], "flpop": f["TOT_FLPOP_CO"]})
    days = f[["MON_FLPOP_CO", "TUES_FLPOP_CO", "WED_FLPOP_CO", "THUR_FLPOP_CO", "FRI_FLPOP_CO", "SAT_FLPOP_CO", "SUN_FLPOP_CO"]]
    out["share_weekend"] = (f["SAT_FLPOP_CO"] + f["SUN_FLPOP_CO"]) / days.sum(axis=1).replace(0, np.nan)
    out["share_female"] = f["FML_FLPOP_CO"] / (f["ML_FLPOP_CO"] + f["FML_FLPOP_CO"]).replace(0, np.nan)
    tcols = [c for c in cols if c.startswith("TMZON_")]
    for c in tcols:
        out["share_t" + c.split("_")[1] + "_" + c.split("_")[2]] = f[c] / f[tcols].sum(axis=1).replace(0, np.nan)
    acols = [c for c in cols if c.startswith("AGRDE_")]
    for c in acols:
        out["share_age" + c.split("_")[1]] = f[c] / f[acols].sum(axis=1).replace(0, np.nan)
    prev = out[["quarter", out_cd, "flpop"]].assign(quarter=lambda d: d["quarter"].map(lambda q: _shift_quarter(q, -4)))
    out = out.merge(prev.rename(columns={"flpop": "_prev"}), on=["quarter", out_cd], how="left")
    out["flpop_yoy_pct"] = ((out["flpop"] / out["_prev"] - 1) * 100).round(2)
    log.append(("유동인구: 분기×단위 행 수", len(out)))
    return out.drop(columns=["_prev"]).sort_values(["quarter", out_cd]).reset_index(drop=True)


def build(level: str) -> None:
    lv = LEVELS[level]
    code, out_cd, out_nm = lv["code"], lv["out_cd"], lv["out_nm"]
    log: list[tuple[str, int]] = []
    if level == "dong":
        units = set(pd.read_parquet(config.PROCESSED_DIR / "dong_crosswalk.parquet")["adongCd"])
    else:
        units = set(pd.read_parquet(config.PROCESSED_DIR / "trdar_areas.parquet")["trdar_cd"])
    key = ["STDR_YYQU_CD", code, "SVC_INDUTY_CD"]

    sales = _load(lv["sales"], code, units, key, log)
    stores = _load(lv["stores"], code, units, key, log)
    num = ["THSMON_SELNG_AMT", "THSMON_SELNG_CO", "MDWK_SELNG_AMT", "WKEND_SELNG_AMT", "ML_SELNG_AMT", "FML_SELNG_AMT",
           *TIME_COLS, *AGE_COLS]
    sales[num] = sales[num].apply(pd.to_numeric, errors="coerce")
    store_cols = ["SIMILR_INDUTY_STOR_CO", "FRC_STOR_CO", "OPBIZ_STOR_CO", "CLSBIZ_STOR_CO", "OPBIZ_RT", "CLSBIZ_RT"]
    stores[store_cols] = stores[store_cols].apply(pd.to_numeric, errors="coerce")

    df = sales.merge(stores[[*key, *store_cols]], on=key, how="left")
    no_store = df["SIMILR_INDUTY_STOR_CO"].isna() | (df["SIMILR_INDUTY_STOR_CO"] <= 0)
    log.append(("매출은 있으나 점포수 0·없음 → 점포당 평균 계산 불가(행 유지)", int(no_store.sum())))

    out = pd.DataFrame({
        "quarter": df["STDR_YYQU_CD"], out_cd: df[code], out_nm: df[lv["name"]],
        "svc_cd": df["SVC_INDUTY_CD"], "svc_nm": df["SVC_INDUTY_CD_NM"],
        "sales_q": df["THSMON_SELNG_AMT"], "tx_count_q": df["THSMON_SELNG_CO"],
        "stores": df["SIMILR_INDUTY_STOR_CO"],
        "frc_stores": df["FRC_STOR_CO"],
        "open_stores": df["OPBIZ_STOR_CO"], "close_stores": df["CLSBIZ_STOR_CO"],
        "open_rate": df["OPBIZ_RT"], "close_rate": df["CLSBIZ_RT"],
    })
    out["frc_share"] = out["frc_stores"] / out["stores"].replace(0, np.nan)
    out["per_store_q"] = np.where(no_store, np.nan, out["sales_q"] / out["stores"])
    out["per_store_month"] = out["per_store_q"] / 3
    wk = df["MDWK_SELNG_AMT"] + df["WKEND_SELNG_AMT"]
    out["share_weekend"] = df["WKEND_SELNG_AMT"] / wk.replace(0, np.nan)
    gender = df["ML_SELNG_AMT"] + df["FML_SELNG_AMT"]
    out["share_female"] = df["FML_SELNG_AMT"] / gender.replace(0, np.nan)
    tsum = df[TIME_COLS].sum(axis=1).replace(0, np.nan)
    for c in TIME_COLS:
        out["share_t" + c.split("_")[1] + "_" + c.split("_")[2]] = df[c] / tsum
    asum = df[AGE_COLS].sum(axis=1).replace(0, np.nan)
    for c in AGE_COLS:
        out["share_age" + c.split("_")[1]] = df[c] / asum

    # 증감률: 같은 단위·업종의 전 분기 / 전년 동기 대비 (점포당 평균과 총액)
    prev = out[["quarter", out_cd, "svc_cd", "per_store_q", "sales_q"]]
    for label, n in (("qoq", 1), ("yoy", 4)):
        shifted = prev.assign(quarter=prev["quarter"].map(lambda q, n=n: _shift_quarter(q, -n)))
        out = out.merge(shifted.rename(columns={"per_store_q": f"_ps_{label}", "sales_q": f"_s_{label}"}),
                        on=["quarter", out_cd, "svc_cd"], how="left")
        out[f"per_store_{label}_pct"] = (out["per_store_q"] / out[f"_ps_{label}"] - 1) * 100
        out[f"sales_{label}_pct"] = (out["sales_q"] / out[f"_s_{label}"] - 1) * 100
        out = out.drop(columns=[f"_ps_{label}", f"_s_{label}"])
    rate_cols = [c for c in out.columns if c.endswith("_pct")]
    out[rate_cols] = out[rate_cols].replace([np.inf, -np.inf], np.nan).round(2)

    if lv["flpop"]:
        raw_f = _load(lv["flpop"], code, units, ["STDR_YYQU_CD", code], log)
    else:
        raw_f = pd.read_parquet(config.PROCESSED_DIR / "seoul_floating_pop.parquet")
        raw_f = raw_f.loc[raw_f[code].isin(units)]
    flpop = _floating_pop(raw_f, code, out_cd, log)
    out = out.merge(flpop[["quarter", out_cd, "flpop"]], on=["quarter", out_cd], how="left")
    out["sales_per_10k_flpop"] = out["sales_q"] / out["flpop"].replace(0, np.nan) * 1e4
    log.append((f"매출 행 중 같은 분기·{lv['label']} 유동인구 없음(1만 명당 매출 계산 불가)", int(out["flpop"].isna().sum())))
    flpop.to_parquet(config.PROCESSED_DIR / f"{level}_floating_pop.parquet", index=False)

    out = out.sort_values(["quarter", out_cd, "svc_cd"], kind="stable").reset_index(drop=True)
    out.to_parquet(config.PROCESSED_DIR / f"{level}_industry_sales.parquet", index=False)
    latest = out["quarter"].max()

    if level == "dong":
        growth = []
        for dong, g in out.groupby("adongCd"):
            row = {"adongCd": dong, "latest_quarter": latest}
            now = g.loc[g["quarter"] == latest].set_index("svc_cd")["sales_q"]
            for label, n in (("qoq", 1), ("yoy", 4)):
                base_q = _shift_quarter(latest, n)
                base = g.loc[g["quarter"] == base_q].set_index("svc_cd")["sales_q"]
                common = now.index.intersection(base.index)
                row[f"sales_{label}_pct"] = round((now[common].sum() / base[common].sum() - 1) * 100, 2) if len(common) else None
                row[f"{label}_base_quarter"] = base_q
                row[f"{label}_common_svc"] = len(common)
            growth.append(row)
        pd.DataFrame(growth).to_parquet(config.PROCESSED_DIR / "dong_sales_growth.parquet", index=False)
        print(f"저장: dong_sales_growth.parquet {len(growth)}개 행정동 (기준 {latest})")

    pd.DataFrame(log, columns=["기준", "건수"]).to_csv(config.TABLES_DIR / f"sales_timeseries_{level}_log.csv", index=False)
    print(f"저장: {level}_industry_sales.parquet {len(out):,}행 / 분기 {out.quarter.min()}~{latest} "
          f"({out.quarter.nunique()}개) / {lv['label']} {out[out_cd].nunique()} / 업종 {out.svc_cd.nunique()}")
    for k, v in log:
        print(f"  - {k}: {v:,}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--level", choices=list(LEVELS), default="dong")
    build(ap.parse_args().level)


if __name__ == "__main__":
    main()
