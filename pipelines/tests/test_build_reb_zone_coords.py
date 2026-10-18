"""R-ONE 상권 대표 좌표 — 공식 역사 좌표에서 뽑고 카카오 지오코딩 결과를 쓰지 않는다."""
from __future__ import annotations

import pandas as pd
import pytest

from pipelines.common import config
from pipelines.transform import build_reb_zone_coords as b


def _official(*rows) -> pd.DataFrame:
    return pd.DataFrame([{"name": n, "lon": lo, "lat": la, "region": "서울", "coord_ok": True, "gu_code": g, "address": a} for n, lo, la, g, a in rows])


def test_zone_coordinates_are_the_mean_of_same_named_official_rows_and_the_actual_district_is_flagged():
    off = _official(("당산", 126.90, 37.53, "11560", "서울특별시 영등포구 1"), ("당산", 126.91, 37.54, "11560", "서울특별시 영등포구 2"),
                    ("까치산", 126.85, 37.53, None, "서울특별시 강서구 화곡로 1"), ("목동", 126.86, 37.52, "11470", "서울특별시 양천구 1"))
    out = b.build(off).set_index("reb_zone_nm")
    assert out.loc["당산역", "lon"] == pytest.approx(126.905) and out.loc["당산역", "n_candidates"] == 2 and out.loc["당산역", "in_pilot_sigungu"]
    assert out.loc["까치산역", "actual_sigungu_nm"] == "강서구" and not out.loc["까치산역", "in_pilot_sigungu"]       # 구 코드가 없으면 공식 주소 글자에서 읽는다
    assert (out["coordinate_source"] == "rail_official_stations").all() and "영등포역" not in out.index             # 공식 정보에 없는 역은 만들지 않는다


def test_real_reb_zone_coords_have_no_kakao_source():
    p = config.PROCESSED_DIR / "reb_zone_coords.parquet"
    if not p.exists():
        pytest.skip("reb_zone_coords.parquet 없음")
    d = pd.read_parquet(p)
    assert set(d["coordinate_source"]) == {"rail_official_stations"} and len(d) == 5
