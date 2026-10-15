"""버스 정류장 위치 + 정류장별 일일 평균 승하차(2025) 결합 — 파일럿(양천·영등포) 반경 250m·500m·1km 계산용 정규화 표.

실행: .venv/bin/python -m pipelines.transform.build_bus_stops
입력: data/raw/bus/{loc,usage,tago_grid}_<수집일>.json (각각 가장 최근 수집분 — collect_bus_transit 산출물)
      data/processed/regions.geojson (파일럿 구역), data/external/seoul_admin_dong.geojson (서울 경계, 읽기 전용)
출력: data/processed/bus_stops.parquet        정규화 정류장 1행 — 파일럿 구역 + 1.1km 안(반경 1km 계산이 구 경계에서 끊기지 않게)
      data/processed/bus_usage_match.parquet  파일럿 두 구의 이용량 행 1행 — 위치정보와의 연결 결과(연결 안 된 행도 사유와 함께 유지)
      data/processed/bus_meta.json            수집 범위(buffer_m)·기준일·이용량 연도·중복 규칙 — backend 가 읽어 반경 분석의 범위 완전성을 판단
      outputs/tables/bus_transit_report.csv    연결·중복·누락 건수와 비율, 이용량 값 관계, TAGO 대조 결과

반경 계산: bus_stops 의 x_5179·y_5179(미터, EPSG:5179)에 BallTree 를 쓰거나 anchor_metrics.compute_anchor_metrics 를 그대로 쓸 수 있다
(pipelines/tests/test_build_bus_stops.py 가 is_primary 행으로 250m·500m·1km 개수가 무차별 대입과 같음을 확인한다).

정류장 중복 — 같은 물리 정류장이 BIS 별로 따로 실려 있다(예: 서울BIS 'SEB114000007' 과 경기BIS 'GGB114000007' 은 같은 '목동3단지', 같은 번호,
  몇 m 차이). 반경 계산에서 두 번 세지 않도록 같은 모바일 번호를 가진 정류장 중 아래 둘 중 하나를 만족하면 한 묶음으로 보고
  서울BIS > 경기BIS > 인천BIS > TAGO 순으로 대표(is_primary=True) 하나만 남긴다. 나머지는 duplicate_of 에 대표의 정류장번호를 적는다.
    ① 정류장명이 맞고(정규화 후 같거나 한쪽이 다른 쪽을 포함) 50m 이내
    ② 정류장번호 끝 6자리가 같고(BIS 별 미러 기록: SEB114000156 ↔ GGB114000156) 250m 이내 — 미러 기록은 이름 표기가 다르거나 좌표가 최대 200m 어긋나기도 함
  번호가 같아야 한다는 조건은 공통이다. 반대 방향(맞은편) 정류장은 번호가 서로 달라(예: 3340·3341) 합쳐지지 않는다. 번호 없는 정류장은 묶지 않는다.
  (반경 개수를 셀 때는 is_primary 인 행만 쓴다.)
연결 규칙 — 코드와 이름으로만 연결하고, 좌표가 가깝다는 이유만으로는 연결하지 않는다
  위치정보(정류장번호·모바일단축번호·좌표)와 이용량(정류장ID·모바일ID, 좌표 없음)이 공유하는 키는 '모바일 번호(ARS)'뿐이다.
  (정류장번호는 'SEB…'·'GGB…' 형식, 이용량의 정류장ID 는 숫자라 서로 다른 체계다.) 그런데 번호는 BIS(서울·경기·인천)마다 따로 매겨져
  서울 안에서도 다른 정류장이 같은 번호를 가질 수 있고, 이용량에서는 한 정류장이 별칭 행 여러 개로 나오기도 한다.
  그래서 번호가 같은 (정류장, 이용량 행) 후보 쌍 중 '정류장명이 정규화 후 같거나 한쪽이 다른 쪽을 포함'하는 쌍만 인정하고,
  그 쌍이 서로에게 유일할 때(정류장 하나에 일치 행 하나, 행 하나에 일치 정류장 하나)만 linked 로 둔다.
    multi_usage_rows    한 정류장에 이름이 맞는 이용량 행이 여럿(같은 정류장의 별칭 행이 흔해 합산하면 중복이 됨)
    ambiguous_stop_key  한 이용량 행에 이름이 맞는 정류장이 여럿(같은 번호·비슷한 이름의 정류장이 둘 이상)
    name_conflict       번호는 같은데 이름이 맞는 쌍이 없음
  linked 인 정류장에만 이용량을 붙이고 나머지는 비워 둔다(임의로 채우지 않음).
이용량 해석: '정류장별 일일 평균 승차·하차·환승 인원'(2025년, 원천 설명 기준)이며 실시간 유동인구·매장 방문객 수가 아니다.
  환승이 승차에 포함될 가능성이 있어(아래 리포트의 값 관계 참고) 승차+하차+환승을 하나의 '이용자 수'로 더하지 않고 세 칸을 따로 둔다.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import numpy as np
import pandas as pd
import pyproj
import shapely
from sklearn.neighbors import BallTree
from shapely.geometry import shape
from shapely.ops import transform as shp_transform
from shapely.ops import unary_union

from pipelines.common import config

RAW = config.RAW_DIR / "bus"
BUFFER_M = 1_100          # 파일럿 구역 밖으로 포함할 거리 — 반경 1km 계산이 구 경계에서 끊기지 않도록 여유 100m
KOREA_LAT, KOREA_LON = (33.0, 39.5), (124.0, 132.0)
USAGE_GU = {11470: "양천구", 11560: "영등포구"}
ADMIN_PRIORITY = {"서울BIS": 0, "경기BIS": 1, "인천BIS": 2, "TAGO": 3}   # 같은 정류장이 여러 BIS 에 있을 때 대표로 남기는 순서
DUP_MAX_M = 50                                                             # 같은 번호·같은 이름의 정류장이 이 거리 안이면 같은 정류장
MIRROR_MAX_M = 250                                                         # 같은 번호·같은 코드 끝 6자리(BIS 미러 기록)면 좌표·이름이 달라도 이 거리 안이면 같은 정류장
MIRROR_TAIL = 6                                                            # 'SEB114000156' ↔ 'GGB114000156' ↔ 'ICB314000156' — 접두·앞자리만 다른 같은 기록
_NOISE = re.compile(r"[\s\.\(\)·,\-_/]+")


def _latest(prefix: str) -> Path:
    files = sorted(RAW.glob(f"{prefix}_*.json"), key=lambda p: p.stem.rsplit("_", 1)[-1])
    if not files:
        raise SystemExit(f"data/raw/bus/{prefix}_*.json 가 없습니다 — collect_bus_transit 을 먼저 실행하세요")
    return files[-1]


def _load(prefix: str) -> tuple[pd.DataFrame, dict]:
    env = json.loads(_latest(prefix).read_text(encoding="utf-8"))
    meta = {k: v for k, v in env.items() if k != "rows"}
    meta["file"] = _latest(prefix).name
    return pd.DataFrame(env["rows"]), meta


def norm_name(s) -> str:
    return _NOISE.sub("", str(s)).lower()


def names_agree(a, b) -> bool:
    """정규화한 정류장명이 같거나, 한쪽(2자 이상)이 다른 쪽에 포함되면 같은 정류장으로 본다."""
    x, y = norm_name(a), norm_name(b)
    if not x or not y:
        return False
    short, long_ = (x, y) if len(x) <= len(y) else (y, x)
    return x == y or (len(short) >= 2 and short in long_)


def _geoms():
    """(파일럿 폴리곤 5179, 구별 폴리곤 5179, 서울 폴리곤 WGS84, 좌표 변환 함수들)."""
    to_m = pyproj.Transformer.from_crs(config.CRS_WGS84, config.CRS_METRIC, always_xy=True).transform
    gj = json.loads((config.PROCESSED_DIR / "regions.geojson").read_text(encoding="utf-8"))
    by_gu: dict[int, list] = {}
    for f in gj["features"]:
        by_gu.setdefault(int(f["properties"]["sgg"]), []).append(shp_transform(to_m, shape(f["geometry"])))
    gu = {code: unary_union(g) for code, g in by_gu.items()}
    seoul = unary_union([shape(f["geometry"]) for f in json.loads((config.EXTERNAL_DIR / "seoul_admin_dong.geojson").read_text(encoding="utf-8"))["features"]])
    return unary_union(list(gu.values())), gu, seoul, to_m


def normalize_stops(loc: pd.DataFrame) -> pd.DataFrame:
    """위치정보 원본 → 정규화 정류장(좌표 숫자화·품질 표시·정류장 단위 중복 표시). 행은 버리지 않는다."""
    s = pd.DataFrame({
        "stop_uid": loc["정류장번호"].astype("string").str.strip(),
        "mobile_no": pd.to_numeric(loc["모바일단축번호"], errors="coerce").astype("Int64"),
        "name": loc["정류장명"].astype("string").str.strip(),
        "lat": pd.to_numeric(loc["위도"], errors="coerce").astype(float),
        "lon": pd.to_numeric(loc["경도"], errors="coerce").astype(float),
        "city_code": pd.to_numeric(loc["도시코드"], errors="coerce").astype("Int64"),
        "city_name": loc["도시명"].astype("string"),
        "admin_system": loc["관리도시명"].astype("string"),
        "collected_at": loc["정보수집일"].astype("string"),
    })
    s.loc[s["mobile_no"] == 0, "mobile_no"] = pd.NA          # 0 은 번호 없음(원천의 빈 값 표기)
    s["coord_ok"] = (s["lat"].between(*KOREA_LAT) & s["lon"].between(*KOREA_LON)) & (s["lat"] != 0) & (s["lon"] != 0)
    s["dup_stop_uid"] = s["stop_uid"].duplicated(keep=False)
    xy = pd.Series(list(zip(s["lat"].round(5), s["lon"].round(5))), index=s.index)
    s["dup_name_xy"] = pd.DataFrame({"n": s["name"].map(norm_name), "xy": xy}).duplicated(keep="first") & s["coord_ok"]  # 같은 이름·같은 위치(≈1m)의 두 번째 이후 행
    return s.sort_values(["stop_uid"], kind="stable").reset_index(drop=True)


def add_geography(s: pd.DataFrame) -> pd.DataFrame:
    """서울 안 여부·소속 파일럿 구·파일럿 구역까지의 거리(m)와 투영 좌표."""
    pilot, gu, seoul, to_m = _geoms()
    ok = s["coord_ok"].to_numpy()
    lon, lat = s["lon"].to_numpy(), s["lat"].to_numpy()
    x = np.full(len(s), np.nan)
    y = np.full(len(s), np.nan)
    x[ok], y[ok] = to_m(lon[ok], lat[ok])
    s = s.assign(x_5179=x.round(2), y_5179=y.round(2))
    s["in_seoul"] = ok & shapely.contains_xy(seoul, np.where(ok, lon, 0.0), np.where(ok, lat, 0.0))
    s["gu_code"] = pd.array([pd.NA] * len(s), dtype="Int64")
    for code, poly in gu.items():
        inside = ok & shapely.contains_xy(poly, np.where(ok, x, 0.0), np.where(ok, y, 0.0))
        s.loc[inside, "gu_code"] = code
    dist = np.full(len(s), np.nan)
    dist[ok] = shapely.distance(pilot, shapely.points(x[ok], y[ok]))
    s["dist_to_pilot_m"] = np.round(dist, 1)
    s["in_pilot"] = s["gu_code"].notna()
    return s


def _same_tail(a, b) -> bool:
    """정류장번호 끝 MIRROR_TAIL 자리가 숫자이고 서로 같다(같은 정류장의 BIS 별 미러 기록)."""
    x, y = str(a)[-MIRROR_TAIL:], str(b)[-MIRROR_TAIL:]
    return len(x) == MIRROR_TAIL and x.isdigit() and x == y


def mark_duplicates(s: pd.DataFrame) -> pd.DataFrame:
    """같은 모바일 번호의 정류장 중 ①이름 일치·DUP_MAX_M 이내 또는 ②코드 끝자리 일치·MIRROR_MAX_M 이내이면 같은 정류장으로 묶어 대표 하나만 is_primary 로 둔다."""
    s = s.copy()
    s["is_primary"] = True
    s["duplicate_of"] = pd.Series([pd.NA] * len(s), dtype="string", index=s.index)
    rank = s["admin_system"].map(ADMIN_PRIORITY).fillna(9)
    cand = s.loc[s["coord_ok"] & s["mobile_no"].notna()].assign(_rank=rank)
    for _, g in cand.groupby("mobile_no"):
        if len(g) < 2:
            continue
        g = g.sort_values(["_rank", "stop_uid"], kind="stable")
        primaries: list[int] = []
        for idx, row in g.iterrows():
            for pidx in primaries:
                prim = g.loc[pidx]
                dist = np.hypot(row["x_5179"] - prim["x_5179"], row["y_5179"] - prim["y_5179"])
                if (names_agree(row["name"], prim["name"]) and dist <= DUP_MAX_M) or (_same_tail(row["stop_uid"], prim["stop_uid"]) and dist <= MIRROR_MAX_M):
                    s.loc[idx, "is_primary"] = False
                    s.loc[idx, "duplicate_of"] = prim["stop_uid"]
                    break
            else:
                primaries.append(idx)
    return s


def normalize_usage(usage: pd.DataFrame) -> pd.DataFrame:
    u = pd.DataFrame({
        "year": pd.to_numeric(usage["년도"], errors="coerce").astype("Int64"),
        "gu_code": pd.to_numeric(usage["시군구코드(법정동)"], errors="coerce").astype("Int64"),
        "gu_name": usage["시군구명"].astype("string"),
        "usage_stop_id": usage["정류장ID"].astype("string"),
        "usage_mobile_id": pd.to_numeric(usage["모바일ID"], errors="coerce").astype("Int64"),
        "name": usage["정류장명"].astype("string").str.strip(),
        "avg_daily_boardings": pd.to_numeric(usage["평균승차이용량"], errors="coerce"),
        "avg_daily_alightings": pd.to_numeric(usage["평균하차이용량"], errors="coerce"),
        "avg_daily_transfers": pd.to_numeric(usage["평균환승이용량"], errors="coerce"),
    })
    u = u.sort_values(["gu_code", "usage_stop_id", "name", "usage_mobile_id"], kind="stable").reset_index(drop=True)
    u.insert(0, "usage_row_id", np.arange(len(u)))
    return u


def link(stops: pd.DataFrame, usage: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """모바일 번호가 같고 정류장명이 맞는 쌍으로 위치정보와 이용량을 연결한다(규칙은 모듈 설명).

    반환: (stops 에 usage_status·이용량 칸 추가, usage 에 link_status·연결 정류장 추가). 어느 쪽도 행을 버리지 않는다.
    """
    seoul = stops.loc[stops["is_primary"] & stops["in_seoul"] & stops["mobile_no"].notna(), ["stop_uid", "mobile_no", "name"]]
    use = usage.loc[usage["usage_mobile_id"].notna(), ["usage_row_id", "usage_mobile_id", "name"]]
    pairs = seoul.merge(use, left_on="mobile_no", right_on="usage_mobile_id", suffixes=("_stop", "_use"))
    pairs["agree"] = [names_agree(a, b) for a, b in zip(pairs["name_stop"], pairs["name_use"])]
    agree = pairs.loc[pairs["agree"]]
    rows_per_stop = agree.groupby("stop_uid").size()          # 정류장 하나에 이름이 맞는 이용량 행 수
    stops_per_row = agree.groupby("usage_row_id").size()      # 이용량 행 하나에 이름이 맞는 정류장 수
    good = agree[agree["stop_uid"].map(rows_per_stop).eq(1) & agree["usage_row_id"].map(stops_per_row).eq(1)]
    stop_to_row = dict(zip(good["stop_uid"], good["usage_row_id"]))
    row_to_stop = dict(zip(good["usage_row_id"], good["stop_uid"]))
    use_ids = set(use["usage_mobile_id"])
    loc_ids = set(seoul["mobile_no"])

    s = stops.copy()
    st = pd.Series("no_mobile_no", index=s.index, dtype=object)
    has_no = s["mobile_no"].notna()
    st[has_no & ~s["in_seoul"]] = "outside_seoul"
    seoul_no = has_no & s["in_seoul"] & s["is_primary"]
    st[seoul_no] = "no_usage_candidate"
    st[seoul_no & s["mobile_no"].isin(use_ids)] = "name_conflict"                       # 번호는 같은 이용량 행이 있는데 이름이 맞는 쌍이 없음
    ambiguous_rows = agree[agree["usage_row_id"].map(stops_per_row).gt(1) & agree["stop_uid"].map(rows_per_stop).eq(1)]["stop_uid"]
    st[s["stop_uid"].isin(ambiguous_rows)] = "ambiguous_stop_key"
    st[s["stop_uid"].map(rows_per_stop).gt(1).fillna(False)] = "multi_usage_rows"
    st[s["stop_uid"].isin(stop_to_row)] = "linked"
    st[~s["is_primary"]] = "duplicate_of_primary"                                        # 같은 정류장의 다른 BIS 기록 — 대표에만 이용량을 붙인다
    s["usage_status"] = st
    s["usage_row_count"] = s["mobile_no"].map(use.groupby("usage_mobile_id").size()).fillna(0).astype(int)
    rows = usage.set_index("usage_row_id")
    linked = s["usage_status"] == "linked"
    row_id = s.loc[linked, "stop_uid"].map(stop_to_row).astype(int).to_numpy()
    for c in ("avg_daily_boardings", "avg_daily_alightings", "avg_daily_transfers"):
        s[c] = np.nan
        s.loc[linked, c] = rows.loc[row_id, c].to_numpy()
    s["usage_year"] = pd.array([pd.NA] * len(s), dtype="Int64")
    s.loc[linked, "usage_year"] = rows.loc[row_id, "year"].to_numpy()

    u = usage.copy()
    ls = pd.Series("no_mobile_id", index=u.index, dtype=object)
    has = u["usage_mobile_id"].notna()
    ls[has] = "no_loc_candidate"
    ls[has & u["usage_mobile_id"].isin(loc_ids)] = "name_conflict"
    ls[u["usage_row_id"].map(stops_per_row).gt(1).fillna(False)] = "ambiguous_stop_key"
    multi_rows = agree[agree["stop_uid"].map(rows_per_stop).gt(1)]["usage_row_id"]
    ls[u["usage_row_id"].isin(multi_rows)] = "multi_usage_rows"
    ls[u["usage_row_id"].isin(row_to_stop)] = "linked"
    u["link_status"] = ls
    u["loc_candidate_count"] = u["usage_mobile_id"].map(seoul.groupby("mobile_no").size()).fillna(0).astype(int)
    u["usage_rows_same_id"] = u["usage_mobile_id"].map(use.groupby("usage_mobile_id").size()).fillna(0).astype(int)
    u["linked_stop_uid"] = u["usage_row_id"].map(row_to_stop)
    return s, u


def tago_checks(stops_all: pd.DataFrame, tago: pd.DataFrame) -> tuple[list[dict], pd.DataFrame]:
    """TAGO 정류소(nodeid·nodeno·좌표)를 위치정보와 코드로 대조한다. 대조 결과와 위치정보에 없는 TAGO 정류소(좌표 포함)를 돌려준다."""
    t = pd.DataFrame({"stop_uid": tago["nodeid"].astype(str), "mobile_no": pd.to_numeric(tago["nodeno"], errors="coerce").astype("Int64"),
                      "name": tago["nodenm"].astype(str), "lat": tago["gpslati"].astype(float), "lon": tago["gpslong"].astype(float),
                      "tago_citycode": pd.to_numeric(tago["citycode"], errors="coerce").astype("Int64")})
    m = t.merge(stops_all[["stop_uid", "mobile_no", "name", "lat", "lon"]], on="stop_uid", how="left", suffixes=("", "_loc"), indicator=True)
    both = m[m["_merge"] == "both"]
    dist = _haversine(both["lat"].to_numpy(), both["lon"].to_numpy(), both["lat_loc"].to_numpy(), both["lon_loc"].to_numpy())
    rows = [
        {"metric": "TAGO 정류소(격자 조회, 중복 제거)", "value": len(t), "note": "서울은 TAGO 도시 목록에 없어 좌표 근접 조회로만 받는다"},
        {"metric": "TAGO nodeid 가 위치정보 정류장번호와 일치", "value": len(both), "note": f"{len(both) / max(len(t), 1):.1%}"},
        {"metric": "일치 쌍의 좌표 차이 최대(m)", "value": round(float(dist.max()), 2) if len(dist) else None, "note": "코드가 같은 쌍의 좌표 일관성 검증(좌표만으로 연결하지 않음)"},
        {"metric": "일치 쌍의 nodeno == 모바일단축번호", "value": int((both["mobile_no"] == both["mobile_no_loc"]).sum()),
         "note": f"번호가 양쪽 모두 있는 {int((both['mobile_no'].notna() & both['mobile_no_loc'].notna()).sum())}쌍 중(나머지는 한쪽 번호 없음)"},
        {"metric": "일치 쌍의 이름(정규화) 일치", "value": int(sum(names_agree(a, b) for a, b in zip(both["name"], both["name_loc"]))), "note": "이름 표기 차이는 정규화·포함 관계로 허용"},
    ]
    only = m[m["_merge"] == "left_only"].drop(columns=["stop_uid_loc", "mobile_no_loc", "name_loc", "lat_loc", "lon_loc", "_merge"], errors="ignore")
    rows.append({"metric": "TAGO 에만 있는 정류소(위치정보에 같은 코드 없음)", "value": len(only),
                 "note": "접두 " + str(only["stop_uid"].str[:3].value_counts().to_dict())})
    return rows, only


def _haversine(lat1, lon1, lat2, lon2) -> np.ndarray:
    la1, la2, dl = np.radians(lat1), np.radians(lat2), np.radians(lon2 - lon1)
    a = np.sin((la2 - la1) / 2) ** 2 + np.cos(la1) * np.cos(la2) * np.sin(dl / 2) ** 2
    return 2 * 6_371_008.8 * np.arcsin(np.sqrt(a))


def build() -> dict:
    loc, loc_meta = _load("loc")
    usage_raw, use_meta = _load("usage")
    tago, tago_meta = _load("tago_grid")
    rep: list[dict] = []

    def add(section: str, metric: str, value, note: str = "") -> None:
        rep.append({"section": section, "metric": metric, "value": value, "note": note})

    loc_norm = normalize_stops(loc)
    usage = normalize_usage(usage_raw)

    # TAGO 에만 있는 정류소(위치정보에 같은 코드 없음)는 위치정보와 같은 형식으로 맞춰 함께 다룬다 — 반경 계산에서 빠지지 않게(출처 표시)
    tago_rows, tago_only = tago_checks(loc_norm, tago)
    extra = normalize_stops(pd.DataFrame({
        "정류장번호": tago_only["stop_uid"], "모바일단축번호": tago_only["mobile_no"], "정류장명": tago_only["name"], "위도": tago_only["lat"],
        "경도": tago_only["lon"], "도시코드": tago_only["tago_citycode"], "도시명": "(TAGO)", "관리도시명": "TAGO", "정보수집일": pd.NA}))
    stops_all = pd.concat([loc_norm.assign(source="loc"), extra.assign(source="tago_only")], ignore_index=True)
    stops_all = mark_duplicates(add_geography(stops_all))

    # ── 원천 확인 ────────────────────────────────────────────────────────────────────────────────
    add("원천", "위치정보 파일·버전(정보수집일)", loc_meta["file"], f"버전 {loc_meta.get('version')} / 전체 버전 {loc_meta.get('all_versions')}")
    add("원천", "이용량 파일·기준연도", use_meta["file"], f"년도 {sorted(set(usage['year'].dropna().astype(int)))}, 버전 {use_meta.get('version')}, 정류장별 일일 평균(원천 설명)")
    add("원천", "위치정보 수집 행(도시별)", len(loc), "; ".join(f"{f['filter']} {f['item_count']:,}/{f['match_count']:,}" for f in loc_meta["filters"]))
    add("원천", "이용량 수집 행(서울)", len(usage), "; ".join(f"{f['filter']} {f['item_count']:,}/{f['match_count']:,}" for f in use_meta["filters"]))

    # ── 위치정보 품질(파일럿 구역 + 1.1km) ──────────────────────────────────────────────────────
    from_loc = stops_all["source"] == "loc"
    seoul_all = stops_all.loc[from_loc & (stops_all["city_name"] == "서울특별시")]
    in_buf = stops_all["coord_ok"] & (stops_all["dist_to_pilot_m"] <= BUFFER_M)
    near = stops_all.loc[in_buf]
    pilot_stops = near.loc[near["in_pilot"]]
    add("위치 품질", "서울특별시 행(원천 도시명)", len(seoul_all), f"관리도시명 {seoul_all['admin_system'].value_counts().to_dict()}")
    add("위치 품질", "그중 좌표 누락·무효", int((~seoul_all["coord_ok"]).sum()), f"{(~seoul_all['coord_ok']).mean():.2%}")
    out_of_seoul = seoul_all["coord_ok"] & ~seoul_all["in_seoul"]
    add("위치 품질", "그중 좌표가 서울 경계 밖", int(out_of_seoul.sum()), f"{out_of_seoul.mean():.2%} — 도시명은 서울인데 위치는 경기 등(예: 성남 판교)")
    add("위치 품질", "표 범위 행(파일럿 + 1.1km, 중복 포함)", len(near), f"관리도시명 {near['admin_system'].value_counts().to_dict()}")
    dup = near.loc[~near["is_primary"]]
    add("위치 품질", "같은 정류장이 BIS 별로 중복 실린 행(is_primary=False)", len(dup),
        f"{len(dup) / len(near):.1%} — 같은 번호이고 (이름 일치·50m 이내 또는 코드 끝 6자리 일치·250m 이내)인 쌍. 관리도시명 {dup['admin_system'].value_counts().to_dict()}")
    prim = near.loc[near["is_primary"]]
    prim_pilot = prim.loc[prim["in_pilot"]]
    add("위치 품질", "중복 제거 후 정류장(표 범위)", len(prim), f"파일럿 구역 안 {len(prim_pilot):,}곳 {prim_pilot['gu_code'].map(USAGE_GU).value_counts().to_dict()}")
    add("위치 품질", "정류장번호 중복 행(표 범위)", int(near["dup_stop_uid"].sum()), f"{near['dup_stop_uid'].mean():.2%}")
    add("위치 품질", "같은 이름·같은 위치(≈1m) 중복 행(표 범위)", int(near["dup_name_xy"].sum()), f"{near['dup_name_xy'].mean():.2%}")
    add("위치 품질", "모바일번호 없음(0·결측, 대표 정류장)", int(prim["mobile_no"].isna().sum()), f"{prim['mobile_no'].isna().mean():.2%} — 번호로 이용량과 연결할 수 없음")

    # ── 이용량 원천 품질·값 관계 ────────────────────────────────────────────────────────────────
    pu = usage.loc[usage["gu_code"].isin(USAGE_GU)]
    add("이용량 품질", "파일럿 이용량 행", len(pu), str(pu["gu_name"].value_counts().to_dict()))
    add("이용량 품질", "이용량 값(승차·하차·환승) 결측 행", int(pu[["avg_daily_boardings", "avg_daily_alightings", "avg_daily_transfers"]].isna().any(axis=1).sum()), "0 은 결측이 아니라 값 0 으로 둔다")
    add("이용량 품질", "모바일ID 없음(파일럿)", int(pu["usage_mobile_id"].isna().sum()), f"{pu['usage_mobile_id'].isna().mean():.1%} — 원천 설명: 공란은 모바일ID 미확인 정류장")
    add("이용량 품질", "정류장ID 중복 행(서울 전체)", int(usage["usage_stop_id"].duplicated(keep=False).sum()), "같은 정류장ID 에 이름이 다른 행이 흔함(별칭 행)")
    add("이용량 품질", "시군구 코드가 구가 아닌 행(서울 11000)", int((usage["gu_code"] == 11000).sum()), "구를 알 수 없어 파일럿 집계에서 제외")
    b, a, tr = pu["avg_daily_boardings"], pu["avg_daily_alightings"], pu["avg_daily_transfers"]
    add("이용량 값 관계", "환승 > 승차인 행", int((tr > b).sum()), f"{(tr > b).mean():.1%} — 0건이면 환승이 승차에 포함된 값일 가능성(원천 정의 미기재)")
    add("이용량 값 관계", "환승 > 하차인 행", int((tr > a).sum()), f"{(tr > a).mean():.1%} — 하차에 포함된 값은 아님")
    add("이용량 값 관계", "환승 > 승차+하차인 행", int((tr > b + a).sum()), "")
    add("이용량 값 관계", "승차-환승 상관계수", round(float(np.corrcoef(b, tr)[0, 1]), 3), "승차·하차·환승을 더해 단일 '이용자 수'로 쓰지 않는다(중복 가능)")

    # ── 위치정보 ↔ 이용량 연결 ──────────────────────────────────────────────────────────────────
    stops, usage_linked = link(stops_all, usage)
    near = stops.loc[stops["coord_ok"] & (stops["dist_to_pilot_m"] <= BUFFER_M)].copy()
    prim = near.loc[near["is_primary"]]
    prim_pilot = prim.loc[prim["in_pilot"]]
    pu = usage_linked.loc[usage_linked["gu_code"].isin(USAGE_GU)]
    n_pu, n_ps = len(pu), len(prim_pilot)
    for status, cnt in pu["link_status"].value_counts().items():
        add("연결(이용량→위치)", f"파일럿 이용량 행 · {status}", int(cnt), f"{cnt / n_pu:.1%}")
    add("연결(이용량→위치)", "연결 성공(linked) 이용량 행 / 파일럿 이용량 행", int((pu["link_status"] == "linked").sum()), f"매칭률 {(pu['link_status'] == 'linked').mean():.1%}")
    has_id = pu["usage_mobile_id"].notna()
    add("연결(이용량→위치)", "모바일ID 가 있는 행 중 연결 성공", int((pu.loc[has_id, "link_status"] == "linked").sum()), f"{(pu.loc[has_id, 'link_status'] == 'linked').mean():.1%} (모바일ID 있는 {int(has_id.sum()):,}행 기준)")
    for status, cnt in prim_pilot["usage_status"].value_counts().items():
        add("연결(위치→이용량)", f"파일럿 구역 대표 정류장 · {status}", int(cnt), f"{cnt / n_ps:.1%}")
    lk = int((prim_pilot["usage_status"] == "linked").sum())
    add("연결(위치→이용량)", "이용량이 붙은 정류장 / 파일럿 구역 대표 정류장", lk, f"이용량 누락률 {1 - lk / n_ps:.1%} (연결 성공률 {lk / n_ps:.1%})")
    add("연결(위치→이용량)", "표 범위 전체 대표 정류장 중 이용량이 붙은 정류장", int((prim["usage_status"] == "linked").sum()), f"표 범위 대표 {len(prim):,}곳 중 {(prim['usage_status'] == 'linked').mean():.1%} (서울 외 번호·이용량 없는 TAGO 정류소 포함)")
    add("연결 품질", "이름이 맞지 않아 연결하지 않은 이용량 행(name_conflict)", int((pu["link_status"] == "name_conflict").sum()), "번호는 같은데 정류장명이 다른 쌍은 연결하지 않음")
    add("연결 품질", "이용량 값이 붙은 정류장 중 이용량 합계가 0 인 정류장", int(((prim_pilot["usage_status"] == "linked") & (prim_pilot[["avg_daily_boardings", "avg_daily_alightings"]].sum(axis=1) == 0)).sum()), "")

    # ── TAGO 대조 ──────────────────────────────────────────────────────────────────────────────
    for r in tago_rows:
        add("TAGO 대조", r["metric"], r["value"], r["note"])
    add("TAGO 대조", "서울이 TAGO 도시 목록에 있는가", bool(tago_meta.get("seoul_in_city_list")), "False 면 서울시 BIS 정류소는 TAGO 에서 받을 수 없음")
    extra_kept = near.loc[near["source"] == "tago_only"]
    add("TAGO 대조", "코드가 위치정보와 달라 TAGO 에만 있는 정류소(표 범위, source=tago_only)", len(extra_kept),
        f"그중 같은 번호의 위치정보 정류장과 이름·코드 끝자리·거리가 맞아 중복으로 처리된 것 {int((~extra_kept['is_primary']).sum())}곳(대표로 남은 것 {int(extra_kept['is_primary'].sum())}곳) — "
        "BIS 별 접두(SEB·GGB·ICB)만 다르고 같은 정류장을 가리킴. 이용량은 붙이지 않음")
    pair = near.loc[~near["is_primary"] & near["duplicate_of"].notna(), ["stop_uid", "duplicate_of", "admin_system"]]
    gg = pair.loc[(pair["admin_system"] == "경기BIS") & pair["duplicate_of"].str.startswith("SEB")]
    add("중복 검증", "서울BIS-경기BIS 중복쌍 중 정류장번호 숫자부가 같은 쌍", int((gg["stop_uid"].str[3:] == gg["duplicate_of"].str[3:]).sum()),
        f"전체 {len(gg):,}쌍 — 묶은 중복이 정류장번호 숫자부로도 일치하는지 독립 확인")
    p2 = near.loc[near["is_primary"] & near["mobile_no"].notna() & near["coord_ok"]]
    same_no = p2.groupby("mobile_no").filter(lambda g: len(g) > 1)
    add("중복 검증", "대표 정류장끼리 같은 모바일 번호를 쓰는 쌍(미병합)", int(same_no["mobile_no"].nunique()),
        "0 이어야 미러 중복이 남아 있지 않음. 남았다면 서로 다른 BIS 의 다른 정류장이 번호만 겹친 경우(이름·코드·거리가 모두 다름)")
    xy = p2[["x_5179", "y_5179", "name", "mobile_no"]].reset_index(drop=True)
    tree = BallTree(xy[["x_5179", "y_5179"]].to_numpy())
    opp = 0
    for i, js in enumerate(tree.query_radius(xy[["x_5179", "y_5179"]].to_numpy(), 60)):
        opp += sum(1 for j in js if j > i and xy.at[i, "mobile_no"] != xy.at[j, "mobile_no"] and norm_name(xy.at[i, "name"]) == norm_name(xy.at[j, "name"]))
    add("중복 검증", "이름이 같고 번호가 다른 60m 이내 대표 정류장 쌍(맞은편·반대 방향 후보)", opp, "번호가 다르면 합치지 않는다 — 방향이 다른 정류장을 한 곳으로 줄이지 않았음")

    # ── 출력 ───────────────────────────────────────────────────────────────────────────────────
    keep = ["stop_uid", "source", "mobile_no", "name", "lon", "lat", "x_5179", "y_5179", "gu_code", "in_pilot", "dist_to_pilot_m", "in_seoul",
            "is_primary", "duplicate_of", "city_code", "city_name", "admin_system", "collected_at", "dup_stop_uid", "dup_name_xy",
            "usage_status", "usage_row_count", "usage_year", "avg_daily_boardings", "avg_daily_alightings", "avg_daily_transfers"]
    out_stops = near[keep].sort_values(["stop_uid"], kind="stable").reset_index(drop=True)
    out_stops["gu_name"] = out_stops["gu_code"].map(USAGE_GU)
    out_stops.to_parquet(config.PROCESSED_DIR / "bus_stops.parquet", index=False)

    cols = ["usage_row_id", "gu_code", "gu_name", "usage_stop_id", "usage_mobile_id", "name", "year", "avg_daily_boardings", "avg_daily_alightings",
            "avg_daily_transfers", "link_status", "loc_candidate_count", "usage_rows_same_id", "linked_stop_uid"]
    pu[cols].reset_index(drop=True).to_parquet(config.PROCESSED_DIR / "bus_usage_match.parquet", index=False)
    pd.DataFrame(rep).to_csv(config.TABLES_DIR / "bus_transit_report.csv", index=False)
    prim_out = out_stops.loc[out_stops["is_primary"]]
    meta = {
        "buffer_m": BUFFER_M,                                  # 파일럿 구역 밖 이 거리까지의 정류장을 담았다(이 안의 반경은 완전, 넘으면 불완전)
        "extent": "파일럿 두 구(양천·영등포) 경계 밖 1.1km 이내의 서울·부천 정류장",
        "loc_version": loc_meta.get("version"), "loc_collected_at": (sorted(set(near["collected_at"].dropna())) or [None])[-1],
        "usage_year": int(usage["year"].dropna().iloc[0]) if usage["year"].notna().any() else None, "usage_version": use_meta.get("version"),
        "cities_collected": [f["filter"] for f in loc_meta["filters"]],
        "stops_primary": int(len(prim_out)), "stops_duplicate_rows": int((~out_stops["is_primary"]).sum()),
        "stops_by_city": {str(k): int(v) for k, v in prim_out["city_name"].value_counts().items()},
        "dedup_rule": f"같은 모바일 번호 + (이름 일치·{DUP_MAX_M}m 이내 | 코드 끝 {MIRROR_TAIL}자리 일치·{MIRROR_MAX_M}m 이내)",
        "usage_note": "정류장별 일일 평균 승차·하차 인원(원천 설명). 환승은 승차·하차와의 중복 여부를 확인하지 못해 합산하지 않는다.",
    }
    (config.PROCESSED_DIR / "bus_meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1, sort_keys=True), encoding="utf-8")
    return {"report": rep, "stops": len(out_stops)}


def main() -> None:
    argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter).parse_args()
    res = build()
    print(f"[done] data/processed/bus_stops.parquet ({res['stops']:,}행), data/processed/bus_usage_match.parquet, outputs/tables/bus_transit_report.csv")
    for r in res["report"]:
        print(f"  [{r['section']}] {r['metric']}: {r['value']}  {r['note']}")


if __name__ == "__main__":
    main()
