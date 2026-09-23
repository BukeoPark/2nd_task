"""naver_local 지역 검색 결과를 정제해 anchor_stores.parquet 에 보강 합병한다.

배경: config.ANCHOR_BRANDS 패턴으로 상호명 매칭한 sbiz 기반 앵커 매장은
등록 상호명에 브랜드가 온전히 안 남은 경우(특히 다이소)를 과소집계한다.
`pipelines.collect.collect_naver_local` 로 행정동별 지역 검색을 걸어 모은
후보를 정제해 기존 anchor_stores 에 없는 매장만 추가한다.

실행
----
프로젝트 루트에서: .venv/bin/python -m pipelines.transform.merge_naver_anchors

입력: data/raw/naver_local/<brand>_<시군구코드>_<YYYYMMDD>.json (시군구별 최신 파일)
출력: data/processed/anchor_stores.parquet 갱신 (기존 행 유지 + 신규 행 추가, `source` 컬럼으로 출처 구분)

정제·중복 제거 기준 (로그로 건수 남김)
--------------------------------
1. title 의 <b> 태그 제거 후 브랜드 패턴(config.ANCHOR_BRANDS) 재매칭 — 질의와 무관한
   연관 결과(다른 매장, 약국 등) 배제.
2. roadAddress/address 에 대상 시군구명이 포함된 것만 채택 — 인접 구 결과 배제.
2b. (title, address) 완전 동일 항목 제거 — 여러 행정동 질의에서 같은 매장이 반복 조회됨.
3. 기존 anchor_stores 의 같은 브랜드 매장과 50m 이내면 같은 매장으로 보고 건너뜀(중복 방지).
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import pandas as pd

from pipelines.common import config
from pipelines.transform.anchor_metrics import haversine_m

RAW_DIR = config.RAW_DIR / "naver_local"
ANCHOR_STORES_PATH = config.PROCESSED_DIR / "anchor_stores.parquet"
DEDUP_RADIUS_M = 50

_TAG_RE = re.compile(r"<[^>]+>")


def _clean_title(title: str) -> str:
    return _TAG_RE.sub("", title)


def _match_brand(name: str, brand: str) -> bool:
    return any(re.search(re.escape(p), name, flags=re.IGNORECASE) for p in config.ANCHOR_BRANDS[brand])


def _latest_raw_file(brand: str, sigungu_cd: str) -> Path | None:
    candidates = sorted(RAW_DIR.glob(f"{brand}_{sigungu_cd}_*.json"))
    return candidates[-1] if candidates else None


def _candidates_for(brand: str, sigungu_cd: str, sigungu_nm: str) -> pd.DataFrame:
    path = _latest_raw_file(brand, sigungu_cd)
    if path is None:
        print(f"  [건너뜀] {brand}/{sigungu_nm}: naver_local 원본 없음 (collect_naver_local 먼저 실행)")
        return pd.DataFrame(columns=["bizesId", "brand", "bizesNm", "brchNm", "signguCd", "signguNm", "adongNm", "lon", "lat", "source"])

    with path.open(encoding="utf-8") as f:
        envelope = json.load(f)
    rows = []
    for q in envelope["queries"]:
        for it in q["items"]:
            title = _clean_title(it["title"])
            addr = it.get("roadAddress") or it.get("address") or ""
            if not _match_brand(title, brand):
                continue
            if sigungu_nm not in addr:
                continue
            rows.append(
                {
                    "title": title, "addr": addr,
                    "lon": float(it["mapx"]) / 1e7, "lat": float(it["mapy"]) / 1e7,
                }
            )
    n_raw = sum(len(q["items"]) for q in envelope["queries"])
    df = pd.DataFrame(rows).drop_duplicates(subset=["title", "addr"])
    print(f"  {brand}/{sigungu_nm}: 원본 {n_raw}건 → 브랜드/지역 필터+중복제거 후 {len(df)}건")

    if df.empty:
        return pd.DataFrame(columns=["bizesId", "brand", "bizesNm", "brchNm", "signguCd", "signguNm", "adongNm", "lon", "lat", "source"])

    df = df.reset_index(drop=True)
    return pd.DataFrame(
        {
            "bizesId": [f"naver_{sigungu_cd}_{brand}_{i}" for i in range(len(df))],
            "brand": brand,
            "bizesNm": df["title"],
            "brchNm": "",
            "signguCd": sigungu_cd,
            "signguNm": sigungu_nm,
            "adongNm": None,
            "lon": df["lon"],
            "lat": df["lat"],
            "source": "naver_local",
        }
    )


def main() -> None:
    if not ANCHOR_STORES_PATH.exists():
        raise SystemExit(f"{ANCHOR_STORES_PATH.relative_to(config.ROOT)} 가 없습니다. clean_stores 를 먼저 실행하세요.")
    existing = pd.read_parquet(ANCHOR_STORES_PATH)
    if "source" not in existing.columns:
        existing["source"] = "sbiz_name_match"

    added_total, skipped_dup_total = 0, 0
    new_rows = [existing]

    for brand in config.ANCHOR_BRANDS:
        for sigungu_cd, sigungu_nm in config.PILOT_SIGUNGU.items():
            cand = _candidates_for(brand, sigungu_cd, sigungu_nm)
            if cand.empty:
                continue

            ref = existing.loc[existing["brand"] == brand, ["lon", "lat"]]
            if len(ref):
                dist = haversine_m(
                    cand["lon"].to_numpy()[:, None], cand["lat"].to_numpy()[:, None],
                    ref["lon"].to_numpy()[None, :], ref["lat"].to_numpy()[None, :],
                )
                is_dup = (dist <= DEDUP_RADIUS_M).any(axis=1)
            else:
                is_dup = pd.Series(False, index=cand.index).to_numpy()

            kept = cand.loc[~is_dup]
            skipped = int(is_dup.sum())
            added_total += len(kept)
            skipped_dup_total += skipped
            print(f"    → 신규 {len(kept)}건 추가, 기존과 {DEDUP_RADIUS_M}m 이내 중복 {skipped}건 제외")
            new_rows.append(kept)

    merged = pd.concat(new_rows, ignore_index=True)
    merged.to_parquet(ANCHOR_STORES_PATH, index=False)
    print(f"저장: {ANCHOR_STORES_PATH.relative_to(config.ROOT)} — 총 {len(merged)}건 (신규 {added_total}, 중복제외 {skipped_dup_total})")
    print(merged.groupby(["signguNm", "brand", "source"]).size().rename("count").reset_index().to_string(index=False))


if __name__ == "__main__":
    main()
