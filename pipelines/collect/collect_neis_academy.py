"""NEIS 학원교습소정보 수집 (파일럿 자치구, 서울특별시교육청 B10).

실행: .venv/bin/python -m pipelines.collect.collect_neis_academy
출력: data/raw/neis/acaInsTiInfo_<구명>_<YYYYMMDD>.json

인증키(NEIS_API_KEY)가 없으면 종료한다. 키 없이 호출하면 응답이 5건으로 제한된다(2026-09-23 실호출 확인:
영등포구 list_total_count 867 / 양천구 2,111 이지만 pSize 와 무관하게 5건만 반환).
"""
from __future__ import annotations

import json
import time
from datetime import date, datetime, timezone

import httpx
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from pipelines.common import config
from pipelines.common.env import require_env

ENDPOINT = "https://open.neis.go.kr/hub/acaInsTiInfo"
OFFICE_SEOUL = "B10"
PAGE_SIZE = 1000
OUT_DIR = config.RAW_DIR / "neis"


@retry(reraise=True, stop=stop_after_attempt(4), wait=wait_exponential(min=1, max=20),
       retry=retry_if_exception_type((httpx.TransportError, httpx.HTTPStatusError)))
def _page(client: httpx.Client, key: str, gu_nm: str, index: int) -> dict:
    resp = client.get(ENDPOINT, params={"KEY": key, "Type": "json", "pIndex": index, "pSize": PAGE_SIZE,
                                        "ATPT_OFCDC_SC_CODE": OFFICE_SEOUL, "ADMST_ZONE_NM": gu_nm}, timeout=30)
    resp.raise_for_status()
    return resp.json()


def main() -> None:
    key = require_env("NEIS_API_KEY")
    today = date.today().strftime("%Y%m%d")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with httpx.Client() as client:
        for sgg, gu_nm in config.PILOT_SIGUNGU.items():
            rows, index, total = [], 1, None
            while total is None or len(rows) < total:
                body = _page(client, key, gu_nm, index).get("acaInsTiInfo")
                if not body:
                    break
                total = body[0]["head"][0]["list_total_count"]
                page = body[1]["row"]
                if not page:
                    break
                rows.extend(page)
                index += 1
                time.sleep(0.2)
            out = OUT_DIR / f"acaInsTiInfo_{gu_nm}_{today}.json"
            with out.open("w", encoding="utf-8") as f:
                json.dump({"source": "neis_academy", "sigungu_cd": sgg, "gu_nm": gu_nm,
                           "collected_at": datetime.now(timezone.utc).isoformat(),
                           "total_count": total, "item_count": len(rows), "rows": rows}, f, ensure_ascii=False)
            print(f"저장: {out.relative_to(config.ROOT)} ({len(rows):,}/{total}건)")


if __name__ == "__main__":
    main()
