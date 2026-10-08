"""공정위 가맹정보 정리 + 매장 ↔ 프랜차이즈 브랜드 연결.

실행: .venv/bin/python -m pipelines.transform.build_franchise
입력: data/raw/ftc/brand_frcs_stats_<연도>_*.json, data/raw/ftc/area_induty_avr_<그룹>_<연도>_*.json,
      data/processed/stores.parquet
출력: data/processed/ftc_brand_stats.parquet  연도 × 브랜드(법인+브랜드명) 1행 — 금액 단위 천원
      data/processed/ftc_area_avg.parquet     연도 × 업종 중분류 × 시도 평균매출(천원)
      data/processed/store_brand.parquet      브랜드와 연결된 매장 1행
      outputs/tables/store_brand_log.csv      연결·제외 건수

연결 규칙 (이름이 비슷하다는 이유만으로 붙이지 않는다)
  - 상호(정규화)가 브랜드명과 같거나, '브랜드명 + ○○점'(지점명) 형태이거나, 상호=브랜드명이고 지점명 칸이 따로 있을 때
  - 두 글자 브랜드는 상호와 완전히 같을 때만, 세 글자 이상만 '브랜드명+○○점' 허용
  - 지점 표시 없이 상호만 같으면 가맹점 EXACT_ONLY_MIN_FRCS(100)곳 이상 브랜드만 연결(흔한 이름의 개인 가게 오연결 방지)
  - 공정위 업종 대분류(외식·도소매·서비스)와 매장 업종 대분류(음식 I2·소매 G2·그 외)가 맞아야 함
  - 브랜드명마다 최근 연도 기준. 같은 해에 같은 브랜드명을 쓰는 법인이 둘 이상이면 연결하지 않음(모호)
  - 평균매출 칸: 지역별 업종별 자료의 'frcsCnt' 는 이름과 달리 평균매출금액이다(collect_ftc_franchise 참고)
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import pandas as pd

from pipelines.common import config
from pipelines.common.matching import norm_name

RAW = config.RAW_DIR / "ftc"
# 지점 표시 없이 상호만 같은 경우 흔한 이름의 개인 가게가 섞이므로(예: '우리분식' — 가맹점 0곳 브랜드),
# 가맹점이 이만큼 이상인 잘 알려진 브랜드만 연결한다.
EXACT_ONLY_MIN_FRCS = 100
LCLS_OK = {"외식": lambda c: c == "I2", "도소매": lambda c: c == "G2", "서비스": lambda c: c not in ("I2", "G2")}


def _latest_files(pattern: str, key_re: str) -> list[Path]:
    latest: dict[str, Path] = {}
    for p in sorted(RAW.glob(pattern)):
        m = re.match(key_re, p.name)
        if m:
            latest[m.group(1)] = p
    return list(latest.values())


def build_brand_stats(log: list) -> pd.DataFrame:
    rows = []
    for p in _latest_files("brand_frcs_stats_*.json", r"brand_frcs_stats_(\d{4})_\d{8}\.json"):
        rows += json.loads(p.read_text(encoding="utf-8"))["items"]
    df = pd.DataFrame(rows)
    num = ["frcsCnt", "newFrcsRgsCnt", "ctrtEndCnt", "ctrtCncltnCnt", "nmChgCnt", "avrgSlsAmt", "arUnitAvrgSlsAmt"]
    df[num] = df[num].apply(pd.to_numeric, errors="coerce")
    df = df.sort_values("frcsCnt", ascending=False, kind="stable")
    dup = df.duplicated(["yr", "corpNm", "brandNm"], keep="first")
    log.append(("같은 연도·법인·브랜드 중복 행(가맹점수 큰 행 유지)", int(dup.sum())))
    df = df.loc[~dup]
    out = pd.DataFrame({
        "yr": df["yr"].astype(int), "corpNm": df["corpNm"], "brandNm": df["brandNm"], "brand_norm": df["brandNm"].map(norm_name),
        "lcls": df["indutyLclasNm"].str.strip(), "mlsfc": df["indutyMlsfcNm"].str.strip(),
        "frcs_cnt": df["frcsCnt"], "new_cnt": df["newFrcsRgsCnt"], "end_cnt": df["ctrtEndCnt"],
        "cancel_cnt": df["ctrtCncltnCnt"], "owner_change_cnt": df["nmChgCnt"],
        "avg_sales_k": df["avrgSlsAmt"].where(df["avrgSlsAmt"] > 0), "ar_unit_sales_k": df["arUnitAvrgSlsAmt"].where(df["arUnitAvrgSlsAmt"] > 0),
    }).sort_values(["brand_norm", "corpNm", "yr"]).reset_index(drop=True)
    out.to_parquet(config.PROCESSED_DIR / "ftc_brand_stats.parquet", index=False)
    log.append(("브랜드 연도 행", len(out)))
    return out


def build_area_avg(log: list) -> None:
    rows = []
    for p in _latest_files("area_induty_avr_*.json", r"area_induty_avr_(\S+_\d{4})_\d{8}\.json"):
        env = json.loads(p.read_text(encoding="utf-8"))
        for it in env["items"]:
            rows.append({"yr": int(it["yr"]), "group": env["group"], "mlsfc": it["indutyMlsfcNm"].strip(), "areaNm": it["areaNm"],
                         "avg_sales_k": pd.to_numeric(it["frcsCnt"], errors="coerce"),
                         "ar_unit_sales_k": pd.to_numeric(it["arUnitAvrgSlsAmt"], errors="coerce")})
    df = pd.DataFrame(rows).sort_values(["yr", "group", "mlsfc", "areaNm"]).reset_index(drop=True)
    df.to_parquet(config.PROCESSED_DIR / "ftc_area_avg.parquet", index=False)
    log.append(("지역별 업종별 평균매출 행", len(df)))


def link_stores(brands: pd.DataFrame, log: list) -> None:
    # 브랜드명마다 가장 최근 연도 행만 본다. 해가 바뀌며 법인명이 바뀐 경우는 같은 브랜드로 보고,
    # 같은 해에 법인이 둘 이상 같은 브랜드명을 쓰면 모호하므로 연결하지 않는다.
    b = brands.loc[brands["brand_norm"].str.len() >= 2]
    latest = b.loc[b["yr"] == b.groupby("brand_norm")["yr"].transform("max")]
    corps = latest.groupby("brand_norm")["corpNm"].nunique()
    index = {n: g.sort_values("frcs_cnt", ascending=False).iloc[0] for n, g in latest.groupby("brand_norm") if corps[n] == 1}
    log.append(("같은 해에 여러 법인이 같은 브랜드명을 써서 연결 제외한 브랜드명", int((corps > 1).sum())))

    stores = pd.read_parquet(config.PROCESSED_DIR / "stores.parquet")
    out, mismatch, generic = [], 0, 0
    for s in stores.itertuples():
        core = norm_name(s.bizesNm)
        hit, how = None, None
        if core in index:
            hit, how = index[core], ("brch_field" if isinstance(s.brchNm, str) and s.brchNm.strip() else "exact")
        else:
            for n in range(len(core) - 1, 2, -1):
                rest = core[n:]
                if core[:n] in index and rest.endswith("점") and len(rest) >= 2:
                    hit, how = index[core[:n]], "brand_branch"
                    break
        if hit is None:
            continue
        if not LCLS_OK.get(hit["lcls"], lambda c: False)(s.indsLclsCd):
            mismatch += 1
            continue
        if how == "exact" and not (hit["frcs_cnt"] >= EXACT_ONLY_MIN_FRCS):
            generic += 1
            continue
        out.append({"bizesId": s.bizesId, "corpNm": hit["corpNm"], "brandNm": hit["brandNm"], "match_type": how})
    links = pd.DataFrame(out)
    links.to_parquet(config.PROCESSED_DIR / "store_brand.parquet", index=False)
    log.append(("브랜드와 연결된 매장", len(links)))
    log.append(("상호는 맞지만 업종 대분류가 달라 제외", mismatch))
    log.append((f"지점 표시 없이 상호만 같고 가맹점 {EXACT_ONLY_MIN_FRCS}곳 미만 브랜드라 제외", generic))
    print(links["brandNm"].value_counts().head(10).to_string())


def main() -> None:
    log: list[tuple[str, int]] = []
    brands = build_brand_stats(log)
    build_area_avg(log)
    link_stores(brands, log)
    pd.DataFrame(log, columns=["기준", "건수"]).to_csv(config.TABLES_DIR / "store_brand_log.csv", index=False)
    for k, v in log:
        print(f"  - {k}: {v:,}")


if __name__ == "__main__":
    main()
