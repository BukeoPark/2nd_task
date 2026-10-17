"""주요 집객시설(종합병원·대학교·백화점·쇼핑몰·아울렛·대형마트·영화관·문화시설) 개별 시설 원천 수집 — 1차: 서울 양천·영등포 + 인접 지역.

서울시 시설 '수'(상권·행정동 단위 집계, collect_seoul_trdar 의 *_facility)와 달리 이 파이프라인은 시설 하나하나의 이름·주소·좌표를 모은다. 둘을 섞지 않는다.

수집 대상 (키는 .env 에서만 읽고 출력하지 않는다)
- seoul_cultural : 서울 열린데이터광장 culturalSpaceInfo — 서울시 문화공간 전체(공연장·미술관·박물관·도서관 등, 좌표 있음. X_COORD 가 위도·Y_COORD 가 경도로 뒤바뀌어 제공됨).
- seoul_college  : 서울 열린데이터광장 SebcCollegeInfoKor — 서울시 대학교 기본정보(주소만 있고 좌표 없음, 자료 연도가 오래됨 → 좌표 대조·목록 확인용).
- mois_retail    : 행정안전부 생활 대규모점포 조회서비스(공공데이터포털 15154948, apis.data.go.kr/1741000/large_scale_retail_stores/info) — 전국 대규모점포·준대규모점포 인허가(대형마트·백화점·쇼핑센터 등),
                   TM(EPSG:5174) 좌표·영업상태 포함. 약 4천 건이라 전국 원본을 통째로 별도 보관한다(.env 의 DATA_GO_KR_KEY, 승인됨 — 2026-10-17 확인).
- kakao          : 카카오 로컬 API — 대형마트(MT1)·문화시설(CT1: 영화관 포함)·학교(SC4: 대학교만 변환에서 거름)·키워드(종합병원·백화점·복합쇼핑몰·아울렛). 파일럿 구역 + (BUFFER_M+여유) 안만.
  공식 공공데이터가 승인되지 않은 종류(백화점·쇼핑몰·대형마트·영화관·대학교)의 유일한 좌표 출처이며 공식 자료가 아니다(약관상 저장·재배포 조건 확인 필요 — 원본은 git 에 올리지 않는다).
기존 원천은 다시 받지 않고 변환이 읽는다: LOCALDATA 병원(010101, data/raw/seoul_localdata), 소상공인 상가업소(data/raw/sbiz).

출력은 data/raw/facilities/<이름>_<수집일>.json (기존 파일은 덮어쓰지 않음, --force 로 재수집). 카카오 검색은 결과가 45건을 넘는 구역을 4등분해 다시 받는다(깊이 제한 안에서; 한도에 닿은 구역은 meta 에 기록).
실행: .venv/bin/python -m pipelines.collect.collect_facilities [--datasets seoul_cultural seoul_college kakao] [--force]
"""
from __future__ import annotations

import argparse
import json
import time
from datetime import date, datetime, timezone

import httpx
import pyproj
from shapely.geometry import box
from shapely.ops import transform as shp_transform

from pipelines.collect.collect_bus_transit import ApiError, _pilot_union_5179, _rel
from pipelines.collect.collect_rail_transit import SEOUL, _json, _seoul_rows
from pipelines.common import config
from pipelines.common.env import require_env

OUT_DIR = config.RAW_DIR / "facilities"
KAKAO = "https://dapi.kakao.com/v2/local/search"
BUFFER_M = 1_100               # 파일럿 구역 밖으로 포함할 거리(버스·철도와 같은 수집 범위)
PAD_M = 300                    # 구역 경계 위 시설이 버퍼 끝에서 잘리지 않게 두는 여유
TILE_DEG = 0.02
MAX_DEPTH = 3                  # 45건 초과 구역을 4등분하는 최대 횟수
CAP = 45                       # 카카오 한 검색에서 가져올 수 있는 최대 건수(15건 × 3쪽)
DELAY_SEC = 0.15
RETAIL = "https://apis.data.go.kr/1741000/large_scale_retail_stores/info"
RETAIL_PAGE = 1000
MOVIE = "https://apis.data.go.kr/1741000/movie_theaters/info"
MOVIE_PAGE = 1000
HIRA = "https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList"
HIRA_PAGE = 100
HIRA_CLASSES = ("01", "11")                  # 상급종합·종합병원
DATASETS = ["seoul_cultural", "seoul_college", "mois_retail", "mois_movie", "hira", "kakao"]
# (종류, 엔드포인트, 파라미터) — 변환 단계가 category_name 으로 다시 거른다(키워드 검색은 주차장 같은 잡음이 섞인다)
KAKAO_QUERIES = [
    ("MT1", "category", {"category_group_code": "MT1"}),
    ("CT1", "category", {"category_group_code": "CT1"}),
    ("SC4", "category", {"category_group_code": "SC4"}),
    ("종합병원", "keyword", {"query": "종합병원"}),
    ("백화점", "keyword", {"query": "백화점"}),
    ("복합쇼핑몰", "keyword", {"query": "복합쇼핑몰"}),
    ("아울렛", "keyword", {"query": "아울렛"}),
]


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


def collect_seoul(client: httpx.Client, key: str, service: str, name: str, today: str, force: bool) -> None:
    if _exists(name, today, force):
        return
    rows, total = _seoul_rows(client, key, service)
    print(f"[{name}] 원천 {total:,}건 / 수집 {len(rows):,}건")
    _write(name, today, {"source": "seoul_openapi", "service": service, "source_total_count": total, "item_count": len(rows), "rows": rows})


def _collect_data_go(client: httpx.Client, key: str, today: str, force: bool, *, name: str, label: str, source: str, url: str, page_size: int, extra: dict) -> None:
    """data.go.kr 계열 목록 API 를 totalCount 까지 페이지 순회해 응답 그대로 저장한다(쿼리·오류 메시지의 키는 _json 이 가린다)."""
    if _exists(name, today, force):
        return
    rows: list[dict] = []
    page, total = 1, 0
    while True:
        body = _json(client, url, key, params={"serviceKey": key, "pageNo": page, "numOfRows": page_size, **extra})
        resp = body.get("response") or {}
        head = resp.get("header") or {}
        if head.get("resultCode") not in ("0", "00"):
            raise ApiError(f"{label} API 오류: {head.get('resultCode')} {head.get('resultMsg')}")
        b = resp.get("body") or {}
        total = int(b.get("totalCount") or 0)
        items = (b.get("items") or {}).get("item", []) if isinstance(b.get("items"), dict) else []
        items = [items] if isinstance(items, dict) else list(items)
        rows.extend(items)
        if not items or len(rows) >= total:
            break
        page += 1
        time.sleep(DELAY_SEC)
    print(f"[{name}] 원천 {total:,}건 / 수집 {len(rows):,}건")
    _write(name, today, {"source": source, "endpoint": url, "source_total_count": total, "item_count": len(rows), "rows": rows})


def collect_mois_retail(client: httpx.Client, key: str, today: str, force: bool) -> None:
    """행안부 대규모점포 전국 전량."""
    _collect_data_go(client, key, today, force, name="mois_retail", label="대규모점포", source="mois_large_scale_retail_stores", url=RETAIL, page_size=RETAIL_PAGE, extra={"returnType": "JSON"})


def collect_mois_movie(client: httpx.Client, key: str, today: str, force: bool) -> None:
    """행안부 영화상영관 전국 전량(상영관 단위 행 — 변환 단계가 같은 좌표의 상영관을 영화관 한 곳으로 묶는다)."""
    _collect_data_go(client, key, today, force, name="mois_movie", label="영화상영관", source="mois_movie_theaters", url=MOVIE, page_size=MOVIE_PAGE, extra={"returnType": "JSON"})


def collect_hira(client: httpx.Client, key: str, today: str, force: bool) -> None:
    """건강보험심사평가원 병원정보서비스 — 상급종합(01)·종합병원(11) 전국. 종별 코드로만 거르고 응답은 가공하지 않는다."""
    if _exists("hira_hospitals", today, force):
        return
    rows: list[dict] = []
    for cl in HIRA_CLASSES:
        sub = []
        page, total = 1, 0
        while True:
            body = _json(client, HIRA, key, params={"serviceKey": key, "pageNo": page, "numOfRows": HIRA_PAGE, "_type": "json", "clCd": cl})
            resp = body.get("response") or {}
            head = resp.get("header") or {}
            if head.get("resultCode") not in ("0", "00"):
                raise ApiError(f"병원정보 API 오류: {head.get('resultCode')} {head.get('resultMsg')}")
            b = resp.get("body") or {}
            total = int(b.get("totalCount") or 0)
            items = (b.get("items") or {}).get("item", []) if isinstance(b.get("items"), dict) else []
            items = [items] if isinstance(items, dict) else list(items)
            sub.extend(items)
            if not items or len(sub) >= total:
                break
            page += 1
            time.sleep(DELAY_SEC)
        print(f"[hira_hospitals] 종별 {cl}: 원천 {total:,}건 / 수집 {len(sub):,}건")
        rows.extend(sub)
    _write("hira_hospitals", today, {"source": "hira_hospital_info", "endpoint": HIRA, "classes": list(HIRA_CLASSES), "item_count": len(rows), "rows": rows})


def tiles(pad_m: float = BUFFER_M + PAD_M) -> list[tuple[float, float, float, float]]:
    """파일럿 구역 + pad_m 를 덮는 WGS84 사각형 (x1,y1,x2,y2). 결정적 순서."""
    union, _ = _pilot_union_5179()
    to_wgs = pyproj.Transformer.from_crs(config.CRS_METRIC, config.CRS_WGS84, always_xy=True).transform
    zone = shp_transform(to_wgs, union.buffer(pad_m))
    minx, miny, maxx, maxy = zone.bounds
    out, y = [], miny
    while y < maxy:
        x = minx
        while x < maxx:
            if box(x, y, x + TILE_DEG, y + TILE_DEG).intersects(zone):
                out.append((round(x, 5), round(y, 5), round(x + TILE_DEG, 5), round(y + TILE_DEG, 5)))
            x += TILE_DEG
        y += TILE_DEG
    return out


def _fetch_rect(client: httpx.Client, key: str, endpoint: str, params: dict, rect: tuple) -> tuple[list[dict], int]:
    """한 사각형의 검색 결과(최대 CAP건)와 원천 total_count."""
    docs: list[dict] = []
    total = 0
    for page in (1, 2, 3):
        body = _json(client, f"{KAKAO}/{endpoint}.json", key, headers={"Authorization": f"KakaoAK {key}"},
                     params={**params, "rect": ",".join(str(v) for v in rect), "size": 15, "page": page})
        meta = body.get("meta") or {}
        total = int(meta.get("total_count") or 0)
        docs.extend(body.get("documents") or [])
        if meta.get("is_end", True):
            break
        time.sleep(DELAY_SEC)
    return docs, total


def _search(client: httpx.Client, key: str, endpoint: str, params: dict, rect: tuple, depth: int, found: dict, capped: list, label: str = "") -> int:
    """사각형 검색 — total_count 가 CAP 을 넘으면 4등분해 다시(깊이 제한). 호출 수를 돌려준다."""
    docs, total = _fetch_rect(client, key, endpoint, params, rect)
    calls = 1
    if total > CAP and depth < MAX_DEPTH:
        x1, y1, x2, y2 = rect
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        for sub in ((x1, y1, mx, my), (mx, y1, x2, my), (x1, my, mx, y2), (mx, my, x2, y2)):
            calls += _search(client, key, endpoint, params, sub, depth + 1, found, capped, label)
        return calls
    if total > CAP:
        capped.append({"query": label, "rect": rect, "total_count": total, "received": len(docs)})        # 깊이 한도에도 45건을 넘는 구역 — 이 구역은 일부만 받음
    for d in docs:
        found[d["id"]] = d
    time.sleep(DELAY_SEC)
    return calls


def collect_kakao(client: httpx.Client, key: str, today: str, force: bool) -> None:
    if _exists("kakao_facilities", today, force):
        return
    found: dict[str, dict] = {}
    per_query: dict[str, dict] = {}
    capped: list = []
    area = tiles()
    for label, endpoint, params in KAKAO_QUERIES:
        before, calls = len(found), 0
        seen_q: dict[str, dict] = {}
        for rect in area:
            calls += _search(client, key, endpoint, params, rect, 0, seen_q, capped, label)
        for pid, d in seen_q.items():
            found.setdefault(pid, {**d, "_queries": []})["_queries"].append(label)
        per_query[label] = {"calls": calls, "places": len(seen_q), "new_places": len(found) - before}
        print(f"[kakao {label}] 호출 {calls} · 장소 {len(seen_q)} · 새 장소 {len(found) - before}")
    rows = [found[k] for k in sorted(found)]
    print(f"[kakao] 장소 {len(rows)}곳 (한도에 닿은 구역 {len(capped)}곳)")
    _write("kakao_facilities", today, {"source": "kakao_local", "tiles": len(area), "buffer_m": BUFFER_M, "pad_m": PAD_M, "max_depth": MAX_DEPTH, "per_query": per_query,
                                       "capped_rects": capped, "item_count": len(rows), "rows": rows})


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--datasets", nargs="+", default=DATASETS, choices=DATASETS)
    ap.add_argument("--force", action="store_true", help="오늘자 파일이 있어도 재수집")
    args = ap.parse_args()
    today = date.today().strftime("%Y%m%d")
    with httpx.Client() as client:
        if "seoul_cultural" in args.datasets or "seoul_college" in args.datasets:
            skey = require_env("SEOUL_OPENAPI_KEY")
            if "seoul_cultural" in args.datasets:
                collect_seoul(client, skey, "culturalSpaceInfo", "seoul_cultural", today, args.force)
            if "seoul_college" in args.datasets:
                collect_seoul(client, skey, "SebcCollegeInfoKor", "seoul_college", today, args.force)
        if "mois_retail" in args.datasets:
            collect_mois_retail(client, require_env("DATA_GO_KR_KEY"), today, args.force)
        if "mois_movie" in args.datasets:
            collect_mois_movie(client, require_env("DATA_GO_KR_KEY"), today, args.force)
        if "hira" in args.datasets:
            collect_hira(client, require_env("DATA_GO_KR_KEY"), today, args.force)
        if "kakao" in args.datasets:
            collect_kakao(client, require_env("KAKAO_REST_API_KEY"), today, args.force)


if __name__ == "__main__":
    main()
