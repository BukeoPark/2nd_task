"""상가정보 스냅샷 누적 — 합성 원본으로 스냅샷 구분·재수집 처리·신규/소멸 계산을 확인한다."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pandas as pd

from pipelines.transform.build_store_snapshots import changes, snapshot_files

PILOT = {"11470", "11560"}


def _write(raw: Path, sg: str, date: str, ym: str | None, ids: list[str] = ("A",)) -> Path:
    env = {"source": "sbiz", "sigungu_cd": sg, "sigungu_nm": "테스트구"}
    if ym:
        env["stdrYm"] = ym
    env["items"] = [{"bizesId": i} for i in ids]
    p = raw / f"sangga_{sg}_테스트구_{date}.json"
    p.write_text(json.dumps(env, ensure_ascii=False), encoding="utf-8")
    return p


def _names(raw: Path, gap: int = 30) -> tuple[dict, list[dict]]:
    log: list[dict] = []
    return snapshot_files(raw, PILOT, gap, log), log


def test_new_reference_month_makes_a_new_snapshot(tmp_path):
    for sg in PILOT:
        _write(tmp_path, sg, "20260913", "202606")
        _write(tmp_path, sg, "20261215", "202609")
    snaps, _ = _names(tmp_path)
    assert list(snaps) == ["202606", "202609"]
    assert snaps["202609"]["collected_at"] == "20261215"


def test_same_reference_month_recollected_soon_replaces_the_earlier_file(tmp_path):
    first = _write(tmp_path, "11470", "20260913", "202606")
    later = _write(tmp_path, "11470", "20260920", "202606")  # 7일 뒤 재실행 — 대체
    _write(tmp_path, "11560", "20260913", "202606")
    snaps, log = _names(tmp_path)
    assert list(snaps) == ["202606"] and snaps["202606"]["files"]["11470"] == later != first
    assert any("나중 파일로 대체" in r["item"] for r in log)


def test_same_reference_month_recollected_much_later_is_a_separate_snapshot(tmp_path):
    """API 기준월이 갱신되지 않아도 시간이 지난 재수집은 덮어쓰지 않고 별도 스냅샷으로 쌓는다."""
    for sg in PILOT:
        _write(tmp_path, sg, "20260913", "202606", ["A", "B"])
        _write(tmp_path, sg, "20261120", "202606", ["A", "C"])
    snaps, log = _names(tmp_path)
    assert list(snaps) == ["202606", "202606#2"]
    assert any("별도 스냅샷" in r["item"] for r in log)


def test_snapshot_missing_a_pilot_district_is_left_out_and_logged(tmp_path):
    for sg in PILOT:
        _write(tmp_path, sg, "20260913", "202606")
    _write(tmp_path, "11470", "20261215", "202609")  # 영등포구(11560) 파일 없음
    snaps, log = _names(tmp_path)
    assert list(snaps) == ["202606"]
    assert any(r["snapshot"] == "202609" and r["used"] is False for r in log)


def test_missing_reference_month_still_groups_as_unknown(tmp_path):
    for sg in PILOT:
        _write(tmp_path, sg, "20260913", None)
    snaps, _ = _names(tmp_path)
    assert list(snaps) == ["unknown"]


def _snap(rows: list[tuple[str, str, str]]) -> pd.DataFrame:
    return pd.DataFrame(rows, columns=["bizesId", "indsSclsCd", "adongCd"])


def test_changes_counts_opened_closed_kept_and_industry_switch():
    prev = _snap([("1", "I21201", "D1"), ("2", "I21201", "D1"), ("3", "I21201", "D1")])
    cur = _snap([("2", "I21201", "D1"), ("3", "I20101", "D1"), ("4", "I21201", "D1"), ("5", "I21201", "D2")])
    out = changes(prev, cur).set_index(["adongCd", "indsSclsCd"])
    assert out.loc[("D1", "I21201"), ["opened", "closed", "kept", "prev_count", "cur_count"]].tolist() == [1, 2, 1, 3, 2]
    # 3번 매장은 업종이 바뀌어 이전 업종에서 소멸, 새 업종에서 신규로 센다
    assert out.loc[("D1", "I20101"), ["opened", "closed", "kept"]].tolist() == [1, 0, 0]
    assert out.loc[("D2", "I21201"), ["opened", "closed", "kept"]].tolist() == [1, 0, 0]
    assert out["opened"].sum() == 3 and out["closed"].sum() == 2 and out["kept"].sum() == 1


def test_help_describes_the_script_instead_of_running_it():
    root = Path(__file__).resolve().parents[2]
    proc = subprocess.run([sys.executable, "-m", "pipelines.transform.build_store_snapshots", "--help"], cwd=root,
                          capture_output=True, text=True, timeout=60)
    assert proc.returncode == 0 and "--min-gap-days" in proc.stdout and "[done]" not in proc.stdout
