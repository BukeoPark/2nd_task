"""소상공인시장진흥공단_상가(상권)정보 API 수집기.

공공데이터포털(B553077) sdsc2 서비스의 `storeListInDong` 오퍼레이션으로
시군구 단위 상가업소 원본 데이터를 받아 그대로 저장한다.

실행
----
프로젝트 루트에서:
    .venv/bin/python -m pipelines.collect.collect_sbiz_stores
    .venv/bin/python -m pipelines.collect.collect_sbiz_stores --sigungu 11470 11560
    .venv/bin/python -m pipelines.collect.collect_sbiz_stores --force   # 오늘자 파일 재수집

기본값: config.PILOT_SIGUNGU 에 정의된 시군구(양천구·영등포구) 전체.

출력
----
data/raw/sbiz/sangga_<시군구코드>_<시군구명>_<YYYYMMDD>.json
    { source, endpoint, params_template, collected_at, sigungu_cd, sigungu_nm,
      stdrYm(API 기준연월), total_count, item_count, items:[원본 그대로] }
같은 날짜 파일이 이미 있으면 건너뛴다 (--force 로 재수집).
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

ENDPOINT = "https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInDong"
PAGE_SIZE = 1000  # 이 API 의 numOfRows 상한
REQUEST_DELAY_SEC = 0.3  # 요청 간 간격 (과도한 호출 방지)

OUT_DIR = config.RAW_DIR / "sbiz"


class ApiError(RuntimeError):
    """정상 응답이 아닌 경우(키 오류, resultCode != '00' 등)."""


@retry(
    reraise=True,
    stop=stop_after_attempt(4),
    wait=wait_exponential(multiplier=1, min=1, max=20),
    retry=retry_if_exception_type((httpx.TransportError, httpx.HTTPStatusError)),
)
def _fetch_page(client: httpx.Client, service_key: str, sigungu_cd: str, page_no: int) -> dict:
    resp = client.get(
        ENDPOINT,
        params={
            "serviceKey": service_key,
            "divId": "signguCd",
            "key": sigungu_cd,
            "type": "json",
            "numOfRows": PAGE_SIZE,
            "pageNo": page_no,
        },
        timeout=15.0,
    )
    resp.raise_for_status()
    try:
        payload = resp.json()
    except ValueError as e:
        raise ApiError(f"JSON 아님(키 오류 등 가능). 응답 앞부분: {resp.text[:300]!r}") from e

    result_code = payload.get("header", {}).get("resultCode")
    if result_code != "00":
        raise ApiError(f"API 오류 resultCode={result_code} msg={payload.get('header', {}).get('resultMsg')}")
    return payload


def collect_one(client: httpx.Client, service_key: str, sigungu_cd: str, sigungu_nm: str, *, force: bool) -> None:
    today = date.today().strftime("%Y%m%d")
    out_path = OUT_DIR / f"sangga_{sigungu_cd}_{sigungu_nm}_{today}.json"
    if out_path.exists() and not force:
        print(f"[skip] {out_path.relative_to(config.ROOT)} 이미 있음 (--force 로 재수집)")
        return

    print(f"[start] {sigungu_nm}({sigungu_cd}) 수집 시작")
    first = _fetch_page(client, service_key, sigungu_cd, page_no=1)
    total_count = first["body"]["totalCount"]
    items: list[dict] = list(first["body"]["items"])
    stdr_ym = first["header"].get("stdrYm")
    print(f"  page 1: {len(items)} / {total_count}건 (기준연월 {stdr_ym})")

    page_no = 2
    while len(items) < total_count:
        time.sleep(REQUEST_DELAY_SEC)
        page = _fetch_page(client, service_key, sigungu_cd, page_no=page_no)
        page_items = page["body"]["items"]
        if not page_items:
            print(f"  page {page_no}: 빈 응답 → 중단")
            break
        items.extend(page_items)
        print(f"  page {page_no}: {len(items)} / {total_count}건")
        page_no += 1

    if len(items) != total_count:
        print(f"  [경고] 수집 {len(items)}건 != API totalCount {total_count}건 (누락 가능, 원인 확인 필요)")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    envelope = {
        "source": "sbiz_sdsc2_storeListInDong",
        "endpoint": ENDPOINT,
        "params_template": {"divId": "signguCd", "key": sigungu_cd, "type": "json", "numOfRows": PAGE_SIZE},
        "collected_at": datetime.now(timezone.utc).isoformat(),
        "sigungu_cd": sigungu_cd,
        "sigungu_nm": sigungu_nm,
        "stdrYm": stdr_ym,
        "total_count": total_count,
        "item_count": len(items),
        "items": items,
    }
    with out_path.open("w", encoding="utf-8") as f:
        json.dump(envelope, f, ensure_ascii=False)
    print(f"[done] 저장: {out_path.relative_to(config.ROOT)} ({len(items):,}건)")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument(
        "--sigungu", nargs="+", default=list(config.PILOT_SIGUNGU),
        help="시군구코드 목록 (기본: 파일럿 전체 = %(default)s)",
    )
    ap.add_argument("--force", action="store_true", help="오늘자 파일이 있어도 재수집")
    args = ap.parse_args()

    service_key = require_env("DATA_GO_KR_KEY")

    unknown = [c for c in args.sigungu if c not in config.PILOT_SIGUNGU]
    if unknown:
        print(f"[안내] 파일럿에 등록되지 않은 시군구코드도 요청함: {unknown} (config.PILOT_SIGUNGU 참고)")

    with httpx.Client() as client:
        for code in args.sigungu:
            name = config.PILOT_SIGUNGU.get(code, code)
            collect_one(client, service_key, code, name, force=args.force)


if __name__ == "__main__":
    main()
