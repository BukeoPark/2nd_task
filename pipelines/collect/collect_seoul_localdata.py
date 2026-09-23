"""서울 자치구별 인허가(LOCALDATA) + 모범음식점 지정 현황 수집 (파일럿 자치구만).

실행: .venv/bin/python -m pipelines.collect.collect_seoul_localdata [--codes 072404 051801] [--force]
출력: data/raw/seoul_localdata/<서비스명>_<YYYYMMDD>.json
      data/raw/seoul_localdata/_manifest_<YYYYMMDD>.json  (서비스별 건수·실패 사유)

서비스가 해당 구에 없으면(ERROR-500 등) 실패로 기록만 하고 다음으로 넘어간다 —
'연결된 원천이 없음'과 '데이터 0건'을 나중에 구분할 수 있게 manifest 에 남긴다.
"""
from __future__ import annotations

import argparse
import json
import time
from datetime import date, datetime, timezone

import httpx

from pipelines.collect.collect_seoul_trdar import ApiError, PAGE_SIZE, REQUEST_DELAY_SEC, _fetch_page
from pipelines.common import config
from pipelines.common.env import require_env
from pipelines.common.sources import LICENSE_SERVICES, SEOUL_GU_SUFFIX, SEOUL_MODEL_RESTAURANT_SERVICE

OUT_DIR = config.RAW_DIR / "seoul_localdata"


# 이 API 는 페이지 정렬이 요청마다 달라진다(2026-09-23 확인: 같은 5001~6000 구간을 두 번 요청하면 1,000건 중 751건만 겹침).
# 한 번 순회하면 일부 행이 중복되고 일부는 누락되므로, 전 구간을 여러 번 순회해 합친다.
# 새로 늘어나는 고유 행이 없는 순회가 STABLE_PASSES 번 연속되면 멈춘다.
MAX_PASSES = 12
STABLE_PASSES = 2


def _collect_service(client: httpx.Client, key: str, service: str) -> tuple[list[dict], int, int]:
    total = _fetch_page(client, key, service, 1, 1, None)["list_total_count"]
    seen: dict[str, dict] = {}
    stable, passes = 0, 0
    while passes < MAX_PASSES and stable < STABLE_PASSES:
        passes += 1
        before = len(seen)
        for start in range(1, total + 1, PAGE_SIZE):
            end = min(start + PAGE_SIZE - 1, total)
            for row in _fetch_page(client, key, service, start, end, None).get("row", []):
                # 내용까지 같은 행만 합친다(같은 관리번호라도 내용이 다르면 둘 다 보존).
                seen.setdefault(json.dumps(row, ensure_ascii=False, sort_keys=True), row)
            time.sleep(REQUEST_DELAY_SEC)
        stable = stable + 1 if len(seen) == before else 0
        if len(seen) >= total:
            break
    return list(seen.values()), total, passes


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--codes", nargs="*", default=list(LICENSE_SERVICES))
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    key = require_env("SEOUL_OPENAPI_KEY")
    today = date.today().strftime("%Y%m%d")
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    targets: list[tuple[str, str, str, str]] = []  # (kind, code, sigungu_cd, service)
    for code in args.codes:
        for sgg, suffix in SEOUL_GU_SUFFIX.items():
            targets.append(("license", code, sgg, LICENSE_SERVICES[code].service_name(suffix)))
    for sgg, service in SEOUL_MODEL_RESTAURANT_SERVICE.items():
        targets.append(("model_restaurant", "", sgg, service))

    manifest = []
    with httpx.Client() as client:
        for kind, code, sgg, service in targets:
            out = OUT_DIR / f"{service}_{today}.json"
            if out.exists() and not args.force:
                manifest.append({"service": service, "kind": kind, "code": code, "sigungu_cd": sgg, "status": "skipped_exists"})
                continue
            try:
                rows, total, passes = _collect_service(client, key, service)
            except (ApiError, httpx.HTTPError) as e:
                # 키가 섞인 URL 이 예외 메시지에 들어갈 수 있어 유형만 남긴다.
                manifest.append({"service": service, "kind": kind, "code": code, "sigungu_cd": sgg,
                                 "status": "failed", "reason": type(e).__name__})
                print(f"[fail] {service}: {type(e).__name__}")
                continue
            with out.open("w", encoding="utf-8") as f:
                json.dump({"source": "seoul_localdata" if kind == "license" else "seoul_model_restaurant",
                           "service": service, "code": code, "sigungu_cd": sgg,
                           "collected_at": datetime.now(timezone.utc).isoformat(),
                           "total_count": total, "item_count": len(rows), "passes": passes,
                           "note": "페이지 정렬이 불안정해 여러 번 순회 후 동일 내용 행만 합침",
                           "rows": rows}, f, ensure_ascii=False)
            manifest.append({"service": service, "kind": kind, "code": code, "sigungu_cd": sgg,
                             "status": "ok", "total_count": total, "item_count": len(rows), "passes": passes})
            print(f"[ok] {service}: 고유 {len(rows):,} / 원천 {total:,} ({passes}회 순회)")
            time.sleep(REQUEST_DELAY_SEC)

    # 같은 날 일부 코드만 다시 수집해도 앞선 기록(실패 사유 등)이 지워지지 않게 서비스 단위로 병합한다.
    manifest_path = OUT_DIR / f"_manifest_{today}.json"
    merged = {m["service"]: m for m in (json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else [])}
    merged.update({m["service"]: m for m in manifest if m["status"] != "skipped_exists" or m["service"] not in merged})
    with manifest_path.open("w", encoding="utf-8") as f:
        json.dump(list(merged.values()), f, ensure_ascii=False, indent=1)
    failed = [m["service"] for m in manifest if m["status"] == "failed"]
    print(f"완료: {len(manifest)}개 서비스, 실패 {len(failed)}개 {failed}")


if __name__ == "__main__":
    main()
