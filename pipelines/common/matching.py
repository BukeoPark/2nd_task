"""상호·주소 정규화 — 원천이 다른 매장 레코드를 비교할 때 공통으로 쓴다.

backend(app/services/place_matching.py)에도 같은 규칙이 있다. backend 는 pipelines 를 import 하지 않으므로
의도적으로 둔 중복이다 — 한쪽을 바꾸면 다른 쪽도 같이 바꾼다.
"""
from __future__ import annotations

import re

_CORP = re.compile(r"\(주\)|㈜|\(유\)|\(재\)|\(사\)|주식회사|유한회사|유한책임회사|의료법인|재단법인|사단법인")
_NON_WORD = re.compile(r"[^0-9a-z가-힣]")
_BRANCH = re.compile(r"([0-9a-z가-힣]+)점$")
_ROAD = re.compile(r"([0-9A-Za-z가-힣]+(?:로|길))\s*(\d+(?:-\d+)?)")
_JIBUN = re.compile(r"([가-힣]+\d*동\d*가?)\s+(?:산\s*)?(\d+(?:-\d+)?)")


def norm_name(name: str | None) -> str:
    if not isinstance(name, str) or not name:
        return ""
    s = _CORP.sub("", name.lower())
    return _NON_WORD.sub("", s)


def split_branch(name_norm: str) -> tuple[str, str | None]:
    """'스타벅스당산역점' -> ('스타벅스당산역점', '당산역') 처럼 지점 토큰을 따로 돌려준다(본체는 그대로)."""
    m = _BRANCH.search(name_norm)
    return name_norm, (m.group(1) if m and len(name_norm) > len(m.group(0)) else None)


def name_relation(store_full: str, store_core: str, other: str) -> str:
    """exact | partial | none. store_full=상호+지점 정규화, store_core=상호만."""
    if not other or not store_core:
        return "none"
    if other in (store_full, store_core):
        return "exact"
    shorter, longer = sorted((store_core, other), key=len)
    if len(shorter) >= 3 and shorter in longer:
        return "partial"
    return "none"


def branch_conflict(store_branch: str | None, other_norm: str, store_core: str) -> bool:
    """매장에 지점명이 있는데 상대 상호가 다른 '~점'으로 끝나면 다른 지점으로 본다."""
    if not store_branch:
        return False
    rest = other_norm[len(store_core):] if other_norm.startswith(store_core) else other_norm
    m = _BRANCH.search(rest)
    return bool(m) and norm_name(store_branch).removesuffix("점") != m.group(1)


def road_key(addr: str | None) -> str | None:
    if not isinstance(addr, str) or not addr:
        return None
    head = addr.split(",")[0]
    m = _ROAD.findall(head)
    return f"{m[-1][0]} {m[-1][1]}" if m else None


def jibun_key(addr: str | None) -> str | None:
    if not isinstance(addr, str) or not addr:
        return None
    m = _JIBUN.search(addr)
    return f"{m.group(1)} {m.group(2)}" if m else None
