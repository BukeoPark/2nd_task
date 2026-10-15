"""전국 지하철·도시철도 위치·이용량 원천 수집 (1차: 서울 양천·영등포 + 인접 지역 우선).

수집 대상 (모두 키·접근은 .env 에서만 읽고 출력하지 않는다)
- seoul_master : 서울 열린데이터광장 subwayStationMaster — 수도권 역사 마스터(역사ID·역명·노선·위도·경도).
- seoul_card   : 서울 열린데이터광장 CardSubwayTime — 월별·노선별·역별 시간대 승하차 인원(교통카드). 2025-01 ~ 가장 최근 월.
- kakao        : 카카오 로컬 API — 지하철역(SW8)과 지하철출구 좌표. 파일럿 구역 + 버퍼 안만. 공식 철도기관 자료가 아니라 출입구 좌표의 유일한 보조 출처다.
- korail_metro : 한국철도공사_광역철도 역별 승하차실적(15100373, odcloud) — 연 단위.
- sr / ktx     : (주)에스알 월별역별(15131754) / 한국철도공사 KTX 상하행 역별(15108119) — 고속철도, 도시철도와 별도 유형.
- seoul_daily  : 서울교통공사 역별 일별 시간대별 승하차인원(15048032) — 2024 연 1회 버전(일×역×승·하차, 시간대별). 서울 카드 월별 자료(2025~)와 기간이 다르다.
- busan        : 부산교통공사 시간대별 승하차인원(3057229) — 2025(연)·2026-01~08 두 버전(일×역×승·하차).
- incheon      : 인천교통공사 역별일별 이용인원현황(15004329) — 최근 12개월 롤링 두 버전(2024-07~2025-06, 2025-07~2026-06)을 받아 2025 달력 연도를 덮는다.
- daegu_meta   : 대구교통공사 역별일별시간별 승하차(15002503) — 파일럿 밖이라 이용량은 받지 않고 버전·건수·필드만 기록(대량 호출 방지).

출력은 data/raw/rail/<이름>_<수집일>.json (기존 파일은 덮어쓰지 않음, --force 로 재수집). 키가 없으면 빈 파일을 만들지 않고 종료한다.
실행: .venv/bin/python -m pipelines.collect.collect_rail_transit [--datasets ...] [--months 202501 ...]
"""
from __future__ import annotations

import argparse
import json
import time
from datetime import date, datetime, timezone

import httpx
import pyproj
from shapely.geometry import Point, box
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from pipelines.collect.collect_bus_transit import ApiError, RetryableApiError, _get, _odcloud_rows, _pilot_union_5179, _rel, discover_versions
from pipelines.common import config
from pipelines.common.env import redact, require_env

OUT_DIR = config.RAW_DIR / "rail"
SEOUL = "http://openapi.seoul.go.kr:8088"
KAKAO = "https://dapi.kakao.com/v2/local/search"
SEOUL_PAGE = 1000
DELAY_SEC = 0.2
FIRST_MONTH = "202501"          # 이용량 집계 시작(버스 이용량 기준연도 2025 와 맞춘다)
BUFFER_M = 1_100                # transform.build_rail_stations 와 같은 값 — 파일럿 구역 밖으로 포함할 거리
EXIT_MAX_NO = 16                # 출구 번호 탐색 상한
EXIT_MISS_STOP = 3              # 연속으로 이 번호 수만큼 그 역 출구가 안 나오면 탐색 중단
KAKAO_PAD_M = 1_500             # 역 후보는 버퍼보다 조금 넓게 받아 두고 변환에서 자른다
TILE_DEG = 0.02                 # 카카오 사각형 검색 타일(약 1.8km × 2.2km) — 타일당 최대 45건 제한을 넘지 않게
ODCLOUD = {"korail_metro": "15100373/v1", "sr": "15131754/v1", "ktx": "15108119/v1", "daegu_meta": "15002503/v1"}
# 기간이 다른 버전을 함께 받는다 — 버전마다 실제 관측 기간이 다르므로 raw 파일마다 첫·마지막 날짜를 기록한다(변환에서 같은 기간처럼 합치지 않는다).
USAGE_VERSIONS = {
    "seoul_daily": ("15048032/v1", "수송일자", ["20241231"]),
    "busan": ("3057229/v1", "년월일", ["20251231", "20260831"]),
    "incheon": ("15004329/v1", "통행일자", ["20250630", "20260630"]),
}
DATASETS = ["seoul_master", "seoul_card", "kakao", "korail_metro", "sr", "ktx", "daegu_meta", *USAGE_VERSIONS]


@retry(reraise=True, stop=stop_after_attempt(4), wait=wait_exponential(multiplier=1, min=1, max=20),
       retry=retry_if_exception_type((httpx.TransportError, RetryableApiError)))
def _json(client: httpx.Client, url: str, secret: str, headers: dict | None = None, params: dict | None = None) -> dict:
    """GET → JSON. 오류 메시지·URL 에서 키를 지운다(서울 키는 URL 경로에 들어간다)."""
    try:
        resp = client.get(url, headers=headers, params=params, timeout=60.0)
    except httpx.TransportError as e:
        raise httpx.TransportError(redact(str(e), secret)) from None
    if resp.status_code in (429, 500, 502, 503, 504):
        raise RetryableApiError(f"HTTP {resp.status_code}")
    if resp.status_code != 200:
        raise ApiError(f"HTTP {resp.status_code}: {redact(resp.text[:200], secret)}")
    try:
        return resp.json()
    except ValueError:
        raise ApiError(f"JSON 이 아닌 응답: {redact(resp.text[:200], secret)}") from None


def _write(name: str, today: str, envelope: dict) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"{name}_{today}.json"
    envelope.setdefault("collected_at", datetime.now(timezone.utc).isoformat())
    with out.open("w", encoding="utf-8") as f:
        json.dump(envelope, f, ensure_ascii=False)
    print(f"[done] 저장: {_rel(out)} ({envelope['item_count']:,}건)")


def _exists(name: str, today: str, force: bool) -> bool:
    out = OUT_DIR / f"{name}_{today}.json"
    if out.exists() and not force:
        print(f"[skip] {_rel(out)} 이미 있음 (--force 로 재수집)")
        return True
    return False


# ── 서울 열린데이터광장 ─────────────────────────────────────────────────────────────────────────

def _seoul_rows(client: httpx.Client, key: str, service: str, arg: str = "") -> tuple[list[dict], int]:
    """서울 OpenAPI 한 서비스의 전 행 → (행, 원천 list_total_count). 없는 달·서비스는 ([], 0)."""
    rows: list[dict] = []
    start, total = 1, 0
    while True:
        end = start + SEOUL_PAGE - 1
        body = _json(client, f"{SEOUL}/{key}/json/{service}/{start}/{end}/{arg}", key)
        block = body.get(service)
        if not block:
            code = (body.get("RESULT") or {}).get("CODE")
            if code == "INFO-200":
                return [], 0
            raise ApiError(f"서울 OpenAPI 오류: {service} {code}")
        total = int(block.get("list_total_count", 0))
        rows.extend(block.get("row") or [])
        if end >= total:
            return rows, total
        start = end + 1
        time.sleep(DELAY_SEC)


def collect_seoul_master(client: httpx.Client, key: str, today: str, force: bool) -> None:
    if _exists("seoul_master", today, force):
        return
    rows, total = _seoul_rows(client, key, "subwayStationMaster")
    print(f"[seoul_master] 원천 {total:,}건 / 수집 {len(rows):,}건")
    _write("seoul_master", today, {"source": "seoul_openapi", "service": "subwayStationMaster", "source_total_count": total, "item_count": len(rows), "rows": rows})


def _latest_card_month(client: httpx.Client, key: str) -> str:
    """CardSubwayTime 에 자료가 있는 가장 최근 월(이번 달부터 거꾸로 확인)."""
    y, m = date.today().year, date.today().month
    for _ in range(24):
        ym = f"{y}{m:02d}"
        rows = _json(client, f"{SEOUL}/{key}/json/CardSubwayTime/1/1/{ym}/", key).get("CardSubwayTime")
        if rows and int(rows.get("list_total_count", 0)) > 0:
            return ym
        y, m = (y, m - 1) if m > 1 else (y - 1, 12)
    raise ApiError("CardSubwayTime 에서 최근 24개월 자료를 찾지 못했습니다")


def _months(first: str, last: str) -> list[str]:
    out, y, m = [], int(first[:4]), int(first[4:])
    while f"{y}{m:02d}" <= last:
        out.append(f"{y}{m:02d}")
        y, m = (y, m + 1) if m < 12 else (y + 1, 1)
    return out


def collect_seoul_card(client: httpx.Client, key: str, months: list[str] | None, today: str, force: bool) -> None:
    last = _latest_card_month(client, key) if not months else max(months)
    for ym in months or _months(FIRST_MONTH, last):
        if _exists(f"seoul_card_{ym}", today, force):
            continue
        rows, total = _seoul_rows(client, key, "CardSubwayTime", f"{ym}/")
        print(f"[seoul_card {ym}] 원천 {total:,}건 / 수집 {len(rows):,}건")
        if not rows:
            print(f"[warn] {ym}: 자료 없음 — 저장하지 않음")
            continue
        _write(f"seoul_card_{ym}", today, {"source": "seoul_openapi", "service": "CardSubwayTime", "month": ym, "source_total_count": total, "item_count": len(rows), "rows": rows})
        time.sleep(DELAY_SEC)


# ── 카카오 로컬(역·출구 좌표, 파일럿 + 버퍼 안만) ──────────────────────────────────────────────

def _tiles() -> list[tuple[float, float, float, float]]:
    """파일럿 구역 + (BUFFER_M+KAKAO_PAD_M) 를 덮는 WGS84 사각형 타일 (x1,y1,x2,y2). 결정적 순서."""
    union, _ = _pilot_union_5179()
    zone = union.buffer(BUFFER_M + KAKAO_PAD_M)
    to_wgs = pyproj.Transformer.from_crs(config.CRS_METRIC, config.CRS_WGS84, always_xy=True).transform
    from shapely.ops import transform as shp_transform
    zone_wgs = shp_transform(to_wgs, zone)
    minx, miny, maxx, maxy = zone_wgs.bounds
    out, y = [], miny
    while y < maxy:
        x = minx
        while x < maxx:
            tile = box(x, y, x + TILE_DEG, y + TILE_DEG)
            if tile.intersects(zone_wgs):
                out.append((round(x, 5), round(y, 5), round(x + TILE_DEG, 5), round(y + TILE_DEG, 5)))
            x += TILE_DEG
        y += TILE_DEG
    return out


def _kakao_pages(client: httpx.Client, key: str, endpoint: str, params: dict) -> list[dict]:
    """카카오 로컬 검색을 최대 3쪽(45건, 카카오 한도)까지. 종료 조건은 meta.is_end."""
    docs: list[dict] = []
    for page in (1, 2, 3):
        body = _json(client, f"{KAKAO}/{endpoint}.json", key, headers={"Authorization": f"KakaoAK {key}"}, params={**params, "size": 15, "page": page})
        docs.extend(body.get("documents") or [])
        if (body.get("meta") or {}).get("is_end", True):
            break
        time.sleep(DELAY_SEC)
    return docs


def collect_kakao(client: httpx.Client, key: str, today: str, force: bool) -> None:
    if _exists("kakao_stations", today, force) and _exists("kakao_exits", today, force):
        return
    stations: dict[str, dict] = {}
    capped = 0
    for (x1, y1, x2, y2) in _tiles():
        docs = _kakao_pages(client, key, "category", {"category_group_code": "SW8", "rect": f"{x1},{y1},{x2},{y2}"})
        capped += len(docs) >= 45          # 한도에 닿은 타일 — 이 타일은 빠진 역이 있을 수 있어 타일을 더 잘게 나눠야 한다
        for d in docs:
            stations[d["id"]] = d
        time.sleep(DELAY_SEC)
    ordered = [stations[k] for k in sorted(stations)]
    print(f"[kakao] 역 {len(ordered)}곳 (한도 45건에 닿은 타일 {capped}개)")
    _write("kakao_stations", today, {"source": "kakao_local", "endpoint": "category SW8", "tile_deg": TILE_DEG, "capped_tiles": capped, "item_count": len(ordered), "rows": ordered})

    # 출구: '<역> 출구' 한 번의 키워드 검색은 결과가 2~3건뿐이라 대부분 누락된다 → 출구 번호별('<역> N번출구')로 찾고,
    # 연속 EXIT_MISS_STOP 개 번호에서 그 역의 출구가 안 나오면 멈춘다. 호출량을 줄이려 파일럿 + (버퍼+300m) 안의 역만 찾는다.
    union, to_m = _pilot_union_5179()
    near = [st for st in ordered if union.distance(Point(*to_m(float(st["x"]), float(st["y"])))) <= BUFFER_M + 300]
    exits: dict[str, dict] = {}
    queries = 0
    for st in near:
        x, y = float(st["x"]), float(st["y"])
        pad = 0.008          # 약 700m — 역에서 출구까지 충분
        miss = 0
        for n in range(1, EXIT_MAX_NO + 1):
            docs = _kakao_pages(client, key, "keyword", {"query": f"{st['place_name']} {n}번출구", "rect": f"{x - pad},{y - pad},{x + pad},{y + pad}"})
            queries += 1
            hit = False
            for d in docs:
                if "지하철출구" in (d.get("category_name") or ""):
                    exits[d["id"]] = {**d, "query_station_id": st["id"]}
                    hit |= d["place_name"].startswith(st["place_name"]) and d["place_name"].endswith(f"{n}번출구")
            miss = 0 if hit else miss + 1
            if miss >= EXIT_MISS_STOP:
                break
            time.sleep(DELAY_SEC)
    rows = [exits[k] for k in sorted(exits)]
    print(f"[kakao] 출구 {len(rows)}곳 (역 {len(near)}곳, 검색 {queries}회)")
    _write("kakao_exits", today, {"source": "kakao_local", "endpoint": "keyword '<역> N번출구' (카테고리 지하철출구만)", "stations_queried": len(near), "queries": queries, "item_count": len(rows), "rows": rows})


# ── odcloud (광역철도·고속철도·대구) ────────────────────────────────────────────────────────────

def collect_odcloud_rail(client: httpx.Client, key: str, name: str, today: str, force: bool) -> None:
    if _exists(name, today, force):
        return
    ns = ODCLOUD[name]
    versions = discover_versions(client, ns)
    latest = versions[-1]
    if name == "daegu_meta":
        # 일별·시간별 원본이 매월 수만 건이라 파일럿 밖 지역의 이용량은 받지 않는다 — 버전·건수·필드만 기록
        body = _get(client, f"https://api.odcloud.kr/api/{ns}/{latest['uddi']}", {"page": 1, "perPage": 1, "returnType": "JSON"}, key)
        _write(name, today, {"source": f"odcloud_{ns.split('/')[0]}", "dataset": name, "version": latest["date"], "version_label": latest["label"], "versions_count": len(versions),
                             "first_version": versions[0]["date"], "source_total_count": body.get("totalCount"), "fields": list((body.get("data") or [{}])[0].keys()),
                             "item_count": 0, "rows": []})
        return
    rows, match, total = _odcloud_rows(client, key, ns, latest["uddi"], {})
    print(f"[{name}] 버전 {latest['date']} 원천 {total:,}건 / 수집 {len(rows):,}건")
    _write(name, today, {"source": f"odcloud_{ns.split('/')[0]}", "dataset": name, "version": latest["date"], "version_label": latest["label"],
                         "all_versions": [v["date"] for v in versions], "source_total_count": total, "item_count": len(rows), "rows": rows})


def collect_usage_versions(client: httpx.Client, key: str, name: str, today: str, force: bool) -> None:
    """운영기관별 일별 승하차 — 지정한 공개 버전을 각각 별도 raw 파일로(버전마다 관측 기간이 다르다)."""
    ns, date_field, wanted = USAGE_VERSIONS[name]
    by_date = {v["date"]: v for v in discover_versions(client, ns)}
    for ver in wanted:
        tag = f"{name}_{ver}"
        if _exists(tag, today, force):
            continue
        v = by_date.get(ver)
        if v is None:
            print(f"[warn] {name}: 버전 {ver} 이 공개 목록에 없음 — 건너뜀 (있는 버전: {sorted(by_date)[-4:]})")
            continue
        rows, match, total = _odcloud_rows(client, key, ns, v["uddi"], {})
        dates = sorted({str(r.get(date_field)) for r in rows if r.get(date_field)})
        print(f"[{tag}] 원천 {total:,}건 / 수집 {len(rows):,}건 · 관측 {dates[0] if dates else '-'} ~ {dates[-1] if dates else '-'}")
        _write(tag, today, {"source": f"odcloud_{ns.split('/')[0]}", "dataset": name, "version": ver, "version_label": v["label"], "date_field": date_field,
                            "period_first": dates[0] if dates else None, "period_last": dates[-1] if dates else None, "source_total_count": total,
                            "item_count": len(rows), "rows": rows})


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--datasets", nargs="+", default=DATASETS, choices=DATASETS)
    ap.add_argument("--months", nargs="+", help="seoul_card 월 YYYYMM(기본: 202501 ~ 가장 최근 월)")
    ap.add_argument("--force", action="store_true", help="오늘자 파일이 있어도 재수집")
    args = ap.parse_args()

    today = date.today().strftime("%Y%m%d")
    with httpx.Client() as client:
        if "seoul_master" in args.datasets or "seoul_card" in args.datasets:
            skey = require_env("SEOUL_OPENAPI_KEY")
            if "seoul_master" in args.datasets:
                collect_seoul_master(client, skey, today, args.force)
            if "seoul_card" in args.datasets:
                collect_seoul_card(client, skey, args.months, today, args.force)
        if "kakao" in args.datasets:
            collect_kakao(client, require_env("KAKAO_REST_API_KEY"), today, args.force)
        od = [d for d in args.datasets if d in ODCLOUD]
        uv = [d for d in args.datasets if d in USAGE_VERSIONS]
        if od or uv:
            dkey = require_env("DATA_GO_KR_KEY")
            for name in od:
                collect_odcloud_rail(client, dkey, name, today, args.force)
            for name in uv:
                collect_usage_versions(client, dkey, name, today, args.force)


if __name__ == "__main__":
    main()
