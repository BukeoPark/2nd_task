"""서울시 상권분석서비스(우리마을가게) 행정동 단위 통계 수집기.

실행
----
프로젝트 루트에서:
    .venv/bin/python -m pipelines.collect.collect_seoul_trdar
    .venv/bin/python -m pipelines.collect.collect_seoul_trdar --datasets sales stores
    .venv/bin/python -m pipelines.collect.collect_seoul_trdar --quarter 20261 --force

무엇을 받는가
------------
DATASETS 에 정의한 서울 열린데이터광장 OpenAPI 서비스들을 **서울 전체·지정
분기(기본: 가장 최근 확인된 분기)** 기준으로 그대로 받는다. 이 API 들은
행정동 코드로 필터링하는 파라미터가 없어서, 시 전체를 받은 뒤 우리 파일럿
두 구(36개 행정동)만 추리는 건 transform 단계(filter_seoul_trdar)에서 한다.
'boundary_centroid'(영역-행정동)만 예외로 분기 구분이 없는 정적 테이블(전체
425개 행정동, 중심좌표+면적만 있고 폴리곤 경계는 아님)이라 --quarter 와 무관하게 전량 받는다.

출력 (data/raw/seoul/)
--------------------
<dataset_key>_<SERVICE>_<quarter 또는 static>_<YYYYMMDD>.json
    { source, service, dataset_key, quarter, collected_at, total_count, item_count, rows:[원본 그대로] }
같은 날짜 파일이 있으면 건너뛴다 (--force 로 재수집).
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

ENDPOINT_BASE = "http://openapi.seoul.go.kr:8088"
PAGE_SIZE = 1000  # 이 API 군의 요청당 상한
REQUEST_DELAY_SEC = 0.2
OUT_DIR = config.RAW_DIR / "seoul"

# dataset_key -> (SERVICE, 분기 파라미터 필요 여부, 한글설명)
DATASETS: dict[str, tuple[str, bool, str]] = {
    "sales": ("VwsmAdstrdSelngW", True, "상권분석서비스(추정매출-행정동)"),
    "stores": ("VwsmAdstrdStorW", True, "상권분석서비스(점포-행정동)"),
    "floating_pop": ("VwsmAdstrdFlpopW", True, "상권분석서비스(길단위인구-행정동)"),
    "workplace_pop": ("VwsmAdstrdWrcPopltnW", True, "상권분석서비스(직장인구-행정동)"),
    "change_index": ("VwsmAdstrdIxQq", True, "상권분석서비스(상권변화지표-행정동)"),
    "resident_pop": ("VwsmAdstrdRepopW", True, "상권분석서비스(상주인구-행정동)"),
    "boundary_centroid": ("TbgisAdstrdRelmW", False, "상권분석서비스(영역-행정동, 중심좌표+면적)"),
    # 상권(골목·발달·전통시장·관광특구) 단위 — 행정동보다 촘촘한 비교용. 2026-10-01 실호출로 분기 필터 동작 확인.
    "trdar_sales": ("VwsmTrdarSelngQq", True, "상권분석서비스(추정매출-상권)"),
    "trdar_stores": ("VwsmTrdarStorQq", True, "상권분석서비스(점포-상권)"),
    "trdar_flpop": ("VwsmTrdarFlpopQq", True, "상권분석서비스(길단위인구-상권)"),
    # 상권 배후 수요(직장·상주인구·집객시설). 2026-10-08 실호출: 아래 셋은 분기 파라미터를 무시하고 전 분기를 돌려줘서
    # 분기 없이 전량 받고(파일 태그 all) transform 에서 분기를 고른다.
    # 소득소비(VwsmTrdarIncmCnsmpQq·VwsmAdstrdIncmCnsmpW)는 ERROR-500 — 서울시 공지상 소득 컬럼은 2020년 공급 중단으로
    # 2026-05-13 삭제, 소비-상권은 갱신 중단이라 수집하지 않는다.
    "trdar_workplace": ("VwsmTrdarWrcPopltnQq", False, "상권분석서비스(직장인구-상권)"),
    "trdar_resident": ("VwsmTrdarRepopQq", False, "상권분석서비스(상주인구-상권)"),
    "trdar_facility": ("VwsmTrdarFcltyQq", False, "상권분석서비스(집객시설-상권)"),
    "dong_facility": ("VwsmAdstrdFcltyW", False, "상권분석서비스(집객시설-행정동)"),
}
ALL_QUARTERS = {"trdar_workplace", "trdar_resident", "trdar_facility", "dong_facility"}  # 정적 표가 아니라 전 분기 묶음

# 2026-09-14 기준 실호출로 확인한 가장 최근 분기(추정매출 등 공통). 데이터가 갱신되면 --quarter 로 덮어쓴다.
DEFAULT_QUARTER = "20262"


class ApiError(RuntimeError):
    pass


@retry(
    reraise=True,
    stop=stop_after_attempt(4),
    wait=wait_exponential(multiplier=1, min=1, max=20),
    retry=retry_if_exception_type((httpx.TransportError, httpx.HTTPStatusError)),
)
def _fetch_page(client: httpx.Client, key: str, service: str, start: int, end: int, quarter: str | None) -> dict:
    path = f"{ENDPOINT_BASE}/{key}/json/{service}/{start}/{end}/"
    if quarter:
        path += f"{quarter}/"
    resp = client.get(path, timeout=15.0)
    resp.raise_for_status()
    payload = resp.json()

    if "RESULT" in payload:  # 최상위에 RESULT만 있으면 오류(서비스명 오타, 페이지 크기 초과 등)
        raise ApiError(f"API 오류: {payload['RESULT']}")
    body = payload[service]
    if body["RESULT"]["CODE"] != "INFO-000":
        raise ApiError(f"API 오류: {body['RESULT']}")
    return body


def collect_one(client: httpx.Client, key: str, dataset_key: str, service: str, needs_quarter: bool, desc: str, quarter: str, *, force: bool) -> None:
    q = quarter if needs_quarter else None
    today = date.today().strftime("%Y%m%d")
    tag = q or ("all" if dataset_key in ALL_QUARTERS else "static")
    out_path = OUT_DIR / f"{dataset_key}_{service}_{tag}_{today}.json"
    if out_path.exists() and not force:
        print(f"[skip] {out_path.relative_to(config.ROOT)} 이미 있음 (--force 로 재수집)")
        return

    print(f"[start] {desc} ({service}, quarter={q or '-'}) 수집 시작")
    first = _fetch_page(client, key, service, 1, PAGE_SIZE, q)
    total_count = first["list_total_count"]
    rows: list[dict] = list(first["row"])
    print(f"  1~{len(rows)} / {total_count}건")

    start = PAGE_SIZE + 1
    while len(rows) < total_count:
        time.sleep(REQUEST_DELAY_SEC)
        end = min(start + PAGE_SIZE - 1, total_count)
        page = _fetch_page(client, key, service, start, end, q)
        page_rows = page.get("row", [])
        if not page_rows:
            print(f"  {start}~{end}: 빈 응답 → 중단")
            break
        rows.extend(page_rows)
        print(f"  {start}~{end}: 누적 {len(rows)} / {total_count}건")
        start = end + 1

    if len(rows) != total_count:
        print(f"  [경고] 수집 {len(rows)}건 != API totalCount {total_count}건")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    envelope = {
        "source": "seoul_openapi_trdar",
        "service": service,
        "dataset_key": dataset_key,
        "quarter": q,
        "collected_at": datetime.now(timezone.utc).isoformat(),
        "total_count": total_count,
        "item_count": len(rows),
        "rows": rows,
    }
    with out_path.open("w", encoding="utf-8") as f:
        json.dump(envelope, f, ensure_ascii=False)
    print(f"[done] 저장: {out_path.relative_to(config.ROOT)} ({len(rows):,}건)")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--datasets", nargs="+", default=list(DATASETS), choices=list(DATASETS))
    ap.add_argument("--quarter", default=DEFAULT_QUARTER, help=f"기준_년분기_코드 (기본 {DEFAULT_QUARTER})")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    key = require_env("SEOUL_OPENAPI_KEY")

    with httpx.Client() as client:
        for dataset_key in args.datasets:
            service, needs_quarter, desc = DATASETS[dataset_key]
            collect_one(client, key, dataset_key, service, needs_quarter, desc, args.quarter, force=args.force)


if __name__ == "__main__":
    main()
