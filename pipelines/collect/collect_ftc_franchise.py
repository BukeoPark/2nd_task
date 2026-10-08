"""공정거래위원회 가맹정보 — 브랜드별 가맹점 현황(전국) 연도별 수집.

실행: .venv/bin/python -m pipelines.collect.collect_ftc_franchise [--years 2024 2025] [--force]
출력: data/raw/ftc/brand_frcs_stats_<연도>_<수집일>.json

API: https://apis.data.go.kr/1130000/FftcBrandFrcsStatsService/getBrandFrcsStats (공공데이터포털 15110241)
2026-10-01 실호출 확인: 2017~2025년 제공(2016년 이전·2026년은 0건), 연도별 약 4.8천~1.2만 브랜드.
필드: yr, indutyLclasNm/indutyMlsfcNm(공정위 업종 대·중분류), corpNm, brandNm, frcsCnt(가맹점수),
      newFrcsRgsCnt(신규개점), ctrtEndCnt(계약종료), ctrtCncltnCnt(계약해지), nmChgCnt(명의변경),
      avrgSlsAmt(평균매출액), arUnitAvrgSlsAmt(면적단위 평균매출액)
"""
from __future__ import annotations

import argparse
import json
import time
from datetime import date, datetime, timezone

import httpx
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from pipelines.common import config
from pipelines.common.env import require_env

ENDPOINT = "https://apis.data.go.kr/1130000/FftcBrandFrcsStatsService/getBrandFrcsStats"
YEARS = list(range(2017, 2026))
PAGE_SIZE = 1000
OUT_DIR = config.RAW_DIR / "ftc"


@retry(reraise=True, stop=stop_after_attempt(4), wait=wait_exponential(min=1, max=20),
       retry=retry_if_exception_type((httpx.TransportError, httpx.HTTPStatusError)))
def _page(client: httpx.Client, key: str, yr: int, page: int) -> dict:
    resp = client.get(ENDPOINT, params={"serviceKey": key, "pageNo": page, "numOfRows": PAGE_SIZE,
                                        "resultType": "json", "yr": str(yr)}, timeout=60)
    resp.raise_for_status()
    body = resp.json()
    if body.get("resultCode") != "00":
        raise RuntimeError(f"API 오류: {body.get('resultCode')} {body.get('resultMsg')}")
    return body


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--years", nargs="*", type=int, default=YEARS)
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    key = require_env("DATA_GO_KR_KEY")
    today = date.today().strftime("%Y%m%d")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with httpx.Client() as client:
        for yr in args.years:
            out = OUT_DIR / f"brand_frcs_stats_{yr}_{today}.json"
            if out.exists() and not args.force:
                print(f"[skip] {out.name} 이미 있음")
                continue
            first = _page(client, key, yr, 1)
            total = int(first["totalCount"])
            items = list(first.get("items") or [])
            page = 2
            while len(items) < total:
                time.sleep(0.2)
                batch = _page(client, key, yr, page).get("items") or []
                if not batch:
                    break
                items.extend(batch)
                page += 1
            with out.open("w", encoding="utf-8") as f:
                json.dump({"source": "ftc_brand_frcs_stats", "endpoint": ENDPOINT, "yr": yr,
                           "collected_at": datetime.now(timezone.utc).isoformat(),
                           "total_count": total, "item_count": len(items), "items": items}, f, ensure_ascii=False)
            flag = "" if len(items) == total else f"  [경고] 수집 {len(items)} != 원천 {total}"
            print(f"[ok] {yr}: {len(items):,}/{total:,}{flag}")


if __name__ == "__main__":
    main()
