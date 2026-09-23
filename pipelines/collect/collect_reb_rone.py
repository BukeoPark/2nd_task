"""한국부동산원 R-ONE 상업용부동산 임대동향(공실률·임대료) 수집기.

실행
----
프로젝트 루트에서:
    .venv/bin/python -m pipelines.collect.collect_reb_rone
    .venv/bin/python -m pipelines.collect.collect_reb_rone --force   # 오늘자 파일 재수집

무엇을 받는가
------------
"(2024년3분기~)"로 계속 이어지는 연속 통계표 6종(TABLES 참고)을 전국 단위·
전체 시점 그대로 받는다: 소규모 상가 / 중대형 상가 / 오피스 각각의 공실률·임대료.

**중요한 한계**: R-ONE 의 지역 단위는 자치구가 아니라 한국부동산원이 지정한
"상권권역" 이름(예: 영등포역, 당산역, 목동, 까치산역 등 전국 약 276개)이다.
양천구·영등포구를 면 단위로 커버하지 못하고, 그 안에 있는 일부 상권 지점만
잡힌다(예: 영등포구 → 영등포역·당산역, 양천구 → 목동·까치산역 정도).
CLS_FULLNM(예: "서울>영등포신촌>영등포역")과 위경도를 대응시키는 매핑은
transform 단계에서 수동으로 만들어야 한다 — API가 좌표를 주지 않는다.

출력 (data/raw/reb/)
--------------------
<dataset_key>_<STATBL_ID>_<YYYYMMDD>.json
    { source, statbl_id, dataset_key, dtacycle_cd, collected_at, total_count, item_count, rows:[원본 그대로] }
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

ENDPOINT = "https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do"
PAGE_SIZE = 1000
REQUEST_DELAY_SEC = 0.3

OUT_DIR = config.RAW_DIR / "reb"

# dataset_key -> (STATBL_ID, DTACYCLE_CD, 설명). data.go.kr 과 무관한 한국부동산원 자체 API.
TABLES: dict[str, tuple[str, str, str]] = {
    "vacancy_small_shop": ("T241833134686576", "QY", "임대동향 지역별 공실률 - 소규모 상가"),
    "rent_small_shop": ("T248223134698125", "QY", "임대동향 지역별 임대료 - 소규모 상가"),
    "vacancy_midlarge_shop": ("T249633134845544", "QY", "임대동향 지역별 공실률 - 중대형 상가"),
    "rent_midlarge_shop": ("T244363134858603", "QY", "임대동향 지역별 임대료 - 중대형 상가"),
    "vacancy_office": ("TT244763134428698", "QY", "임대동향 지역별 공실률 - 오피스"),
    "rent_office": ("TT249843134237374", "QY", "임대동향 지역별 임대료 - 오피스"),
}


class ApiError(RuntimeError):
    pass


@retry(
    reraise=True,
    stop=stop_after_attempt(4),
    wait=wait_exponential(multiplier=1, min=1, max=20),
    retry=retry_if_exception_type((httpx.TransportError, httpx.HTTPStatusError)),
)
def _fetch_page(client: httpx.Client, key: str, statbl_id: str, dtacycle_cd: str, page_no: int) -> dict:
    resp = client.get(
        ENDPOINT,
        params={
            "KEY": key,
            "STATBL_ID": statbl_id,
            "DTACYCLE_CD": dtacycle_cd,
            "Type": "json",
            "pIndex": page_no,
            "pSize": PAGE_SIZE,
        },
        timeout=15.0,
    )
    resp.raise_for_status()
    try:
        payload = resp.json()
    except ValueError as e:
        raise ApiError(f"JSON 아님. 응답 앞부분: {resp.text[:300]!r}") from e

    if "RESULT" in payload:  # 최상위에 RESULT 만 있으면 오류 응답
        raise ApiError(f"API 오류: {payload['RESULT']}")
    result = payload["SttsApiTblData"][0]["head"][1]["RESULT"]
    if result.get("CODE") != "INFO-000":
        raise ApiError(f"API 오류: {result}")
    return payload


def collect_one(client: httpx.Client, key: str, dataset_key: str, statbl_id: str, dtacycle_cd: str, desc: str, *, force: bool) -> None:
    today = date.today().strftime("%Y%m%d")
    out_path = OUT_DIR / f"{dataset_key}_{statbl_id}_{today}.json"
    if out_path.exists() and not force:
        print(f"[skip] {out_path.relative_to(config.ROOT)} 이미 있음 (--force 로 재수집)")
        return

    print(f"[start] {desc} ({statbl_id}) 수집 시작")
    first = _fetch_page(client, key, statbl_id, dtacycle_cd, page_no=1)
    total_count = first["SttsApiTblData"][0]["head"][0]["list_total_count"]
    rows: list[dict] = list(first["SttsApiTblData"][1]["row"])
    print(f"  page 1: {len(rows)} / {total_count}건")

    page_no = 2
    while len(rows) < total_count:
        time.sleep(REQUEST_DELAY_SEC)
        page = _fetch_page(client, key, statbl_id, dtacycle_cd, page_no=page_no)
        page_rows = page["SttsApiTblData"][1]["row"]
        if not page_rows:
            print(f"  page {page_no}: 빈 응답 → 중단")
            break
        rows.extend(page_rows)
        print(f"  page {page_no}: {len(rows)} / {total_count}건")
        page_no += 1

    if len(rows) != total_count:
        print(f"  [경고] 수집 {len(rows)}건 != API totalCount {total_count}건")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    envelope = {
        "source": "reb_rone_SttsApiTblData",
        "endpoint": ENDPOINT,
        "dataset_key": dataset_key,
        "statbl_id": statbl_id,
        "dtacycle_cd": dtacycle_cd,
        "description": desc,
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
    ap.add_argument("--datasets", nargs="+", default=list(TABLES), choices=list(TABLES), help="수집할 데이터셋 (기본: 전체)")
    ap.add_argument("--force", action="store_true", help="오늘자 파일이 있어도 재수집")
    args = ap.parse_args()

    key = require_env("REB_RONE_KEY")

    with httpx.Client() as client:
        for dataset_key in args.datasets:
            statbl_id, dtacycle_cd, desc = TABLES[dataset_key]
            collect_one(client, key, dataset_key, statbl_id, dtacycle_cd, desc, force=args.force)


if __name__ == "__main__":
    main()
