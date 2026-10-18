"""앵커(다이소) 공식 교차 검증 — 인허가 영업만, 좌표 없으면 누락 기록, 상가정보와 같은 매장은 이중 집계하지 않고, 네이버 출처는 남지 않는다."""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from pipelines.common import config
from pipelines.transform import merge_official_anchors as m

LON0, LAT0 = 126.9, 37.52


def _lic(i, name, state="영업/정상", lon=LON0, lat=LAT0, gu="11560", addr="서울특별시 영등포구 어딘가 1") -> dict:
    return {"license_id": i, "name": name, "state_name": state, "lon": lon, "lat": lat, "sigungu_cd": gu, "road_addr": addr, "jibun_addr": None, "permit_date": "2020-01-01", "collected_at": "2026-09-23"}


def _existing(*pts) -> pd.DataFrame:
    return pd.DataFrame([{"bizesId": f"S{i}", "brand": "daiso", "bizesNm": "다이소X", "lon": x, "lat": y, "source": "sbiz_name_match"} for i, (x, y) in enumerate(pts)], columns=["bizesId", "brand", "bizesNm", "lon", "lat", "source"])


def _run(lic_rows, existing=None):
    return m.build_rows(pd.DataFrame(lic_rows), existing if existing is not None else _existing(), "daiso", lambda lon, lat: True)


def test_only_licensed_open_branded_stores_with_coordinates_are_adopted_and_every_exclusion_is_recorded():
    rows, audit, up = _run([_lic("a", "(주)아성다이소 가점"), _lic("b", "(주)아성다이소 나점", state="폐업", lon=LON0 + 0.01), _lic("c", "(주)아성다이소 다점", lon=np.nan, lat=np.nan),
                            _lic("d", "다른가게", lon=LON0 + 0.02), _lic("e", "(주)아성다이소 라점", lon=LON0 + 0.03, addr="서울특별시 강서구 어딘가")])
    assert list(rows["bizesId"]) == ["LD:a"] and rows["source"].eq(m.LICENSE_SOURCE).all() and rows["verification"].iloc[0] == "인허가만"
    reasons = dict(zip(audit["name"], audit["reason"]))
    assert "영업 아님" in reasons["(주)아성다이소 나점"] and "좌표 없음" in reasons["(주)아성다이소 다점"] and "수집 구" in reasons["(주)아성다이소 라점"]
    assert "다른가게" not in reasons                                                                    # 브랜드 패턴에 안 맞으면 대상 아님
    assert audit.loc[audit["decision"] == "채택", "state"].str.startswith("영업").all() and not up


def test_a_licensed_store_that_is_the_same_as_a_shop_listing_adds_no_second_row_only_evidence():
    ex = _existing((LON0, LAT0))
    ex.index = [7]                                                                                     # 원래 인덱스를 유지한 채 보강
    rows, audit, up = _run([_lic("a", "다이소 대신시장점", lon=LON0 + 0.0002)], ex)
    assert rows.empty and list(up) == [7] and up[7]["verification"] == "상가정보+인허가" and "이중 집계" not in audit["reason"].iloc[0]
    assert "새 행을 더하지 않고" in audit["reason"].iloc[0]


def test_duplicate_license_rows_of_one_store_count_once():
    rows, audit, _ = _run([_lic("a", "다이소 같은점"), _lic("b", "(주)아성다이소 같은점", lon=LON0 + 0.0002)])
    assert len(rows) == 1 and (audit["decision"] == "제외").sum() == 1 and "중복" in audit.loc[audit["decision"] == "제외", "reason"].iloc[0]


def test_collection_range_is_enforced():
    rows, audit, _ = m.build_rows(pd.DataFrame([_lic("a", "다이소 먼점")]), _existing(), "daiso", lambda lon, lat: False)
    assert rows.empty and "수집 범위 밖" in audit["reason"].iloc[0]


def test_naver_and_stale_license_rows_are_removed_before_rebuilding():
    assert set(m.REMOVED_SOURCES) == {"naver_local", m.LICENSE_SOURCE}


@pytest.fixture(scope="module")
def anchors() -> pd.DataFrame:
    p = config.PROCESSED_DIR / "anchor_stores.parquet"
    if not p.exists():
        pytest.skip("anchor_stores.parquet 없음")
    return pd.read_parquet(p)


def test_real_anchor_stores_have_no_naver_rows_and_every_daiso_row_names_its_evidence(anchors):
    assert "naver_local" not in set(anchors["source"])
    d = anchors[anchors["brand"] == "daiso"]
    assert set(d["source"]) <= {"sbiz_name_match", m.LICENSE_SOURCE} and d["verification"].isin(["상가정보만", "상가정보+인허가", "인허가만"]).all()
    lic = d[d["source"] == m.LICENSE_SOURCE]
    assert len(lic) >= 10 and lic["license_state"].str.startswith("영업").all() and lic["license_ref_date"].notna().all() and lic[["lon", "lat"]].notna().all().all()
    assert d["bizesId"].is_unique


def test_real_crosscheck_table_records_missing_coordinates_instead_of_restoring_them():
    t = pd.read_csv(config.TABLES_DIR / "anchor_official_crosscheck.csv")
    miss = t[t["reason"].str.contains("좌표 없음", na=False)]
    assert len(miss) >= 1 and (miss["decision"] == "제외").all() and miss["lon"].isna().all()
    assert set(t["decision"]) <= {"채택", "제외"}
