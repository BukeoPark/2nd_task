"""반경 내 동종업종 경쟁업체 조회.

거리 계산은 backend 안에서 자체적으로 한다 — backend 는 pipelines/ 를 import 하지 않는다
(단방향 의존: pipelines -> data -> backend). 같은 하버사인 공식이 pipelines/transform/anchor_metrics.py
에도 있지만, 아키텍처 경계를 지키려고 의도적으로 분리해 둔 중복이다.
"""
from __future__ import annotations

import numpy as np
from app.services import data_store

_EARTH_RADIUS_M = 6_371_008.8

# 업종 분류 단계별 컬럼. 경쟁업체는 보통 소분류(같은 메뉴/업태)가 가장 실질적이다.
CATEGORY_COLUMNS = {
    "lcls": ("indsLclsCd", "indsLclsNm"),
    "mcls": ("indsMclsCd", "indsMclsNm"),
    "scls": ("indsSclsCd", "indsSclsNm"),
}


def _haversine_m(lon1: float, lat1: float, lon2: np.ndarray, lat2: np.ndarray) -> np.ndarray:
    lon1, lat1 = np.radians(lon1), np.radians(lat1)
    lon2, lat2 = np.radians(lon2), np.radians(lat2)
    dlon, dlat = lon2 - lon1, lat2 - lat1
    a = np.sin(dlat / 2.0) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2.0) ** 2
    return 2.0 * _EARTH_RADIUS_M * np.arcsin(np.sqrt(a))


def find_competitors(
    lon: float,
    lat: float,
    radius_m: float,
    category_level: str,
    category_code: str | None,
    limit: int,
) -> dict:
    """중심 좌표 반경 안의 상가업소를 거리순으로 돌려준다.

    category_code(대·중·소분류 코드)를 주면 그 업종만, 안 주면 반경 안 전체를 대상으로 하고
    업종 구성(무엇이 몇 개인지)도 함께 계산해 경쟁 강도를 가늠할 수 있게 한다.
    """
    if category_level not in CATEGORY_COLUMNS:
        raise ValueError(f"category_level 은 {sorted(CATEGORY_COLUMNS)} 중 하나여야 합니다")
    code_col, name_col = CATEGORY_COLUMNS[category_level]

    stores = data_store.load_parquet("stores.parquet")
    dist = _haversine_m(lon, lat, stores["lon"].to_numpy(), stores["lat"].to_numpy())
    within = stores.loc[dist <= radius_m].copy()
    within["distance_m"] = dist[dist <= radius_m]

    # 업종 구성은 업종 필터를 걸기 전(반경 전체) 기준으로 낸다.
    mix = (
        within[name_col]
        .value_counts()
        .head(10)
        .rename_axis("category")
        .reset_index(name="count")
        .to_dict(orient="records")
    )

    matched = within if category_code is None else within.loc[within[code_col] == category_code]

    # 같은 상호+주소+업종이 여러 사업자번호로 중복 등록된 행이 약 1.5% 있다(원본 데이터 특성).
    # 경쟁업체 목록에 같은 가게가 여러 번 뜨지 않도록 표시 단계에서만 합친다(원본은 그대로 둔다).
    matched = matched.drop_duplicates(subset=["bizesNm", "rdnmAdr", "indsSclsNm"])
    total_matched = len(matched)

    # 좌표가 건물 단위라 거리 동률이 흔하다 — 재현 가능하도록 이름으로 2차 정렬한다.
    top = matched.sort_values(["distance_m", "bizesNm"], kind="stable").head(limit)
    records = [
        {
            "store_id": row["bizesId"],
            "name": row["bizesNm"],
            "branch": row["brchNm"] or None,
            "category": row[name_col],
            "category_detail": row["indsSclsNm"],
            "category_code": row["indsSclsCd"],
            "address": row["rdnmAdr"] or row["lnoAdr"],
            "dong": row["adongNm"],
            "lon": float(row["lon"]),
            "lat": float(row["lat"]),
            "distance_m": round(float(row["distance_m"]), 1),
        }
        for _, row in top.iterrows()
    ]

    return {
        "center": {"lon": lon, "lat": lat},
        "radius_m": radius_m,
        "category_level": category_level,
        "category_code": category_code,
        "total_in_radius": len(within),
        "total_matched": total_matched,
        "category_mix": mix,
        "records": records,
    }
