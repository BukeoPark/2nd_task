"""R-ONE 상권권역의 대표 좌표를 공식 도시철도 역사 좌표에서 뽑는다 — 카카오 지오코딩 결과는 쓰지 않는다.

배경: 이전에는 카카오 로컬 검색(data/raw/kakao/reb_zone_geocode_*.json)의 역 좌표를 저장해 지도 마커 좌표로 내보냈다.
카카오 공식 계정이 로컬 API 결과의 저장 사용을 불허한다고 답해(2026-08-20) 공식 자료(국가철도공단 도시철도 역사정보 → rail_official_stations)의 좌표로 바꿨다.

실행
----
프로젝트 루트에서: .venv/bin/python -m pipelines.transform.build_reb_zone_coords   (build_rail_national 이후)

입력: data/processed/rail_official_stations.parquet
출력: data/processed/reb_zone_coords.parquet
      (reb_zone_nm, query, lon, lat, n_candidates, actual_sigungu_nm, expected_sigungu_nm, in_pilot_sigungu, coordinate_source)

선택 규칙
--------
- 서울 지역의 공식 역사 행 중 이름이 정확히 같은 행(호선별 행)의 좌표를 평균해 대표 좌표로 쓴다.
- 실제 시군구는 공식 역사 행의 구 코드(gu_code)로 판정하고, 파일럿 시군구(양천구/영등포구)와 다르면 in_pilot_sigungu=False — 까치산역처럼 이름은 목동 상권군이어도 실제 구는 강서구인 경우가 있다.
"""
from __future__ import annotations

import re

import pandas as pd

from pipelines.common import config

# 상권명(R-ONE 임대동향 CLS_NM) -> 공식 역사 정보의 역 이름. R-ONE 라벨은 일부만 '역'이 붙고 공식 정보의 역명은 '역'을 뗀다.
ZONE_TO_STATION: dict[str, tuple[str, str]] = {
    "영등포역": ("영등포역", "영등포역"),
    "당산역": ("당산", "당산역"),
    "여의도": ("여의도", "여의도역"),
    "목동": ("목동", "목동역"),
    "까치산역": ("까치산", "까치산역"),
}

# 상권명이 원래 속한다고 보는 파일럿 시군구 (실제 구와 다르면 in_pilot_sigungu=False 로 표시).
EXPECTED_SIGUNGU: dict[str, str] = {
    "영등포역": "11560", "당산역": "11560", "여의도": "11560",
    "목동": "11470", "까치산역": "11470",
}
GU_NAME = {"11470": "양천구", "11560": "영등포구", "11500": "강서구"}


def build(official: pd.DataFrame) -> pd.DataFrame:
    ok = official[official["coord_ok"] & official["region"].eq("서울")]
    rows = []
    for zone, (station, query) in ZONE_TO_STATION.items():
        g = ok[ok["name"] == station]
        if g.empty:
            print(f"  [경고] {zone}: 공식 역사 정보에 '{station}' 없음 — 건너뜀")
            continue
        gu = str(g["gu_code"].mode().iloc[0]) if g["gu_code"].notna().any() else None
        expected_nm = config.PILOT_SIGUNGU.get(EXPECTED_SIGUNGU[zone])
        actual = GU_NAME.get(gu)
        if actual is None:                                                       # 구 코드가 없으면(수집 범위 밖) 공식 주소 글자에서 구 이름을 읽는다
            m = re.search(r"(\S+구)\s", str(g["address"].dropna().iloc[0]) + " ") if g["address"].notna().any() else None
            actual = m.group(1) if m else None
        rows.append({"reb_zone_nm": zone, "query": query, "lon": round(float(g["lon"].mean()), 7), "lat": round(float(g["lat"].mean()), 7), "n_candidates": int(len(g)),
                     "actual_sigungu_nm": actual, "expected_sigungu_nm": expected_nm, "in_pilot_sigungu": actual == expected_nm, "coordinate_source": "rail_official_stations"})
    return pd.DataFrame(rows)


def main() -> None:
    p = config.PROCESSED_DIR / "rail_official_stations.parquet"
    if not p.exists():
        raise SystemExit(f"{p.relative_to(config.ROOT)} 가 없습니다. build_rail_national 을 먼저 실행하세요.")
    out = build(pd.read_parquet(p))
    out_path = config.PROCESSED_DIR / "reb_zone_coords.parquet"
    out.to_parquet(out_path, index=False)
    for r in out.itertuples():
        flag = "" if r.in_pilot_sigungu else f"  [주의] 실제 행정구역={r.actual_sigungu_nm} (예상 {r.expected_sigungu_nm} 과 다름)"
        print(f"  {r.reb_zone_nm}: lon={r.lon:.6f} lat={r.lat:.6f} (공식 행 {r.n_candidates}개 평균){flag}")
    print(f"저장: {out_path.relative_to(config.ROOT)} ({len(out)}개 상권)")


if __name__ == "__main__":
    main()
