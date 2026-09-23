"""상호·주소 정규화와 거리 — pipelines/common/matching.py 와 같은 규칙.

backend 는 pipelines 를 import 하지 않으므로(단방향 의존) 의도적으로 둔 중복이다. 한쪽을 바꾸면 다른 쪽도 바꾼다.
"""
from __future__ import annotations

import math
import re

import numpy as np

_CORP = re.compile(r"\(주\)|㈜|\(유\)|\(재\)|\(사\)|주식회사|유한회사|유한책임회사|의료법인|재단법인|사단법인")
_NON_WORD = re.compile(r"[^0-9a-z가-힣]")
_BRANCH = re.compile(r"([0-9a-z가-힣]+)점$")
_ROAD = re.compile(r"([0-9A-Za-z가-힣]+(?:로|길))\s*(\d+(?:-\d+)?)")
EARTH_R = 6_371_008.8


def norm_name(name: str | None) -> str:
    if not isinstance(name, str) or not name:
        return ""
    return _NON_WORD.sub("", _CORP.sub("", name.lower()))


def name_relation(store_full: str, store_core: str, other: str) -> str:
    if not other or not store_core:
        return "none"
    if other in (store_full, store_core):
        return "exact"
    shorter, longer = sorted((store_core, other), key=len)
    return "partial" if len(shorter) >= 3 and shorter in longer else "none"


def branch_conflict(store_branch: str | None, other_norm: str, store_core: str) -> bool:
    if not store_branch:
        return False
    rest = other_norm[len(store_core):] if other_norm.startswith(store_core) else other_norm
    m = _BRANCH.search(rest)
    return bool(m) and norm_name(store_branch).removesuffix("점") != m.group(1)


def road_key(addr: str | None) -> str | None:
    if not isinstance(addr, str) or not addr:
        return None
    m = _ROAD.findall(addr.split(",")[0])
    return f"{m[-1][0]} {m[-1][1]}" if m else None


def haversine_m(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * EARTH_R * math.asin(math.sqrt(a))


def haversine_many(lon: float, lat: float, lons: np.ndarray, lats: np.ndarray) -> np.ndarray:
    p1, p2 = np.radians(lat), np.radians(lats)
    a = np.sin((p2 - p1) / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(np.radians(lons - lon) / 2) ** 2
    return 2 * EARTH_R * np.arcsin(np.sqrt(a))
