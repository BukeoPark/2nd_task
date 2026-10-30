"""테스트용 작은 가상 산출물. 실제 data/processed 가 없는 환경(새 PC·CI)에서도 API 계약을 확인한다.

모두 지어낸 값이다(가상 역·상권·매장). 실제 파이프라인 산출물의 열 이름·자료형만 따른다.
"""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

# 서로 겹치지 않는 가로세로 0.01도 사각형 두 개(행정동 경계).
_SQUARES = {0: (126.86, 37.52), 1: (126.87, 37.52)}


def _square(lon: float, lat: float) -> list:
    d = 0.01
    ring = [[lon, lat], [lon + d, lat], [lon + d, lat + d], [lon, lat + d], [lon, lat]]
    return [[ring]]


def write_sample(folder: Path) -> None:
    """검색·지역 API 에 필요한 최소 산출물을 folder 에 만든다."""
    folder.mkdir(parents=True, exist_ok=True)
    features = [{"type": "Feature", "properties": {"region_id": rid, "adm_nm": f"서울특별시 샘플구 샘플{rid + 1}동", "sgg": "11999", "sggnm": "샘플구"},
                 "geometry": {"type": "MultiPolygon", "coordinates": _square(*xy)}} for rid, xy in _SQUARES.items()]
    (folder / "regions.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False), encoding="utf-8")

    pd.DataFrame([{"region_id": rid, "adm_cd": f"99990{rid}", "adm_cd2": f"11999{rid}000", "sgg": "11999", "sggnm": "샘플구",
                   "dong_nm": f"샘플{rid + 1}동", "adongCd": f"1199910{rid}0"} for rid in _SQUARES]).to_parquet(folder / "dong_crosswalk.parquet")

    pd.DataFrame([
        {"trdar_cd": "9000001", "trdar_nm": "가나다역 1번", "trdar_type": "발달상권", "sigungu_cd": "11999", "adongCd": "119991000", "area_m2": 10000.0, "lon": 126.865, "lat": 37.525},
        {"trdar_cd": "9000002", "trdar_nm": "라마바시장", "trdar_type": "전통시장", "sigungu_cd": "11999", "adongCd": "119991010", "area_m2": 8000.0, "lon": 126.875, "lat": 37.525},
    ]).to_parquet(folder / "trdar_areas.parquet")

    pd.DataFrame([{"indsSclsCd": "I21201", "indsSclsNm": "한식 일반 음식점업", "store_count": 3, "svc_cd": "CS100001", "svc_nm": "한식음식점",
                   "status": "sales", "note": ""}]).to_parquet(folder / "sales_industry_crosswalk.parquet")

    base = {"brchNm": None, "indsLclsCd": "I2", "indsLclsNm": "음식", "indsMclsCd": "I212", "indsMclsNm": "한식", "indsSclsCd": "I21201",
            "indsSclsNm": "한식 일반 음식점업", "ksicCd": "I56111", "ksicNm": "한식 음식점업", "ctprvnCd": "11", "ctprvnNm": "서울특별시",
            "signguCd": "11999", "signguNm": "샘플구", "ldongCd": "1199910000", "bldNm": None}
    stores = [
        {"bizesId": "SAMPLE001", "bizesNm": "샘플국밥", "brchNm": "본점", "adongCd": "119991000", "adongNm": "샘플1동",
         "lnoAdr": "서울특별시 샘플구 샘플동 1-1", "rdnmAdr": "서울특별시 샘플구 샘플로 1", "lon": 126.862, "lat": 37.522},
        {"bizesId": "SAMPLE002", "bizesNm": "샘플국밥", "brchNm": "2호점", "adongCd": "119991010", "adongNm": "샘플2동",
         "lnoAdr": "서울특별시 샘플구 샘플동 2-1", "rdnmAdr": "서울특별시 샘플구 샘플로 20", "lon": 126.872, "lat": 37.522},
        {"bizesId": "SAMPLE003", "bizesNm": "예시분식", "adongCd": "119991010", "adongNm": "샘플2동",
         "lnoAdr": "서울특별시 샘플구 샘플동 3-1", "rdnmAdr": "서울특별시 샘플구 예시로 3", "lon": 126.874, "lat": 37.527},
    ]
    pd.DataFrame([{**base, **s} for s in stores]).to_parquet(folder / "stores.parquet")
