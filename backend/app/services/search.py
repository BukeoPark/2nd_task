"""위치·매장 검색 — 역명·상권명·행정동·주소·매장명을 이미 가진 산출물로 찾아 지도 위치와 연결한다.

외부 지오코딩 API 를 부르지 않는다(키·호출량·약관 없이 동작). 그래서 찾을 수 있는 범위는 우리 데이터다:
  - 역: 상권 이름에서 뽑은 역 이름(예: '영등포역 2번' → 영등포역)과 그 상권들의 중심 — 공식 역 좌표가 아니라 '역 주변 상권'의 위치다.
  - 상권·행정동: 서울시 상권분석서비스의 영역 이름과 중심.
  - 주소: 소상공인 상가정보의 도로명·지번 주소(그 주소에 등록된 외식 매장 위치).
  - 매장: 외식 매장 상호.
공백·괄호·가운뎃점을 무시하고 대소문자를 구분하지 않으며, 앞부분이 일치하는 결과를 먼저 보여준다.
"""
from __future__ import annotations

import re
from functools import lru_cache

import pandas as pd

from app.services import data_store, food_map

MIN_QUERY_CHARS = 2
PER_KIND_LIMIT = 5
KIND_ORDER = ("station", "trdar", "dong", "address", "store")
STATION_RE = re.compile(r"([가-힣A-Za-z0-9]{1,12}역)")
_STRIP = re.compile(r"[\s()·\-,]+")


def normalize(text: str) -> str:
    return _STRIP.sub("", str(text)).lower()


@lru_cache(maxsize=1)
def _index() -> dict[str, pd.DataFrame]:
    units = food_map._units()
    trdar = units["trdar"].assign(key=lambda d: d["name"].map(normalize))
    dong = units["dong"].assign(label=lambda d: d["gu"] + " " + d["name"], key=lambda d: (d["gu"] + d["name"]).map(normalize))
    base = trdar.assign(station=trdar["name"].str.extract(STATION_RE)[0]).dropna(subset=["station"])
    station = (base.groupby("station").agg(lon=("lon", "mean"), lat=("lat", "mean"), areas=("code", "size")).reset_index()
               .assign(key=lambda d: d["station"].map(normalize)))
    stores = data_store.load_parquet("stores.parquet")
    stores = stores.loc[stores["indsLclsCd"] == "I2"].reset_index(drop=True)
    full_name = stores["bizesNm"].fillna("") + stores["brchNm"].fillna("")
    stores = stores.assign(name_key=full_name.map(normalize), road_key=stores["rdnmAdr"].fillna("").map(normalize),
                           lot_key=stores["lnoAdr"].fillna("").map(normalize))
    return {"trdar": trdar, "dong": dong, "station": station, "stores": stores}


def _rank(keys: pd.Series, q: str) -> pd.Series:
    """일치 순위 — 0: 전체 일치, 1: 앞부분 일치, 2: 포함. 불일치는 NaN."""
    exact, prefix, contains = keys == q, keys.str.startswith(q), keys.str.contains(q, regex=False)
    rank = pd.Series(float("nan"), index=keys.index)
    rank[contains] = 2
    rank[prefix] = 1
    rank[exact] = 0
    return rank


def _pick(df: pd.DataFrame, rank: pd.Series, sort_cols: list[str]) -> pd.DataFrame:
    hit = df.loc[rank.notna()].assign(_rank=rank.dropna())
    return hit.sort_values(["_rank", *sort_cols], kind="stable")


def search(query: str, limit: int = 20) -> dict:
    q = normalize(query)
    if len(q) < MIN_QUERY_CHARS:
        return {"query": query, "too_short": True, "min_chars": MIN_QUERY_CHARS, "results": [], "counts": {}}
    ix = _index()
    out: dict[str, list[dict]] = {k: [] for k in KIND_ORDER}
    counts: dict[str, int] = {}

    st = _pick(ix["station"], _rank(ix["station"]["key"], q), ["station"])
    counts["station"] = len(st)
    out["station"] = [{"kind": "station", "name": r.station, "subtitle": f"역 주변 상권 {int(r.areas)}곳 (상권 이름 기준 위치)",
                       "lon": round(float(r.lon), 6), "lat": round(float(r.lat), 6)} for r in st.head(PER_KIND_LIMIT).itertuples()]

    tr = _pick(ix["trdar"], _rank(ix["trdar"]["key"], q), ["name"])
    counts["trdar"] = len(tr)
    out["trdar"] = [{"kind": "trdar", "level": "trdar", "code": str(r.code), "name": r.name, "subtitle": f"상권 · {r.type}",
                     "lon": round(float(r.lon), 6), "lat": round(float(r.lat), 6)} for r in tr.head(PER_KIND_LIMIT).itertuples()]

    dg = _pick(ix["dong"], _rank(ix["dong"]["key"], q), ["label"])
    counts["dong"] = len(dg)
    out["dong"] = [{"kind": "dong", "level": "dong", "code": str(r.code), "name": r.label, "subtitle": "행정동",
                    "lon": round(float(r.lon), 6), "lat": round(float(r.lat), 6)} for r in dg.head(PER_KIND_LIMIT).itertuples()]

    stores = ix["stores"]
    road, lot = _rank(stores["road_key"], q), _rank(stores["lot_key"], q)
    addr_rank = pd.concat([road, lot], axis=1).min(axis=1)
    ad = _pick(stores, addr_rank, ["rdnmAdr", "bizesId"]).drop_duplicates("rdnmAdr")
    counts["address"] = len(ad)
    out["address"] = [{"kind": "address", "name": r.rdnmAdr or r.lnoAdr, "subtitle": f"주소 · {r.adongNm} · 외식 매장 등록 위치",
                       "lon": round(float(r.lon), 6), "lat": round(float(r.lat), 6)} for r in ad.head(PER_KIND_LIMIT).itertuples()]

    nm = _pick(stores, _rank(stores["name_key"], q), ["bizesNm", "bizesId"])
    counts["store"] = len(nm)
    out["store"] = [{"kind": "store", "store_id": r.bizesId, "name": r.bizesNm + (f" {r.brchNm}" if r.brchNm else ""),
                     "subtitle": f"매장 · {r.indsSclsNm} · {r.rdnmAdr}", "lon": round(float(r.lon), 6), "lat": round(float(r.lat), 6)}
                    for r in nm.head(PER_KIND_LIMIT).itertuples()]

    results = [x for k in KIND_ORDER for x in out[k]][:limit]
    return {"query": query, "too_short": False, "min_chars": MIN_QUERY_CHARS, "results": results, "counts": counts,
            "note": "역·상권·행정동·주소·외식 매장 이름을 서비스가 가진 자료로 찾습니다. 역 위치는 그 이름이 붙은 상권의 중심이며 공식 역 좌표가 아닙니다."}
