"""프로젝트 공통 경로와 상수.

모든 경로는 프로젝트 루트 기준 상대경로로 정의하고, 코드에서는
`config.RAW_DIR` 등을 사용해 실행 위치와 무관하게 동작하도록 한다.
"""
from __future__ import annotations

from pathlib import Path

# 이 파일은 <root>/pipelines/common/config.py 이므로 parents[2] 가 프로젝트 루트.
ROOT = Path(__file__).resolve().parents[2]

# 데이터 4단 계층
#   raw       : API/다운로드 원본 덤프. 수정·덮어쓰기 금지.
#   external  : 경계 GeoJSON, 행정동코드 매핑 등 외부 참조자료(잘 안 바뀜).
#   interim   : 파이프라인 중간 산출물(재생성 가능).
#   processed : 분석·API용 최종 산출물. backend 가 소비.
RAW_DIR = ROOT / "data" / "raw"
EXTERNAL_DIR = ROOT / "data" / "external"
INTERIM_DIR = ROOT / "data" / "interim"
PROCESSED_DIR = ROOT / "data" / "processed"
TABLES_DIR = ROOT / "outputs" / "tables"
FIGURES_DIR = ROOT / "outputs" / "figures"

for _d in (RAW_DIR, EXTERNAL_DIR, INTERIM_DIR, PROCESSED_DIR, TABLES_DIR, FIGURES_DIR):
    _d.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# 파일럿 대상 지역 (서울)
# ---------------------------------------------------------------------------
# 자치구 코드는 행정표준코드(법정동/행정구역) 5자리 시군구 코드.
PILOT_SIGUNGU: dict[str, str] = {
    "11470": "양천구",
    "11560": "영등포구",
}

# ---------------------------------------------------------------------------
# 좌표계
# ---------------------------------------------------------------------------
# 수집·저장은 WGS84 경위도(EPSG:4326), 거리/면적 연산은 미터 단위인
# UTM-K(EPSG:5179, GRS80 중부원점)로 투영해서 수행한다.
CRS_WGS84 = "EPSG:4326"
CRS_METRIC = "EPSG:5179"

# 격자 한 변 길이(m). 버블 시각화·집계의 기본 단위.
GRID_SIZES_M: tuple[int, ...] = (100, 250)

# 앵커 브랜드 정의(스세권/다세권). 실제 매장 좌표는 수집 단계에서 채운다.
ANCHOR_BRANDS: dict[str, list[str]] = {
    "starbucks": ["스타벅스", "STARBUCKS", "Starbucks"],
    "daiso": ["다이소", "DAISO", "아성다이소"],
}
