"""카카오 지오코딩 원본에서 R-ONE 상권권역의 대표 좌표를 뽑는다.

실행
----
프로젝트 루트에서: .venv/bin/python -m pipelines.transform.build_reb_zone_coords

입력: data/raw/kakao/reb_zone_geocode_<YYYYMMDD>.json (가장 최근 파일)
출력: data/processed/reb_zone_coords.parquet
      (reb_zone_nm, sigungu_cd, sigungu_nm, lon, lat, n_candidates, in_pilot_sigungu)

선택 규칙
--------
- category_name 에 "지하철" 이 포함된 후보만 채택(역과 무관한 상점·교차로 등 배제).
- 같은 역의 호선별 출입구 좌표(수십 m 차이)는 평균해서 하나의 대표 좌표로 만든다.
- 주소에서 실제 시군구를 파싱해 파일럿 시군구(양천구/영등포구)와 일치하는지 표시한다
  — 까치산역처럼 이름은 목동 상권군에 속해도 실제 행정구역은 강서구인 경우가 있다.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import pandas as pd

from pipelines.common import config

RAW_DIR = config.RAW_DIR / "kakao"

# 카카오 검색어(지하철역 이름) -> R-ONE 임대동향 통계의 상권명(CLS_NM).
# 검색은 "역"을 붙여야 정확히 매칭되지만, R-ONE 라벨은 일부만 "역"이 붙는다.
QUERY_TO_REB_ZONE: dict[str, str] = {
    "영등포역": "영등포역",
    "당산역": "당산역",
    "여의도역": "여의도",
    "목동역": "목동",
    "까치산역": "까치산역",
}

# 상권명이 원래 속한다고 보는 파일럿 시군구 (실제 주소와 다르면 in_pilot_sigungu=False 로 표시).
EXPECTED_SIGUNGU: dict[str, str] = {
    "영등포역": "11560", "당산역": "11560", "여의도": "11560",
    "목동": "11470", "까치산역": "11470",
}

_SIGUNGU_RE = re.compile(r"(\S+[구])\s")


def _latest_raw_file() -> Path:
    candidates = sorted(RAW_DIR.glob("reb_zone_geocode_*.json"))
    if not candidates:
        raise SystemExit(f"{RAW_DIR.relative_to(config.ROOT)} 에 원본이 없습니다. collect_kakao_geocode 먼저 실행하세요.")
    return candidates[-1]


def main() -> None:
    with _latest_raw_file().open(encoding="utf-8") as f:
        envelope = json.load(f)

    rows = []
    for q in envelope["queries"]:
        reb_zone = QUERY_TO_REB_ZONE.get(q["query"])
        if reb_zone is None:
            continue
        # category 만으로 거르면 인근의 다른 역(예: "여의나루역"이 "여의도역" 질의에 딸려옴)이
        # 섞여 대표 좌표가 틀어진다 — place_name 이 질의어로 시작하는 것만 같은 역으로 본다.
        subway = [
            d for d in q["documents"]
            if "지하철" in d["category_name"] and d["place_name"].startswith(q["query"])
        ]
        if not subway:
            print(f"  [경고] {q['query']}: 지하철역 후보 없음 — 건너뜀")
            continue

        lon = sum(float(d["x"]) for d in subway) / len(subway)
        lat = sum(float(d["y"]) for d in subway) / len(subway)
        addr = subway[0]["road_address_name"] or subway[0]["address_name"]
        m = _SIGUNGU_RE.search(addr)
        actual_sigungu_nm = m.group(1) if m else None
        expected_cd = EXPECTED_SIGUNGU.get(reb_zone)
        expected_nm = config.PILOT_SIGUNGU.get(expected_cd)
        in_pilot = actual_sigungu_nm == expected_nm

        rows.append(
            {
                "reb_zone_nm": reb_zone, "query": q["query"],
                "lon": round(lon, 7), "lat": round(lat, 7),
                "n_candidates": len(subway), "actual_sigungu_nm": actual_sigungu_nm,
                "expected_sigungu_nm": expected_nm, "in_pilot_sigungu": in_pilot,
            }
        )
        flag = "" if in_pilot else f"  [주의] 실제 행정구역={actual_sigungu_nm} (예상 {expected_nm} 과 다름)"
        print(f"  {reb_zone}: lon={lon:.6f} lat={lat:.6f} (후보 {len(subway)}개 평균){flag}")

    out = pd.DataFrame(rows)
    out_path = config.PROCESSED_DIR / "reb_zone_coords.parquet"
    out.to_parquet(out_path, index=False)
    print(f"저장: {out_path.relative_to(config.ROOT)} ({len(out)}개 상권)")


if __name__ == "__main__":
    main()
