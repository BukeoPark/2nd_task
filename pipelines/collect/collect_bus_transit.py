"""전국 버스 교통 데이터 수집 — 정류장 위치(국토교통부)·정류장 일일 평균 승하차(국토교통부)·TAGO 정류소정보(대조용).

실행 (프로젝트 루트):
    .venv/bin/python -m pipelines.collect.collect_bus_transit
    .venv/bin/python -m pipelines.collect.collect_bus_transit --datasets loc usage        # TAGO 격자 조회 생략
    .venv/bin/python -m pipelines.collect.collect_bus_transit --loc-version 20241028 --force

키: 프로젝트 루트 .env 의 DATA_GO_KR_KEY(공공데이터포털 일반 인증키). 코드·로그·원본 파일·오류 메시지에 키를 남기지 않는다(오류는 redact 처리).

무엇을 받는가 (모두 data/raw/bus/<dataset>_<수집일>.json, 같은 날짜 파일이 있으면 건너뜀)
  loc    국토교통부_전국 버스정류장 위치정보(15067528/v1) — 정류장번호·모바일단축번호·정류장명·위경도(WGS84)·도시코드·관리도시명
         이 데이터는 기준일별 버전(2023-10-16·2024-10-28·2025-10-31)이 따로 공개돼, 공개 Swagger 에서 버전 목록을 읽고 가장 최근(또는 --loc-version) 것을 쓴다.
         파일럿(양천·영등포) 반경 1km 계산이 구 경계에서 끊기지 않도록 서울특별시와 경계에 닿는 경기·인천(부천·광명·인천)을 함께 받는다(--cities).
  usage  국토교통부_시군구별 정류장평균이용량(15162142/v1) — 2025년 정류장별 일일 평균 승차·하차·환승 이용량(서울 시도코드 11 전체).
         이름은 '시군구별'이지만 행 단위는 정류장이고 시군구 코드는 소속 구를 나타낸다.
  tago   국토교통부 TAGO 버스정류소정보(BusSttnInfoInqireService) — 서울은 도시 목록에 없어 도시 코드로는 받을 수 없다.
         그래서 파일럿 구역을 격자로 훑어 getCrdntPrxmtSttnList(좌표 근접 조회)로 '서울 안에 있는 타 도시 BIS 정류소'를 받아 위치정보와 코드로 대조하는 데 쓴다.

원본은 가공 없이 저장한다(필드 선택·형 변환·정제는 transform.build_bus_stops).
"""
from __future__ import annotations

import argparse
import json
import re
import time
from datetime import date, datetime, timezone

import httpx
import pyproj
from shapely.geometry import Point, shape
from shapely.ops import transform as shp_transform
from shapely.ops import unary_union
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from pipelines.common import config
from pipelines.common.env import redact, require_env

ODCLOUD = "https://api.odcloud.kr/api"
SWAGGER = "https://infuser.odcloud.kr/oas/docs"
TAGO = "https://apis.data.go.kr/1613000/BusSttnInfoInqireService"
PAGE_SIZE = 1000
DELAY_SEC = 0.2
OUT_DIR = config.RAW_DIR / "bus"
LOC_NAMESPACE = "15067528/v1"
USAGE_NAMESPACE = "15162142/v1"
DEFAULT_CITIES = ["서울특별시", "경기도 부천시", "경기도 광명시", "인천광역시"]
USAGE_SIDO_CODE = "11"  # 서울
TAGO_GRID_STEP_M = 600  # 근접 조회 반경이 약 500m 라 대각선(≈424m)까지 덮이는 간격
TAGO_PAD_M = 700        # 파일럿 구역 밖으로 이만큼까지 조회(구 경계 근처 정류소 포함)
TAGO_ROWS = 200
TAGO_SESSION_RETRIES = 6   # 일시 오류(세션 부족 resultCode 99·게이트웨이 오류) 재시도 횟수
TAGO_SESSION_WAIT_SEC = 3


class ApiError(RuntimeError):
    """응답 오류. 메시지에는 키를 넣지 않는다."""


class RetryableApiError(ApiError):
    """429·5xx — 잠시 뒤 다시 시도."""


@retry(reraise=True, stop=stop_after_attempt(4), wait=wait_exponential(multiplier=1, min=1, max=20),
       retry=retry_if_exception_type((httpx.TransportError, RetryableApiError)))
def _get(client: httpx.Client, url: str, params: dict, key: str) -> dict:
    """GET → JSON. 오류 메시지에서 키(와 키가 들어간 URL)를 지운다."""
    try:
        resp = client.get(url, params={**params, "serviceKey": key}, timeout=60.0)
    except httpx.TransportError as e:
        raise httpx.TransportError(redact(str(e), key)) from None
    if resp.status_code in (429, 500, 502, 503, 504):
        raise RetryableApiError(f"HTTP {resp.status_code}")
    if resp.status_code != 200:
        raise ApiError(f"HTTP {resp.status_code}: {redact(resp.text[:200], key)}")
    try:
        return resp.json()
    except ValueError:
        raise ApiError(f"JSON 이 아닌 응답: {redact(resp.text[:200], key)}") from None


def discover_versions(client: httpx.Client, namespace: str) -> list[dict]:
    """공개 Swagger 에서 데이터 버전 목록을 읽는다 — [{uddi, label, date(YYYYMMDD|None)}] 날짜 오름차순. 키가 필요 없다."""
    spec = client.get(SWAGGER, params={"namespace": namespace}, timeout=60.0).json()
    out = []
    for path, ops in spec["paths"].items():
        label = next(iter(ops.values())).get("summary", "")
        m = re.search(r"_(\d{8})$", label)
        out.append({"uddi": path.split("/")[-1], "label": label, "date": m.group(1) if m else None})
    return sorted(out, key=lambda v: v["date"] or "")


def _odcloud_rows(client: httpx.Client, key: str, namespace: str, uddi: str, cond: dict[str, str]) -> tuple[list[dict], int, int]:
    """한 조건(필터)의 전 행. (행, 원천 matchCount, 원천 totalCount)."""
    url = f"{ODCLOUD}/{namespace}/{uddi}"
    rows: list[dict] = []
    page, match, total = 1, 0, 0
    while True:
        body = _get(client, url, {"page": page, "perPage": PAGE_SIZE, "returnType": "JSON", **cond}, key)
        match, total = int(body.get("matchCount", 0)), int(body.get("totalCount", 0))
        batch = body.get("data") or []
        rows.extend(batch)
        if not batch or len(rows) >= match:
            break
        page += 1
        time.sleep(DELAY_SEC)
    return rows, match, total


def _rel(path) -> str:
    """로그용 경로 — 프로젝트 안이면 루트 기준 상대경로, 아니면 파일 이름."""
    try:
        return str(path.relative_to(config.ROOT))
    except ValueError:
        return path.name


def _write(name: str, today: str, envelope: dict) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"{name}_{today}.json"
    with out.open("w", encoding="utf-8") as f:
        json.dump(envelope, f, ensure_ascii=False)
    print(f"[done] 저장: {_rel(out)} ({envelope['item_count']:,}건)")


def _exists(name: str, today: str, force: bool) -> bool:
    out = OUT_DIR / f"{name}_{today}.json"
    if out.exists() and not force:
        print(f"[skip] {_rel(out)} 이미 있음 (--force 로 재수집)")
        return True
    return False


def collect_odcloud(client: httpx.Client, key: str, dataset: str, namespace: str, conds: list[tuple[str, dict[str, str]]],
                    version: str | None, today: str, force: bool) -> None:
    if _exists(dataset, today, force):
        return
    versions = discover_versions(client, namespace)
    if version:
        chosen = next((v for v in versions if v["date"] == version), None)
        if chosen is None:
            raise SystemExit(f"{namespace} 에 {version} 버전이 없습니다. 있는 버전: {[v['date'] for v in versions]}")
    else:
        chosen = versions[-1]
    print(f"[start] {dataset} {namespace} 버전 {chosen['date']} ({chosen['label']}) — 전체 버전 {[v['date'] for v in versions]}")
    rows: list[dict] = []
    per_filter = []
    for label, cond in conds:
        got, match, total = _odcloud_rows(client, key, namespace, chosen["uddi"], cond)
        per_filter.append({"filter": label, "cond": cond, "match_count": match, "item_count": len(got), "source_total_count": total})
        flag = "" if len(got) == match else f"  [경고] 수집 {len(got)} != 원천 {match}"
        print(f"  {label}: {len(got):,}/{match:,}건{flag}")
        rows.extend(got)
        time.sleep(DELAY_SEC)
    _write(dataset, today, {
        "source": f"odcloud_{namespace.split('/')[0]}", "dataset": dataset, "endpoint": f"{ODCLOUD}/{namespace}/{chosen['uddi']}",
        "version": chosen["date"], "version_label": chosen["label"], "all_versions": [v["date"] for v in versions],
        "filters": per_filter, "collected_at": datetime.now(timezone.utc).isoformat(), "item_count": len(rows), "rows": rows})


# ── TAGO: 파일럿 구역 격자 조회 ──────────────────────────────────────────────────────────────

def _pilot_union_5179():
    gj = json.loads((config.PROCESSED_DIR / "regions.geojson").read_text(encoding="utf-8"))
    to_m = pyproj.Transformer.from_crs(config.CRS_WGS84, config.CRS_METRIC, always_xy=True).transform
    return unary_union([shp_transform(to_m, shape(f["geometry"])) for f in gj["features"]]), to_m


def tago_grid_points() -> list[tuple[float, float]]:
    """파일럿 구역(+TAGO_PAD_M)을 덮는 격자 점들의 (위도, 경도). 결정적 순서."""
    union, _ = _pilot_union_5179()
    zone = union.buffer(TAGO_PAD_M)
    to_wgs = pyproj.Transformer.from_crs(config.CRS_METRIC, config.CRS_WGS84, always_xy=True).transform
    minx, miny, maxx, maxy = zone.bounds
    pts, y = [], miny
    while y <= maxy:
        x = minx
        while x <= maxx:
            if zone.contains(Point(x, y)):
                lon, lat = to_wgs(x, y)
                pts.append((round(lat, 6), round(lon, 6)))
            x += TAGO_GRID_STEP_M
        y += TAGO_GRID_STEP_M
    return pts


def _tago_page(client: httpx.Client, key: str, lat: float, lon: float, page: int) -> tuple[list[dict], int]:
    """TAGO 좌표 근접 조회 한 페이지 → (정류소 목록, 원천 totalCount). 결과가 없으면 items 가 빈 문자열로 온다."""
    # 일시 오류는 HTTP 200 으로 온다: resultCode 99("가용한 세션이 존재하지 않습니다") 또는 헤더 없는 게이트웨이 오류 — 잠시 뒤 다시 시도한다.
    for attempt in range(1, TAGO_SESSION_RETRIES + 1):
        resp = _get(client, f"{TAGO}/getCrdntPrxmtSttnList",
                    {"_type": "json", "gpsLati": lat, "gpsLong": lon, "numOfRows": TAGO_ROWS, "pageNo": page}, key).get("response") or {}
        header = resp.get("header") or {}
        # 헤더 자체가 없는 응답(게이트웨이 HTTP_ERROR 04 등 OpenAPI_ServiceResponse)도 일시 오류라 같이 재시도한다.
        transient = header.get("resultCode") is None or str(header.get("resultCode")) == "99"
        if transient and attempt < TAGO_SESSION_RETRIES:
            time.sleep(TAGO_SESSION_WAIT_SEC * attempt)
            continue
        break
    if header.get("resultCode") != "00":
        raise ApiError(f"TAGO 오류: {header.get('resultCode')} {header.get('resultMsg')}")
    body = resp.get("body")
    if not isinstance(body, dict):
        return [], 0
    items = body.get("items")
    batch = items.get("item", []) if isinstance(items, dict) else []
    return ([batch] if isinstance(batch, dict) else list(batch)), int(body.get("totalCount") or 0)


def collect_tago(client: httpx.Client, key: str, today: str, force: bool) -> None:
    if _exists("tago_grid", today, force):
        return
    if not (config.PROCESSED_DIR / "regions.geojson").exists():
        raise SystemExit("data/processed/regions.geojson 가 없습니다 — transform.build_regions 를 먼저 실행하세요(TAGO 격자 범위용)")
    cities = _get(client, f"{TAGO}/getCtyCodeList", {"_type": "json"}, key)["response"]["body"]["items"]["item"]
    seoul_listed = any(c["citycode"] == 11 or "서울" in c["cityname"] for c in cities)
    pts = tago_grid_points()
    print(f"[start] TAGO 좌표 근접 조회 — 격자 {len(pts)}점(간격 {TAGO_GRID_STEP_M}m), 도시 목록 {len(cities)}곳, 서울 포함 여부: {seoul_listed}")
    rows: dict[str, dict] = {}
    calls = nonempty = 0
    for lat, lon in pts:
        page = 1
        while True:
            batch, total = _tago_page(client, key, lat, lon, page)
            calls += 1
            for it in batch:
                rows.setdefault(str(it["nodeid"]), it)  # 같은 정류소가 여러 격자 점에서 잡힘 → nodeid 로 한 번만
            nonempty += bool(batch)
            if page * TAGO_ROWS >= total:
                break
            page += 1
        time.sleep(DELAY_SEC)
    print(f"  호출 {calls}회, 결과가 있던 격자점 {nonempty}/{len(pts)}, 고유 정류소 {len(rows):,}건")
    _write("tago_grid", today, {
        "source": "tago_BusSttnInfoInqireService", "dataset": "tago_grid", "endpoint": f"{TAGO}/getCrdntPrxmtSttnList",
        "grid_step_m": TAGO_GRID_STEP_M, "grid_points": len(pts), "city_list_count": len(cities), "seoul_in_city_list": seoul_listed,
        "collected_at": datetime.now(timezone.utc).isoformat(), "item_count": len(rows),
        "rows": [rows[k] for k in sorted(rows)]})


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--datasets", nargs="+", default=["loc", "usage", "tago"], choices=["loc", "usage", "tago"])
    ap.add_argument("--loc-version", help="위치정보 기준일 YYYYMMDD(기본: 가장 최근 버전)")
    ap.add_argument("--cities", nargs="+", default=DEFAULT_CITIES, help="위치정보에서 받을 도시명(원천의 '도시명' 값)")
    ap.add_argument("--force", action="store_true", help="오늘자 파일이 있어도 재수집")
    args = ap.parse_args()

    key = require_env("DATA_GO_KR_KEY")
    today = date.today().strftime("%Y%m%d")
    with httpx.Client() as client:
        if "loc" in args.datasets:
            collect_odcloud(client, key, "loc", LOC_NAMESPACE, [(c, {"cond[도시명::EQ]": c}) for c in args.cities], args.loc_version, today, args.force)
        if "usage" in args.datasets:
            collect_odcloud(client, key, "usage", USAGE_NAMESPACE, [(f"시도코드 {USAGE_SIDO_CODE}(서울)", {"cond[시도코드(법정동)::EQ]": USAGE_SIDO_CODE})],
                            None, today, args.force)
        if "tago" in args.datasets:
            collect_tago(client, key, today, args.force)


if __name__ == "__main__":
    main()
