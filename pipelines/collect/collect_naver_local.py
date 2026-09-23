"""NAVER 지역 검색(API HUB local)으로 앵커 브랜드 매장을 행정동 단위로 보강 수집.

배경
----
`pipelines.transform.clean_stores`가 상호명 패턴으로 뽑은 anchor_stores 는
소상공인시장진흥공단 데이터의 등록 상호명에 의존해서 일부 브랜드(특히 다이소)를
과소집계한다. 이 스크립트는 행정동 이름 + 브랜드명으로 지역 검색을 걸어
보강 후보를 모은다.

실행
----
프로젝트 루트에서:
    .venv/bin/python -m pipelines.collect.collect_naver_local
    .venv/bin/python -m pipelines.collect.collect_naver_local --brands daiso
    .venv/bin/python -m pipelines.collect.collect_naver_local --force

입력: data/processed/stores.parquet 에서 파일럿 시군구의 행정동 목록을 읽는다
      (없으면 --force 로 재수집하기 전에 clean_stores 를 먼저 실행해야 함).

출력 (data/raw/naver_local/)
--------------------------
<brand>_<시군구코드>_<YYYYMMDD>.json
    { source, endpoint, brand, sigungu_cd, sigungu_nm, collected_at,
      queries: [ {query, total, items:[원본 그대로, mapx/mapy 포함]} ... ] }

주의: NAVER 지역 검색 API는 한 요청당 display 최대 5건까지만 준다(공식 제한).
행정동 단위로 쪼개 질의하는 것도 이 상한을 우회하기 위함이며, 그래도 한 동에
같은 브랜드가 6개 이상이면 누락될 수 있다.
"""
from __future__ import annotations

import argparse
import json
import time
from datetime import date, datetime, timezone

import httpx
import pandas as pd
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from pipelines.common import config
from pipelines.common.env import require_env

ENDPOINT = "https://naverapihub.apigw.ntruss.com/search/v1/local"
DISPLAY = 5  # API 상한
REQUEST_DELAY_SEC = 0.2

OUT_DIR = config.RAW_DIR / "naver_local"
STORES_PATH = config.PROCESSED_DIR / "stores.parquet"


class ApiError(RuntimeError):
    pass


@retry(
    reraise=True,
    stop=stop_after_attempt(4),
    wait=wait_exponential(multiplier=1, min=1, max=20),
    retry=retry_if_exception_type((httpx.TransportError, httpx.HTTPStatusError)),
)
def _search(client: httpx.Client, client_id: str, client_secret: str, query: str) -> dict:
    resp = client.get(
        ENDPOINT,
        headers={"X-NCP-APIGW-API-KEY-ID": client_id, "X-NCP-APIGW-API-KEY": client_secret},
        params={"query": query, "display": DISPLAY},
        timeout=15.0,
    )
    resp.raise_for_status()
    try:
        payload = resp.json()
    except ValueError as e:
        raise ApiError(f"JSON 아님. 응답 앞부분: {resp.text[:300]!r}") from e
    if "items" not in payload:
        raise ApiError(f"예상치 못한 응답: {payload}")
    return payload


def _pilot_dongs() -> pd.DataFrame:
    if not STORES_PATH.exists():
        raise SystemExit(
            f"{STORES_PATH.relative_to(config.ROOT)} 가 없습니다. "
            "먼저 pipelines.transform.clean_stores 를 실행하세요."
        )
    stores = pd.read_parquet(STORES_PATH, columns=["signguCd", "signguNm", "adongNm"])
    return stores.drop_duplicates(subset=["signguCd", "adongNm"]).sort_values(["signguCd", "adongNm"])


def collect_brand_district(
    client: httpx.Client, client_id: str, client_secret: str,
    brand: str, brand_query: str, sigungu_cd: str, sigungu_nm: str, dong_names: list[str], *, force: bool,
) -> None:
    today = date.today().strftime("%Y%m%d")
    out_path = OUT_DIR / f"{brand}_{sigungu_cd}_{today}.json"
    if out_path.exists() and not force:
        print(f"[skip] {out_path.relative_to(config.ROOT)} 이미 있음 (--force 로 재수집)")
        return

    print(f"[start] {sigungu_nm} x {brand}: 행정동 {len(dong_names)}개 질의")
    queries = []
    total_items = 0
    for dong in dong_names:
        q = f"{sigungu_nm} {dong} {brand_query}"
        payload = _search(client, client_id, client_secret, q)
        queries.append({"query": q, "total": payload.get("total", 0), "items": payload["items"]})
        total_items += len(payload["items"])
        time.sleep(REQUEST_DELAY_SEC)
    print(f"  질의 {len(dong_names)}건 완료, 반환 항목 합계 {total_items}건(동별 중복 가능, 정제는 transform 단계)")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    envelope = {
        "source": "naver_apihub_search_v1_local",
        "endpoint": ENDPOINT,
        "brand": brand,
        "brand_query": brand_query,
        "sigungu_cd": sigungu_cd,
        "sigungu_nm": sigungu_nm,
        "collected_at": datetime.now(timezone.utc).isoformat(),
        "queries": queries,
    }
    with out_path.open("w", encoding="utf-8") as f:
        json.dump(envelope, f, ensure_ascii=False)
    print(f"[done] 저장: {out_path.relative_to(config.ROOT)}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--brands", nargs="+", default=list(config.ANCHOR_BRANDS), choices=list(config.ANCHOR_BRANDS))
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    client_id = require_env("NAVER_CLIENT_ID")
    client_secret = require_env("NAVER_CLIENT_SECRET")

    dongs = _pilot_dongs()
    with httpx.Client() as client:
        for sigungu_cd, sigungu_nm in config.PILOT_SIGUNGU.items():
            dong_names = dongs.loc[dongs["signguCd"] == sigungu_cd, "adongNm"].tolist()
            for brand in args.brands:
                brand_query = config.ANCHOR_BRANDS[brand][0]  # 대표 검색어(첫 패턴)
                collect_brand_district(
                    client, client_id, client_secret, brand, brand_query,
                    sigungu_cd, sigungu_nm, dong_names, force=args.force,
                )


if __name__ == "__main__":
    main()
