"""카카오 로컬 키워드 검색으로 R-ONE 상권권역 이름의 좌표 후보를 모은다.

배경: 한국부동산원 R-ONE 임대동향 통계는 상권을 "영등포역"·"당산역" 같은
이름으로만 주고 좌표를 안 준다(pipelines.collect.collect_reb_rone 참고).
지하철역 이름으로 검색하면 대부분 정확히 매칭되므로, 각 상권명을 그대로
질의해 후보 POI를 원본 그대로 저장한다. 대표 좌표 선택(같은 역 여러 호선
평균, 비-지하철 결과 배제 등)은 transform 단계(build_reb_zone_coords)에서 한다.

실행
----
프로젝트 루트에서: .venv/bin/python -m pipelines.collect.collect_kakao_geocode [--force]

출력
----
data/raw/kakao/reb_zone_geocode_<YYYYMMDD>.json
    { source, endpoint, collected_at, queries: [ {query, documents:[원본 그대로]} ] }
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

ENDPOINT = "https://dapi.kakao.com/v2/local/search/keyword.json"
REQUEST_DELAY_SEC = 0.2
OUT_DIR = config.RAW_DIR / "kakao"

# R-ONE 임대동향 상권명 중 파일럿 두 구와 관련된 것들(collect_reb_rone 결과 확인해서 고름).
REB_ZONE_QUERIES = ["영등포역", "당산역", "여의도역", "목동역", "까치산역"]


@retry(
    reraise=True,
    stop=stop_after_attempt(4),
    wait=wait_exponential(multiplier=1, min=1, max=20),
    retry=retry_if_exception_type((httpx.TransportError, httpx.HTTPStatusError)),
)
def _search(client: httpx.Client, rest_key: str, query: str) -> dict:
    resp = client.get(
        ENDPOINT,
        headers={"Authorization": f"KakaoAK {rest_key}"},
        params={"query": query, "size": 5},
        timeout=15.0,
    )
    resp.raise_for_status()
    return resp.json()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    today = date.today().strftime("%Y%m%d")
    out_path = OUT_DIR / f"reb_zone_geocode_{today}.json"
    if out_path.exists() and not args.force:
        print(f"[skip] {out_path.relative_to(config.ROOT)} 이미 있음 (--force 로 재수집)")
        return

    rest_key = require_env("KAKAO_REST_API_KEY")
    queries = []
    with httpx.Client() as client:
        for q in REB_ZONE_QUERIES:
            payload = _search(client, rest_key, q)
            queries.append({"query": q, "documents": payload["documents"]})
            print(f"  {q}: {len(payload['documents'])}건")
            time.sleep(REQUEST_DELAY_SEC)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    envelope = {
        "source": "kakao_local_search_keyword",
        "endpoint": ENDPOINT,
        "collected_at": datetime.now(timezone.utc).isoformat(),
        "queries": queries,
    }
    with out_path.open("w", encoding="utf-8") as f:
        json.dump(envelope, f, ensure_ascii=False)
    print(f"저장: {out_path.relative_to(config.ROOT)}")


if __name__ == "__main__":
    main()
