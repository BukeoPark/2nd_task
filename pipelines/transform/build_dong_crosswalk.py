"""regions.geojson(공식 경계, adm_cd 체계)과 다른 데이터셋(8자리 adongCd 체계)을
동 이름으로 이어주는 크로스워크를 만든다.

배경: 행정동 경계 GeoJSON(raqoon886/Local_HangJeongDong)의 코드 필드(`adm_cd`,
`adm_cd2`)는 소상공인시장진흥공단·서울시 상권분석서비스가 쓰는 8자리
행정동코드(`adongCd`, 예: "11470510")와 형식이 달라 코드로 직접 조인할 수 없다.
대신 두 소스 모두 "시군구명 + 행정동명" 텍스트는 정확히 일치해서(검증됨,
36/36 매칭) 이름으로 이어준다.

실행
----
프로젝트 루트에서: .venv/bin/python -m pipelines.transform.build_dong_crosswalk

입력: data/processed/regions.geojson, data/processed/stores.parquet
출력: data/processed/dong_crosswalk.parquet
      (region_id, adm_cd, adm_cd2, sgg, sggnm, dong_nm, adongCd)
"""
from __future__ import annotations

import json

import pandas as pd

from pipelines.common import config

REGIONS_PATH = config.PROCESSED_DIR / "regions.geojson"
STORES_PATH = config.PROCESSED_DIR / "stores.parquet"


def main() -> None:
    with REGIONS_PATH.open(encoding="utf-8") as f:
        regions = json.load(f)

    rows = []
    for ft in regions["features"]:
        p = ft["properties"]
        dong_nm = p["adm_nm"].replace(f"서울특별시 {p['sggnm']} ", "")
        rows.append(
            {
                "region_id": p["region_id"],
                "adm_cd": p.get("adm_cd"),
                "adm_cd2": p.get("adm_cd2"),
                "sgg": p["sgg"],
                "sggnm": p["sggnm"],
                "dong_nm": dong_nm,
            }
        )
    regions_df = pd.DataFrame(rows)

    stores = pd.read_parquet(STORES_PATH, columns=["signguNm", "adongNm", "adongCd"]).drop_duplicates()
    crosswalk = regions_df.merge(
        stores, left_on=["sggnm", "dong_nm"], right_on=["signguNm", "adongNm"], how="left"
    ).drop(columns=["signguNm", "adongNm"])

    unmatched = crosswalk["adongCd"].isna().sum()
    if unmatched:
        print(f"[경고] {unmatched}개 행정동이 adongCd 매칭 실패:")
        print(crosswalk.loc[crosswalk["adongCd"].isna(), ["sggnm", "dong_nm"]].to_string(index=False))
    else:
        print(f"전체 {len(crosswalk)}개 행정동 매칭 성공")

    out_path = config.PROCESSED_DIR / "dong_crosswalk.parquet"
    crosswalk.to_parquet(out_path, index=False)
    print(f"저장: {out_path.relative_to(config.ROOT)}")


if __name__ == "__main__":
    main()
