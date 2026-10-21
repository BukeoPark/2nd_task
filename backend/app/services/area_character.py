"""상권 유형 및 입지 특성 — 행정동·발달/골목상권의 교통 접근성·배후 수요·앵커/상업 환경·경쟁 환경을 사실 그대로 보이고,
설명 가능한 규칙으로 '특성(복수)'을 붙인다. 종합점수·창업 성공 확률은 만들지 않는다.

숫자를 읽는 법
  - 모든 값은 그 단위(행정동·상권) '경계' 기준이다. 매장 반경(250·500·1km) 값(location-influence)과 섞지 않는다. 행정동과 상권은 경계가 서로 달라 따로 계산한다.
  - 교통: 역은 '경계 안'과 '경계 밖 250m 이내'를 따로 세고(환승 노선은 한 역사로 한 번), 이용량은 연결된 역만의 2025 하루 평균 승차·하차(관측된 부분 합계, 없으면 자료 없음)다.
    버스는 경계 안 정류장만 센다. 역과 버스는 서로 다른 교통수단이라 합치지 않는다. 이용량은 실시간 유동인구·매장 방문객이 아니다.
  - 소비 수요·앵커·경쟁은 기존 비교 계산(food_map.compare — 원천·기준 분기·업종 범위가 값마다 따라온다)을 그대로 쓴다. 선택 업종은 경쟁 영역에만 반영하고 유형 판정은 외식 전체 기준이다.
  - 유형 판정은 '참고용 규칙 분류'다(검증 전). 특성은 서로 배타적이지 않아 여러 개가 붙을 수 있고, 근거가 부족하면 그 특성은 판정 보류, 판정할 수 있는 특성이 하나도 없으면 '분류 보류'다.
    상관 관계를 말할 뿐 인과가 아니다.

판정 기준(실제 파일럿 분포로 정함 — 근거는 basis 응답과 docs 가 아닌 아래 상수 주석)
  - 업무: 직장인구 ÷ (직장+상주) ≥ 0.60 (기존 수요 유형 기준과 같음). 주거: ≤ 0.30. 사이는 혼합. 직장+상주 인구가 1,000명 미만이면(상권 25% 분위수) 비율이 불안정해 판정 보류.
    이 비율은 같은 단위의 점심(11~14시)·야간(21~24시) 유동 비중과 따로 상관이 크다(행정동 0.79/-0.80, 상권 0.70/-0.62) — 근거 문장에 보조로 보인다.
  - 교통 거점: 경계 안 또는 250m 이내 역이 있고, 그 역(연결된 것)의 하루 평균 승차 합이 같은 단위(행정동/상권)에서 연결된 역이 있는 단위 중 상위 25% 이상
    (파일럿 기준 행정동 약 42천명, 상권 약 30천명). 역은 있는데 이용량이 하나도 연결되지 않으면 판정 보류.
  - 상업 집중: 점포 밀도(외식 전체 점포 ÷ 면적)가 같은 단위 상위 25% 이상이고 집객시설 밀도가 같은 단위 중앙값 이상. 점포 20곳 미만이거나 면적 0.01㎢ 미만이면 밀도가 불안정해 판정 보류.
"""
from __future__ import annotations

import collections
from functools import lru_cache

import numpy as np
import pandas as pd
import shapely
from pyproj import Transformer
from shapely.ops import transform

from app.services import area_overview, data_store, food_map, rail_access

LEVELS = ("dong", "trdar")
WORKER_MIN = 0.60            # 업무 — 기존 수요 유형(업무형) 기준과 같다
RESIDENT_MAX = 0.30          # 주거 — 기존 수요 유형(주거형) 기준과 같다
MIN_POP_BASE = 1_000         # 직장+상주 인구 최소(상권 25% 분위수) — 미만이면 업무/주거 판정 보류
RAIL_NEAR_M = 250            # 경계 밖 역 포함 거리(매장 스세권 도보권 250m 와 같은 규모)
TRANSIT_TOP_QUANTILE = 0.75   # 역(연결된 것) 하루 평균 승차 합의 같은 단위 상위 25% — 기준값은 _refs 에서 단위별로 계산
MIN_STORES_DENSITY = 20      # 점포 밀도를 판정에 쓰는 최소 점포 수
MIN_AREA_KM2 = 0.01          # 밀도를 판정에 쓰는 최소 면적(상권 면적 분포 하위 ~10% 미만은 밀도가 튄다)
BUS_LINK_CAUTION = 0.70      # 경계 안 버스 이용량 연결률이 이보다 낮으면 해석 주의 문구(분류에는 쓰지 않음; 상권 연결률 하위 약 25%)
SMALL_AREA_KM2 = 0.03        # 이보다 작으면(상권 25% 분위수) 밀도는 참고
USAGE_YEAR = 2025
TRAIT_LABEL = {"business": "업무 중심형", "residential": "주거 중심형", "transit": "교통 거점형", "commercial": "상업 집중형"}
HOLD_LABEL = "자료 부족으로 판정 보류"
MIXED_LABEL = "혼합형"
_to_m = Transformer.from_crs("EPSG:4326", "EPSG:5179", always_xy=True).transform


def _num(v, nd: int = 1):
    return None if v is None or (isinstance(v, float) and np.isnan(v)) or pd.isna(v) else round(float(v), nd)


# ── 공간 특성(경계 기준) ───────────────────────────────────────────────────────────────────────

def _shapes(level: str) -> dict[str, object]:
    if level == "trdar":
        return area_overview._trdar_shapes()
    return {c: transform(_to_m, s) for c, s in food_map._dong_shapes().items()}


@lru_cache(maxsize=1)
def _spatial() -> dict[tuple[str, str], dict]:
    """(level, code) → 경계 기준 교통·앵커 사실. 한 번 계산해 캐시한다(파일이 바뀌면 서버를 다시 띄운다)."""
    off = data_store.load_parquet("rail_official_stations.parquet")
    usage = data_store.load_parquet("rail_usage_complex_2025.parquet")
    links = rail_access.entrance_links()                   # 사용 중단 상태에서는 빈 표(출입구 좌표를 읽지 않는다)
    cx = rail_access.build_complexes(off, usage, links)
    cx["x"], cx["y"] = _to_m(cx["lon"].to_numpy(), cx["lat"].to_numpy())
    rail_pts = shapely.points(cx["x"].to_numpy(), cx["y"].to_numpy())
    bus = data_store.load_parquet("bus_stops.parquet")
    bus = bus[bus["is_primary"] & bus["x_5179"].notna()].reset_index(drop=True)
    bus_pts = shapely.points(bus["x_5179"].to_numpy(), bus["y_5179"].to_numpy())
    anc = data_store.load_parquet("anchor_stores.parquet")
    ax, ay = _to_m(anc["lon"].to_numpy(), anc["lat"].to_numpy())
    anc_pts = shapely.points(ax, ay)
    out: dict[tuple[str, str], dict] = {}
    for level in LEVELS:
        for code, sh in _shapes(level).items():
            d = shapely.distance(sh, rail_pts)
            near = cx[d <= RAIL_NEAR_M].assign(dist=d[d <= RAIL_NEAR_M]).sort_values(["dist", "name"])
            stations = []
            for r in near.itertuples():
                linked = r.usage_state in ("all_linked", "partial")
                stations.append({"name": r.name, "lines": r.lines, "where": "inside" if r.dist == 0 else "within_250m", "distance_m": int(round(r.dist)),
                                 "boardings": _num(r.avg_daily_boardings_2025, 0) if linked else None, "alightings": _num(r.avg_daily_alightings_2025, 0) if linked else None,
                                 "usage_state": r.usage_state, "lines_with_usage": int(r.lines_with_usage), "lines_total": int(r.lines_total),
                                 "complete_2025": bool(r.complete_2025) if linked else False, "region": r.region})
            linked_st = [s for s in stations if s["boardings"] is not None]
            bi = shapely.contains(sh, bus_pts)
            b = bus[bi]
            bl = b[b["usage_status"] == "linked"]
            area_km2 = sh.area / 1e6
            out[(level, code)] = {
                "area_km2": area_km2, "rail_nearest_m": int(round(float(d.min()))) if len(d) else None, "stations": stations,
                "rail_linked": len(linked_st), "rail_boardings": float(sum(s["boardings"] for s in linked_st)) if linked_st else None,
                "rail_alightings": float(sum(s["alightings"] for s in linked_st)) if linked_st else None,
                "bus_n": int(len(b)), "bus_per_km2": float(len(b) / area_km2) if area_km2 > 0 else None, "bus_linked": int(len(bl)),
                "bus_boardings": float(bl["avg_daily_boardings"].sum()) if len(bl) else None, "bus_alightings": float(bl["avg_daily_alightings"].sum()) if len(bl) else None,
                "anchors": {brand: {"inside": int(((shapely.distance(sh, anc_pts) == 0) & (anc["brand"] == brand).to_numpy()).sum()),
                                    "nearest_m": int(round(float(shapely.distance(sh, anc_pts)[(anc["brand"] == brand).to_numpy()].min()))) if (anc["brand"] == brand).any() else None}
                            for brand in ("starbucks", "daiso")},
            }
    # 같은 역이 인접한 여러 단위에 함께 잡히는 정도 — 그 역의 이용량이 단위마다 중복 귀속되므로 단위끼리 더하면 안 된다
    shared = collections.Counter((lv, s_["name"]) for (lv, _), x in out.items() for s_ in x["stations"])
    for (lv, _), x in out.items():
        for s_ in x["stations"]:
            s_["shared_units"] = shared[(lv, s_["name"])]
        x["rail_shared_max"] = max([s_["shared_units"] for s_ in x["stations"] if s_["boardings"] is not None], default=1)
    return out


DEFAULT_PARAMS = {"worker_min": WORKER_MIN, "resident_max": RESIDENT_MAX, "min_pop": MIN_POP_BASE, "transit_q": TRANSIT_TOP_QUANTILE, "density_q": 0.75}


@lru_cache(maxsize=2)
def _dist(level: str) -> dict:
    """같은 단위(행정동 36 / 상권 152)의 분포 원자료 — 기준값은 thresholds() 가 분위수만 바꿔 다시 계산한다(민감도 분석에도 쓴다). 선택 업종과 무관하게 외식 전체 기준."""
    vals, *_ = food_map._unit_table(level, None, None)
    sp = _spatial()
    hin = data_store.load_parquet(f"{level}_hinterland.parquet").set_index("adongCd" if level == "dong" else "trdar_cd")
    fl = data_store.load_parquet(f"{level}_floating_pop.parquet")
    key = "adongCd" if level == "dong" else "trdar_cd"
    last = fl.sort_values("quarter").groupby(key).tail(1).set_index(key)
    rows = []
    for code in vals.index:
        area = sp.get((level, code), {}).get("area_km2")
        stores = vals.at[code, "stores_sbiz"] if "stores_sbiz" in vals else np.nan
        fac = hin["fac_total"].get(code, np.nan) if code in hin.index else np.nan
        rows.append({"code": code, "area": area, "stores": stores, "store_density": stores / area if area and area > 0 else np.nan,
                     "fac_density": fac / area if area and area > 0 and pd.notna(fac) else np.nan,
                     "lunch": last["share_t11_14"].get(code, np.nan), "late": last["share_t21_24"].get(code, np.nan)})
    df = pd.DataFrame(rows).set_index("code")
    boardings = pd.Series({code: x["rail_boardings"] for (lv, code), x in sp.items() if lv == level and x["rail_boardings"] is not None}, dtype=float)
    return {"table": df, "boardings": boardings, "units": int(len(df))}


def thresholds(level: str, params: dict | None = None) -> dict:
    """판정에 쓰는 같은 단위 기준값 — 점포 밀도 상위 density_q·역 이용량 상위 transit_q 분위수(상위 25% = 0.75 분위수), 집객시설 밀도 중앙값."""
    p = {**DEFAULT_PARAMS, **(params or {})}
    d = _dist(level)
    df = d["table"]
    ok = (df["stores"] >= MIN_STORES_DENSITY) & (df["area"] >= MIN_AREA_KM2)
    b = d["boardings"]
    return {"store_density_p75": float(df.loc[ok, "store_density"].quantile(p["density_q"])), "fac_density_median": float(df["fac_density"].median()), "units": d["units"],
            "transit_boardings_p75": float(b.quantile(p["transit_q"])) if len(b) else None, "transit_units": int(len(b)), "density_q": p["density_q"], "transit_q": p["transit_q"]}


def _refs(level: str) -> dict:
    return {**thresholds(level), "table": _dist(level)["table"]}


def _pct_rank(series: pd.Series, value) -> float | None:
    s = series.dropna()
    if pd.isna(value) or s.empty:
        return None
    return round(float((s <= value).mean()) * 100, 0)


# ── 유형 판정(순수 함수) ───────────────────────────────────────────────────────────────────────

def classify(f: dict, refs: dict, params: dict | None = None) -> dict:
    """사실 f 와 같은 단위 분포 refs 로 특성을 판정한다. 근거가 부족한 특성은 held 에 사유(실제 수치 포함)와 함께 둔다(조용히 false 로 두지 않음).

    f: workers, residents, rail_near(경계 안·250m 안 역 수), rail_boardings(연결된 역 승차 합|None), rail_linked, store_density, stores, area_km2, fac_density, 보조: lunch_rank, late_rank
    refs: store_density_p75, fac_density_median, transit_boardings_p75 (thresholds() 결과)
    params: 기준값 덮어쓰기(민감도 분석용) — 없으면 DEFAULT_PARAMS
    """
    p = {**DEFAULT_PARAMS, **(params or {})}
    wmin, rmax, minpop = p["worker_min"], p["resident_max"], p["min_pop"]
    traits: list[dict] = []
    held: list[dict] = []
    evaluated_no_match: list[str] = []
    workers, residents = f.get("workers"), f.get("residents")
    base = (workers or 0) + (residents or 0) if workers is not None and residents is not None else None
    ws = (workers / base) if base else None
    demand_ok = base is not None and base >= minpop and ws is not None
    mixed = False
    if not demand_ok:
        held.append({"key": "demand", "reason": (f"직장·상주 인구 합이 {base:,.0f}명으로 기준({minpop:,}명) 미만이라 업무·주거 판정을 보류했습니다." if base is not None
                                                  else "직장·상주 인구 자료가 없어 업무·주거 판정을 보류했습니다.")})
    elif ws >= wmin:
        ev = [f"직장인구 {ws * 100:.0f}% (기준 {wmin * 100:.0f}% 이상)", f"직장 {workers:,.0f}명 · 상주 {residents:,.0f}명"]
        if f.get("lunch_rank") is not None and f["lunch_rank"] >= 75:
            ev.append(f"점심(11~14시) 유동 비중 {rank_phrase(f['lunch_rank'])}")
        traits.append({"key": "business", "label": TRAIT_LABEL["business"], "evidence": ev})
    elif ws <= rmax:
        ev = [f"직장인구 {ws * 100:.0f}% (기준 {rmax * 100:.0f}% 이하)", f"상주 {residents:,.0f}명 · 직장 {workers:,.0f}명"]
        if f.get("late_rank") is not None and f["late_rank"] >= 75:
            ev.append(f"야간(21~24시) 유동 비중 {rank_phrase(f['late_rank'])}")
        traits.append({"key": "residential", "label": TRAIT_LABEL["residential"], "evidence": ev})
    else:
        mixed = True
    # 교통 거점
    if f.get("rail_near", 0) > 0:
        if f.get("rail_linked", 0) == 0:
            held.append({"key": "transit", "reason": f"경계 안·{RAIL_NEAR_M}m 이내 역 {f['rail_near']}곳은 있으나 이용량 자료가 연결되지 않아 교통 거점 판정을 보류했습니다."})
        elif refs.get("transit_boardings_p75") is not None and (f.get("rail_boardings") or 0) >= refs["transit_boardings_p75"]:
            ev = [f"{RAIL_NEAR_M}m 이내 포함 역 {f['rail_near']}곳",
                  f"연결된 역 승차 하루 평균 {f['rail_boardings']:,.0f}명 (같은 단위 상위 {(1 - p['transit_q']) * 100:.0f}% 기준 {refs['transit_boardings_p75']:,.0f}명 이상, 관측된 부분 합계)"]
            if (f.get("rail_shared") or 1) >= 2:
                ev.append(f"같은 역을 같은 단위 {f['rail_shared']}곳이 함께 포함 — 이용량은 곳끼리 더하면 중복")
            traits.append({"key": "transit", "label": TRAIT_LABEL["transit"], "evidence": ev})
        else:
            evaluated_no_match.append("교통")
    else:
        evaluated_no_match.append("교통")
    # 상업 집중
    stores, area = f.get("stores"), f.get("area_km2")
    why = []
    if stores is None or stores < MIN_STORES_DENSITY:
        why.append(f"외식 점포 {0 if stores is None else stores:,.0f}곳(기준 {MIN_STORES_DENSITY}곳 이상 필요)")
    if area is None or area < MIN_AREA_KM2:
        why.append(f"면적 {0 if area is None else area:.4f}㎢(기준 {MIN_AREA_KM2}㎢ 이상 필요)")
    if f.get("fac_density") is None:
        why.append("집객시설 자료 없음")
    if not why and f.get("store_density") is None:
        why.append("점포 밀도를 계산할 수 없음")
    if why:
        held.append({"key": "commercial", "reason": " · ".join(why) + " — 밀도가 불안정해 상업 집중 판정을 보류했습니다."})
    elif f["store_density"] >= refs["store_density_p75"] and f["fac_density"] >= refs["fac_density_median"]:
        ev = [f"외식 점포 {f['store_density']:,.0f}곳/㎢ (같은 단위 상위 {(1 - p['density_q']) * 100:.0f}% 기준 {refs['store_density_p75']:,.0f}곳/㎢ 이상)",
              f"집객시설 {f['fac_density']:,.0f}곳/㎢ (같은 단위 중앙값 {refs['fac_density_median']:,.0f}곳/㎢ 이상)"]
        if (area or 0) < SMALL_AREA_KM2:
            ev.append(f"면적 {area:.3f}㎢로 작아 밀도가 과대하게 보일 수 있음")
        traits.append({"key": "commercial", "label": TRAIT_LABEL["commercial"], "evidence": ev})
    else:
        evaluated_no_match.append("상업")
    if traits:
        kind, headline = "traits", " + ".join(t["label"] for t in traits)
    elif mixed:
        kind, headline = "mixed", MIXED_LABEL
    else:
        kind, headline = "hold", HOLD_LABEL
    out = {"kind": kind, "headline": headline, "traits": traits, "held": held, "worker_share": _num(ws * 100, 1) if ws is not None else None,
           "demand_label": None if not demand_ok else ("업무형" if ws >= wmin else ("주거형" if ws <= rmax else "혼합형"))}   # 다른 특성이 붙어도 수요 구조는 따로 알린다
    if kind == "mixed":
        tail = ("교통·상업 특성도 기준에 해당하지 않음" if not any(h["key"] in ("transit", "commercial") for h in held)
                else "교통·상업 중 판정을 보류한 항목이 있어 '특성이 없다'고 단정하지 않음")
        out["mixed_evidence"] = [f"직장인구 {ws * 100:.0f}% — 업무({wmin * 100:.0f}%↑)·주거({rmax * 100:.0f}%↓) 기준 사이", tail]
    if kind == "hold":
        extra = f" (판정한 {'·'.join(evaluated_no_match)} 특성은 기준에 해당하지 않음)" if evaluated_no_match else ""
        out["hold_reason"] = "판정에 쓸 수 있는 근거가 부족합니다: " + " ".join(h["reason"] for h in held) + extra
    return out


def rank_phrase(rank: float) -> str:
    return f"같은 단위 상위 {max(1, round(100 - rank))}%"


def unit_features(level: str, code: str) -> dict:
    """유형 판정에 쓰는 사실(외식 전체 기준·경계 기준). character() 와 민감도 분석이 같은 값을 쓴다."""
    sp = _spatial().get((level, code))
    if sp is None:
        raise KeyError(code)
    table = _dist(level)["table"]
    base_rows, _ = _cmp_cells(level, code, None, None)
    wrc, rep = _cell(base_rows, "wrc_total")["value"], _cell(base_rows, "repop_total")["value"]
    fac, stores_all = _cell(base_rows, "fac_total")["value"], _cell(base_rows, "stores_sbiz")["value"]
    area = sp["area_km2"]
    fl = area_overview._floating(level, code)
    lunch = next((s["pct"] for s in fl["slots"] if s["label"] == "11~14시"), None) if fl else None
    late = next((s["pct"] for s in fl["slots"] if s["label"] == "21~24시"), None) if fl else None
    return {"workers": wrc, "residents": rep, "rail_near": len(sp["stations"]), "rail_linked": sp["rail_linked"], "rail_boardings": sp["rail_boardings"], "rail_shared": sp["rail_shared_max"],
            "stores": stores_all, "area_km2": area, "store_density": (stores_all / area) if stores_all is not None and area > 0 else None,
            "fac_density": (fac / area) if fac is not None and area > 0 else None, "lunch": lunch, "late": late,
            "lunch_rank": _pct_rank(table["lunch"] * 100, lunch), "late_rank": _pct_rank(table["late"] * 100, late)}


# ── 응답 만들기 ───────────────────────────────────────────────────────────────────────────────

@lru_cache(maxsize=1024)
def _cmp_cells(level: str, code: str, svc: str | None, scls: str | None) -> tuple[dict, dict]:   # 반환 값은 읽기 전용으로만 쓴다(_cell 이 칸을 복사해 쓴다)
    c = food_map.compare(level, [code], svc, scls)
    rows = {r["key"]: r for r in c["rows"]}
    return rows, c["scope"]


def _cell(rows: dict, key: str) -> dict:
    r = rows.get(key)
    if r is None:
        return {"value": None, "note": "자료 없음"}
    cell = dict(r["cells"][0])
    cell["as_of"], cell["source"] = r.get("as_of"), r.get("source")
    return cell


def character(level: str, code: str, svc: str | None, scls: str | None) -> dict:
    if level not in LEVELS:
        raise ValueError(f"level 은 {LEVELS} 중 하나여야 합니다")
    food_map.validate_filter(svc, scls)
    units = food_map._units()[level].set_index("code")
    if code not in units.index:
        raise KeyError(code)
    sp = _spatial().get((level, code))
    if sp is None:
        raise KeyError(code)
    refs = _refs(level)
    rows, scope = _cmp_cells(level, code, svc, scls)
    base_rows, _ = _cmp_cells(level, code, None, None)               # 유형 판정은 외식 전체 기준(선택 업종과 무관하게 고정)
    feats = unit_features(level, code)
    area, fl = feats["area_km2"], area_overview._floating(level, code)
    lunch, late, lunch_rank, late_rank = feats["lunch"], feats["late"], feats["lunch_rank"], feats["late_rank"]
    typ = classify(feats, refs)

    # ① 교통 접근성 (경계 기준)
    st_in = [s for s in sp["stations"] if s["where"] == "inside"]
    st_near = [s for s in sp["stations"] if s["where"] == "within_250m"]
    rail_state = "no_stations" if not sp["stations"] else ("none_linked" if sp["rail_linked"] == 0 else ("all_linked" if sp["rail_linked"] == len(sp["stations"]) and all(s["lines_with_usage"] == s["lines_total"] for s in sp["stations"]) else "partial"))
    bus_state = "no_stops" if sp["bus_n"] == 0 else ("none_linked" if sp["bus_linked"] == 0 else ("all_linked" if sp["bus_linked"] == sp["bus_n"] else "partial"))
    transit = {
        "rail": {"inside": st_in, "within_250m": st_near, "nearest_m": sp["rail_nearest_m"], "count": len(sp["stations"]), "linked": sp["rail_linked"], "usage_state": rail_state,
                 "boardings_observed": _num(sp["rail_boardings"], 0), "alightings_observed": _num(sp["rail_alightings"], 0), "year": USAGE_YEAR,
                 "basis": f"경계 안 + 경계 밖 {RAIL_NEAR_M}m 이내 역사(환승 노선은 한 역사로 한 번). 이용량은 연결된 역만의 {USAGE_YEAR}년 하루 평균 승차·하차(관측된 부분 합계)."},
        "bus": {"count": sp["bus_n"], "per_km2": _num(sp["bus_per_km2"], 1), "linked": sp["bus_linked"], "linked_ratio": _num(sp["bus_linked"] / sp["bus_n"], 3) if sp["bus_n"] else None, "usage_state": bus_state,
                "boardings_observed": _num(sp["bus_boardings"], 0), "alightings_observed": _num(sp["bus_alightings"], 0), "year": USAGE_YEAR,
                "basis": "경계 안 정류장만(버스는 경계 밖을 더하지 않음). 이용량은 연결된 정류장만의 하루 평균 승차·하차(관측된 부분 합계).",
                "caution": (f"이용량 연결률 {sp['bus_linked'] / sp['bus_n'] * 100:.0f}% — 연결되지 않은 정류장이 많아 승하차는 일부 정류장만 관측된 값입니다."
                            if sp["bus_n"] and sp["bus_linked"] / sp["bus_n"] < BUS_LINK_CAUTION else None)},
        "note": "역·버스의 승하차 수치는 해당 역·정류장의 이용 기록(역 이용 수요)이며 실제 상권 방문객이나 실시간 유동인구가 아닙니다. 서로 다른 교통수단이라 합치지 않았습니다. "
                "같은 역은 인접한 여러 단위에 함께 잡힐 수 있어(역 목록의 '인접 단위 N곳 공유') 단위끼리 이용량을 더하면 중복입니다.",
    }
    # ② 배후 소비 수요
    ws = typ["worker_share"]
    demand = {
        "workers": _cell(base_rows, "wrc_total"), "residents": _cell(base_rows, "repop_total"), "worker_share_pct": ws,
        "demand_type": None if ws is None else ("업무형" if ws >= WORKER_MIN * 100 else ("주거형" if ws <= RESIDENT_MAX * 100 else "혼합형")),
        "base_ok": feats["workers"] is not None and feats["residents"] is not None and (feats["workers"] + feats["residents"]) >= MIN_POP_BASE,
        "floating": None if fl is None else {"quarter": fl["quarter"], "label": fl["label"], "flpop": fl["flpop"], "weekend_pct": fl["weekend_pct"], "slots": fl["slots"],
                                              "lunch_pct": lunch, "late_pct": late, "lunch_rank": lunch_rank, "late_rank": late_rank,
                                              "lunch_peer_count": int(refs["table"]["lunch"].notna().sum()), "late_peer_count": int(refs["table"]["late"].notna().sum()), "yoy_pct": fl["yoy_pct"]},
        "note": "직장인구 ÷ (직장+상주) 비율로 업무·주거·혼합을 가르고(기존 수요 유형 기준), 점심·야간 유동 비중은 보조 근거입니다. 서로 다른 분기의 값은 더하지 않았습니다.",
    }
    # ③ 상업·앵커 환경
    anchor = {
        "starbucks": {**sp["anchors"]["starbucks"], "zone_share": _cell(rows, "starbucks_zone_share")}, "daiso": {**sp["anchors"]["daiso"], "zone_share": _cell(rows, "daiso_zone_share")},
        "facilities": {"total": _cell(base_rows, "fac_total"), "per_km2": _num(feats["fac_density"], 0), "reference_median": _num(refs["fac_density_median"], 0)},
        "note": f"스타벅스·다이소는 경계 안 매장 수와 경계까지 거리, 매장 단위 '250m 안 비율'(선택 업종 기준)입니다. 집객시설은 서울시 시설 수(상권·행정동 단위)입니다.",
    }
    # ④ 경쟁 환경 (선택 업종)
    stores_sel = _cell(rows, "stores_sbiz")
    dens = (stores_sel["value"] / area) if stores_sel.get("value") is not None and area > 0 else None
    competition = {
        "scope": scope, "stores": stores_sel, "density_per_km2": _num(dens, 0), "area_km2": _num(area, 3), "small_area": area < SMALL_AREA_KM2,
        "change_2y": _cell(rows, "stores_change_2y"), "open_rate_y": _cell(rows, "open_rate_y"), "close_rate_y": _cell(rows, "close_rate_y"),
        # 판정 기준(상위 25% 밀도)은 외식 전체 점포 기준이라 업종을 고르면 같은 척도가 아니다 — 외식 전체일 때만 비교 기준으로 보인다
        "reference_applies": not svc and not scls, "reference_density_p75": _num(refs["store_density_p75"], 0) if not svc and not scls else None,
        "note": "점포 수·밀도는 소상공인 상가정보(현재: 상권은 경계 안 점포, 행정동은 행정동 코드 기준)이고, 증감·개폐업은 서울시 상권분석서비스의 업종 단위 점포 통계(분기)라 모집단과 집계 기준이 다릅니다 — 같은 점포 수로 읽지 마세요. 인허가 기준 개폐업은 매장 상세(주변)에서 봅니다.",
    }
    strengths, cautions = _statements(typ, transit, demand, anchor, competition)
    return {
        "status": "ok", "level": level, "code": code, "name": units.loc[code, "name"], "trdar_type": units.loc[code].get("type") if "type" in units.columns else None,
        "type": typ, "sections": {"transit": transit, "demand": demand, "anchor": anchor, "competition": competition}, "strengths": strengths, "cautions": cautions,
        "basis": {
            "label": "참고용 분류(검증 전) — 종합점수·창업 성공 확률이 아닙니다. 상관 관계이며 인과가 아닙니다.",
            "success_note": "교통 거점형·상업 집중형은 역 이용이나 점포·시설이 많다는 뜻일 뿐, 창업 성공 가능성이나 매출 수준을 뜻하지 않습니다(경쟁도 함께 큽니다).",
            "relative_note": "교통 거점·상업 집중 기준은 양천·영등포 파일럿 188개 단위(행정동 36·상권 152) 안의 상대 위치입니다. 지역을 넓히면 기준이 달라질 수 있습니다.",
            "data_notes": [
                "점포 수·밀도: 소상공인 상가정보(현재). 상권은 경계 안 점포, 행정동은 행정동 코드 기준이라 경계 부근 점포는 면적(경계)과 약간 어긋날 수 있습니다.",
                "점포 증감·개폐업: 서울시 상권분석서비스 점포 통계(서울시 외식 업종 단위·분기). 상가정보 점포 수와 모집단·집계 기준이 달라 같은 수로 비교하지 않습니다.",
                "집객시설: 서울시 시설 수(상권·행정동 단위, 분기). 직장·상주인구·유동인구: 서울시 상권분석서비스(값마다 기준 분기가 다름).",
                "역·버스 승하차: 역·정류장 이용 기록(역 이용 수요)이며 상권 방문객이 아닙니다. 버스는 일부 정류장만 연결돼 부분 합계입니다. 같은 역은 인접 여러 단위에 함께 잡힐 수 있어 단위끼리 더하지 않습니다.",
                "값이 없는 항목은 0이 아니라 '자료 없음'이며 사유를 함께 보입니다.",
            ],
            "unit": "그 행정동·상권 경계 기준(매장 반경 값과 다름). 행정동과 상권은 경계가 달라 따로 계산합니다.",
            "rules": [
                f"업무: 직장인구 비율 {WORKER_MIN * 100:.0f}% 이상 / 주거: {RESIDENT_MAX * 100:.0f}% 이하 / 그 사이는 혼합 (직장+상주 인구 {MIN_POP_BASE:,}명 미만은 판정 보류)",
                f"교통 거점: 경계 안·{RAIL_NEAR_M}m 이내 역의 연결된 하루 평균 승차 합이 같은 단위에서 역 이용량이 연결된 단위 중 상위 25% 이상(기준 {refs['transit_boardings_p75']:,.0f}명 · 단위 {refs['transit_units']}곳)",
                f"상업 집중: 외식 점포 밀도가 같은 단위 상위 25% 이상이고 집객시설 밀도가 같은 단위 중앙값 이상(점포 {MIN_STORES_DENSITY}곳·면적 {MIN_AREA_KM2}㎢ 미만은 판정 보류)",
                "여러 특성이 함께 해당하면 모두 표시하고, 하나도 판정할 수 없으면 '분류 보류'입니다.",
            ],
            "reference": {"units": refs["units"], "store_density_p75": _num(refs["store_density_p75"], 0), "fac_density_median": _num(refs["fac_density_median"], 0),
                          "transit_boardings_p75": _num(refs["transit_boardings_p75"], 0),
                          "note": "같은 단위(행정동 36곳 / 상권 152곳, 양천·영등포 파일럿) 안의 상대 위치입니다. 지역을 넓히면 기준이 달라질 수 있습니다."},
            "sources": [
                {"title": "국가철도공단 도시철도 역사정보 · 서울·부산·인천 승하차", "reference": f"역 이용량 {USAGE_YEAR}년 달력 연도"},
                {"title": "국토교통부 전국 버스정류장 위치정보·정류장평균이용량", "reference": f"정류장 이용량 {USAGE_YEAR}년"},
                {"title": "서울시 상권분석서비스(직장·상주인구·집객시설·유동인구·점포)", "reference": f"{fl['label'] if fl else '최신 분기'} 등 값마다 기준 분기 표기"},
                {"title": "소상공인시장진흥공단 상가(상권)정보 · 스타벅스·다이소 위치", "reference": "점포 수·앵커 현재 기준"},
            ],
        },
    }


def _statements(typ: dict, transit: dict, demand: dict, anchor: dict, competition: dict) -> tuple[list[str], list[str]]:
    """강점·주의사항 — 사실에서 규칙으로 만든 짧은 문장(최대 3개씩). 원인·효과를 단정하지 않는다."""
    s: list[str] = []
    c: list[str] = []
    rail, bus = transit["rail"], transit["bus"]
    if rail["boardings_observed"] is not None and rail["count"] > 0:
        names = "·".join(x["name"] for x in (rail["inside"] + rail["within_250m"])[:2])
        s.append(f"경계 안·{RAIL_NEAR_M}m 이내에 {names} 등 역 {rail['count']}곳이 있고 연결된 역 승차가 하루 평균 {rail['boardings_observed']:,.0f}명입니다.")
    elif rail["count"] == 0:
        c.append(f"경계 안·{RAIL_NEAR_M}m 이내에 지하철역이 없습니다(가장 가까운 역까지 경계에서 {rail['nearest_m']:,}m).")
    if bus["count"] and bus["per_km2"] is not None:
        s.append(f"경계 안 버스정류장 {bus['count']}곳(㎢당 {bus['per_km2']:.0f}곳)입니다.")
    if demand["demand_type"] == "업무형":
        s.append("직장인구 비중이 높아 평일 낮 시간대 수요가 두드러지는 구조입니다.")
    elif demand["demand_type"] == "주거형":
        s.append("상주인구 비중이 높아 생활권(주거) 수요가 두드러지는 구조입니다.")
    if not demand["base_ok"]:
        c.append("직장·상주 인구 규모가 작거나 자료가 없어 수요 구조 판정이 불안정합니다.")
    ch = competition["change_2y"].get("value")
    if ch is not None and ch <= -5:
        c.append(f"선택 업종 점포 수가 약 2년간 {ch:.1f}% 줄었습니다(서울시 업종 단위 통계).")
    cl = competition["close_rate_y"].get("value")
    if cl is not None and cl >= 15:
        c.append(f"최근 1년 폐업률 {cl:.1f}%로 높은 편입니다(서울시 업종 단위 통계, 원인은 알 수 없음).")
    if competition["small_area"]:
        c.append("면적이 작은 상권이라 밀도·비율 값이 크게 튈 수 있습니다.")
    if rail["count"] > 0 and rail["usage_state"] == "none_linked":
        c.append("역 이용량 자료가 연결되지 않아 교통 이용 수요는 확인할 수 없습니다(0명이 아니라 자료 없음).")
    if bus.get("caution"):
        c.insert(0, bus["caution"])
    elif bus["count"] and bus["usage_state"] in ("partial", "none_linked"):
        c.append("일부 정류장은 이용량이 연결되지 않아 버스 승하차는 관측된 부분 합계입니다.")
    shared = [x["name"] for x in sorted(rail["inside"] + rail["within_250m"], key=lambda z: -(z["boardings"] or 0)) if x.get("shared_units", 1) >= 2 and x["boardings"] is not None]
    if any(t["key"] == "transit" for t in typ["traits"]) and shared:
        c.append(f"교통 거점 근거인 {'·'.join(shared[:2])}역은 인접한 다른 단위에도 같은 이용량으로 잡힙니다(단위끼리 더하면 중복).")
    return s[:3], c[:3]
