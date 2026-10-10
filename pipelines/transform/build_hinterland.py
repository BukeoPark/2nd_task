"""상권·행정동 수요 기반(직장인구·상주인구·집객시설) — 상권 운영 점검 '손님층' 제안의 근거.

실행: .venv/bin/python -m pipelines.transform.build_hinterland
입력: data/raw/seoul/ 의 최신 수집 파일
      trdar: trdar_workplace_VwsmTrdarWrcPopltnQq_all_*, trdar_resident_VwsmTrdarRepopQq_all_*, trdar_facility_VwsmTrdarFcltyQq_all_*
      dong : workplace_pop_VwsmAdstrdWrcPopltnW_<분기>_*, resident_pop_VwsmAdstrdRepopW_<분기>_*, dong_facility_VwsmAdstrdFcltyW_all_*
      단위 목록: data/processed/{trdar_areas,dong_crosswalk}.parquet
출력: data/processed/{trdar|dong}_hinterland.parquet  단위 1행(각 원천의 최신 분기)
      outputs/tables/hinterland_log.csv                 원천별 행 수·분기·누락 단위

해석 기준
  - 서울시 상권분석서비스의 직장인구·상주인구는 '상권(또는 행정동) 영역 안' 인구다. 배후지(상권 밖 주변)는 포함하지 않는다.
  - 연령 10대 칸은 서울시 원천의 '연령대_10' 그대로(매출 연령 구분과 같다). 비중은 해당 항목 합을 분모로 쓴다.
  - 집객시설 수는 원천 값 그대로(집객시설 합계 VIATR_FCLTY_CO 와 시설 종류별 수).
  - 소득·소비는 서울시가 소득 공급 중단(2020)·소비-상권 갱신 중단을 공지했고 API 가 오류를 돌려줘 싣지 않는다.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import pandas as pd

from pipelines.common import config

RAW = config.RAW_DIR / "seoul"
AGES = ["10", "20", "30", "40", "50", "60_ABOVE"]
AGE_OUT = ["age10", "age20", "age30", "age40", "age50", "age60"]
FACILITY = {  # 원천 칼럼 → 출력 칼럼
    "VIATR_FCLTY_CO": "fac_total", "PBLOFC_CO": "fac_public_office", "BANK_CO": "fac_bank",
    "GEHSPT_CO": "fac_general_hospital", "GNRL_HSPTL_CO": "fac_hospital", "PARMACY_CO": "fac_pharmacy",
    "KNDRGR_CO": "fac_kindergarten", "ELESCH_CO": "fac_elementary", "MSKUL_CO": "fac_middle", "HGSCHL_CO": "fac_high",
    "UNIV_CO": "fac_university", "DRTS_CO": "fac_department_store", "SUPMK_CO": "fac_supermarket", "THEAT_CO": "fac_theater",
    "STAYNG_FCLTY_CO": "fac_lodging", "ARPRT_CO": "fac_airport", "RLROAD_STATN_CO": "fac_rail_station",
    "BUS_TRMINL_CO": "fac_bus_terminal", "SUBWAY_STATN_CO": "fac_subway", "BUS_STTN_CO": "fac_bus_stop",
}
LEVELS = {
    "trdar": {"code": "TRDAR_CD", "workplace": "trdar_workplace_VwsmTrdarWrcPopltnQq", "resident": "trdar_resident_VwsmTrdarRepopQq",
              "facility": "trdar_facility_VwsmTrdarFcltyQq", "units": "trdar_areas.parquet", "unit_cd": "trdar_cd"},
    "dong": {"code": "ADSTRD_CD", "workplace": "workplace_pop_VwsmAdstrdWrcPopltnW", "resident": "resident_pop_VwsmAdstrdRepopW",
             "facility": "dong_facility_VwsmAdstrdFcltyW", "units": "dong_crosswalk.parquet", "unit_cd": "adongCd"},
}


def _latest_file(prefix: str) -> Path:
    """같은 원천의 여러 수집 파일 중 (분기 태그, 수집일) 이 가장 늦은 것."""
    files = [p for p in RAW.glob(f"{prefix}_*.json") if re.match(rf"{re.escape(prefix)}_(\d{{5}}|all)_\d{{8}}\.json$", p.name)]
    if not files:
        raise SystemExit(f"원천 파일이 없습니다: data/raw/seoul/{prefix}_*.json — collect_seoul_trdar 로 먼저 수집하세요")
    return max(files, key=lambda p: (p.stem.split("_")[-2], p.stem.split("_")[-1]))


def _latest_quarter(prefix: str, code_col: str, units: set[str], log: list) -> pd.DataFrame:
    path = _latest_file(prefix)
    env = json.loads(path.read_text(encoding="utf-8"))
    df = pd.DataFrame(env["rows"])
    if env["item_count"] != env["total_count"]:
        log.append({"source": path.name, "item": "수집 누락 행", "count": env["total_count"] - env["item_count"]})
    q = df["STDR_YYQU_CD"].max()
    df = df.loc[(df["STDR_YYQU_CD"] == q) & df[code_col].isin(units)]
    dup = df.duplicated(code_col, keep="last")
    log.append({"source": path.name, "item": f"{q} 파일럿 단위 행", "count": int((~dup).sum())})
    log.append({"source": path.name, "item": "중복 제거", "count": int(dup.sum())})
    return df.loc[~dup].set_index(code_col).assign(quarter=q)


def _population(df: pd.DataFrame, kind: str, prefix: str) -> pd.DataFrame:
    """kind: 'WRC_POPLTN' | 'REPOP' → total·female·연령대 인구수."""
    out = pd.DataFrame(index=df.index)
    out[f"{prefix}_total"] = df[f"TOT_{kind}_CO"].astype(float)
    out[f"{prefix}_female"] = df[f"FML_{kind}_CO"].astype(float)
    for a, o in zip(AGES, AGE_OUT):
        out[f"{prefix}_{o}"] = df[f"AGRDE_{a}_{kind}_CO"].astype(float)
    out[f"{prefix}_quarter"] = df["quarter"]
    return out


def build(level: str, log: list) -> pd.DataFrame:
    spec = LEVELS[level]
    units = pd.read_parquet(config.PROCESSED_DIR / spec["units"])[spec["unit_cd"]].astype(str)
    unit_set = set(units)
    wrc = _population(_latest_quarter(spec["workplace"], spec["code"], unit_set, log), "WRC_POPLTN", "wrc")
    rep_raw = _latest_quarter(spec["resident"], spec["code"], unit_set, log)
    rep = _population(rep_raw, "REPOP", "repop")
    rep["households"] = rep_raw["TOT_HSHLD_CO"].astype(float)
    rep["apt_households"] = rep_raw["APT_HSHLD_CO"].astype(float)
    fac_raw = _latest_quarter(spec["facility"], spec["code"], unit_set, log)
    fac = fac_raw[list(FACILITY)].astype(float).rename(columns=FACILITY).assign(fac_quarter=fac_raw["quarter"])

    out = pd.DataFrame(index=sorted(unit_set)).join(wrc).join(rep).join(fac)
    out.index.name = spec["unit_cd"]
    for name, cols in [("직장인구", ["wrc_total"]), ("상주인구", ["repop_total"]), ("집객시설", ["fac_total"])]:
        log.append({"source": f"{level}", "item": f"{name} 없음(자료 없음으로 둠)", "count": int(out[cols[0]].isna().sum())})
    return out.reset_index().sort_values(spec["unit_cd"]).reset_index(drop=True)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--levels", nargs="+", default=list(LEVELS), choices=list(LEVELS))
    args = ap.parse_args()
    log: list[dict] = []
    for level in args.levels:
        out = build(level, log)
        path = config.PROCESSED_DIR / f"{level}_hinterland.parquet"
        out.to_parquet(path, index=False)
        print(f"[done] {path.relative_to(config.ROOT)} ({len(out)}행)")
    pd.DataFrame(log).to_csv(config.TABLES_DIR / "hinterland_log.csv", index=False)
    for r in log:
        print(f"  {r['source']}: {r['item']} {r['count']}")


if __name__ == "__main__":
    main()
