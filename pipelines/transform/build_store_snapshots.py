"""상가(상권)정보 스냅샷 누적 → 점포수 변동성(개별 매장 단위 신규·소멸).

실행: .venv/bin/python -m pipelines.transform.build_store_snapshots [--min-gap-days 30]
입력: data/raw/sbiz/sangga_<시군구코드>_<시군구명>_<수집일>.json 전부 (파일 안의 stdrYm = API 기준연월)
출력: data/processed/store_snapshots.parquet      스냅샷 × 매장 1행 — 업종·행정동·상권 판정에 필요한 칸만
      data/processed/store_count_history.parquet  스냅샷 × 행정동 × 소분류 점포 수
      data/processed/store_count_changes.parquet  연속한 두 스냅샷 사이 행정동 × 소분류 신규·소멸·유지 매장 수
      outputs/tables/store_snapshots_log.csv      스냅샷별 시군구 파일·건수, 같은 기준월 재수집 처리, 비교 가능 여부

스냅샷 규칙
  - 스냅샷 = 파일럿 시군구가 모두 있는 (기준월 stdrYm, 수집 차수). 이름(snapshot)은 기준월이고,
    같은 기준월을 MIN_GAP_DAYS(기본 30일) 이상 간격으로 다시 받았으면 '기준월#2' 처럼 별도 스냅샷으로 센다.
    (API 의 기준월이 갱신되지 않아도 시간이 지나 매장 목록이 바뀐 것을 비교할 수 있게 하기 위함 — 로그에 남긴다.)
  - 같은 기준월을 MIN_GAP_DAYS 안에 다시 받은 것(실패 후 재실행 등)은 나중 파일로 대체한다.
  - 시군구 일부만 있는 스냅샷은 비교에서 빼고 로그에 남긴다.
변화 계산
  - 신규 = 이번 스냅샷에만 있는 bizesId, 소멸 = 이전 스냅샷에만 있는 bizesId, 유지 = 둘 다 있는 bizesId.
    소상공인 상가정보는 개업·폐업일을 주지 않으므로 '그 사이에 목록에 새로 생김/빠짐'이며, 업종 변경·재등록으로
    ID 가 바뀐 매장도 신규·소멸로 잡힐 수 있다(분기별 서울시 개폐업 수와 함께 해석).
  - 업종 변경(같은 bizesId 의 소분류가 바뀜)은 이전 업종에서 소멸, 새 업종에서 신규로 센다.
  - 스냅샷이 1개뿐이면 변화표는 빈 표(칸만 있음)로 쓰고, 분기마다 collect_sbiz_stores 를 돌려 쌓이면 자동으로 채워진다.
"""
from __future__ import annotations

import argparse
import json
import re
from datetime import datetime
from pathlib import Path

import pandas as pd

from pipelines.common import config

RAW_SBIZ = config.RAW_DIR / "sbiz"
KEEP = ["bizesId", "indsLclsCd", "indsSclsCd", "signguCd", "adongCd", "lon", "lat"]
FILE_RE = re.compile(r"sangga_(\d{5})_.+_(\d{8})\.json$")
YM_RE = re.compile(r'"stdrYm"\s*:\s*"(\d{6})"')
HEADER_BYTES = 4096  # collect_sbiz_stores 의 봉투는 stdrYm 이 items 보다 앞에 있어 머리말만 읽어도 된다
DEFAULT_MIN_GAP_DAYS = 30


def _stdr_ym(path: Path) -> str:
    """파일의 기준월. 머리말에서 찾고, 없으면 전체를 읽는다(그래도 없으면 'unknown')."""
    with path.open("rb") as f:
        head = f.read(HEADER_BYTES).decode("utf-8", errors="ignore")
    if m := YM_RE.search(head):
        return m.group(1)
    with path.open(encoding="utf-8") as f:
        return str(json.load(f).get("stdrYm") or "unknown")


def snapshot_files(raw_dir: Path, pilot: set[str], min_gap_days: int, log: list[dict]) -> dict[str, dict]:
    """{스냅샷 이름: {"collected_at": 수집일, "files": {시군구코드: 경로}}} — 시간순, 파일럿 시군구가 다 있는 것만."""
    per_sg: dict[str, list[tuple[datetime, str, Path]]] = {}
    for p in sorted(raw_dir.glob("sangga_*.json")):
        if m := FILE_RE.match(p.name):
            per_sg.setdefault(m.group(1), []).append((datetime.strptime(m.group(2), "%Y%m%d"), _stdr_ym(p), p))

    # 시군구별로 같은 기준월 재수집을 정리 → (기준월, 차수) 부여
    labeled: dict[str, dict[str, tuple[datetime, Path]]] = {}
    for sg, items in per_sg.items():
        kept: list[tuple[datetime, str, Path]] = []
        for d, ym, p in sorted(items, key=lambda x: (x[0], x[2].name)):
            prev = next((k for k in reversed(kept) if k[1] == ym), None)
            if prev is not None and (d - prev[0]).days < min_gap_days:
                log.append({"snapshot": ym, "item": f"{sg} 같은 기준월 재수집({(d - prev[0]).days}일 간격) → 나중 파일로 대체",
                            "value": p.name, "used": True})
                kept[kept.index(prev)] = (d, ym, p)
            else:
                kept.append((d, ym, p))
        seen: dict[str, int] = {}
        for d, ym, p in kept:
            n = seen[ym] = seen.get(ym, -1) + 1
            name = ym if n == 0 else f"{ym}#{n + 1}"
            if n > 0:
                log.append({"snapshot": name, "item": f"{sg} 기준월 {ym} 이 갱신되지 않은 채 {min_gap_days}일 이상 뒤 재수집 → 별도 스냅샷",
                            "value": p.name, "used": True})
            labeled.setdefault(name, {})[sg] = (d, p)

    snaps: dict[str, dict] = {}
    for name in sorted(labeled, key=lambda s: (s.split("#")[0], int(s.split("#")[1]) if "#" in s else 1)):
        have = labeled[name]
        complete = set(have) >= pilot
        log.append({"snapshot": name, "item": "시군구 파일", "value": ",".join(sorted(have)), "used": complete})
        if complete:
            snaps[name] = {"collected_at": max(d for d, _ in have.values()).strftime("%Y%m%d"),
                           "files": {sg: p for sg, (_, p) in have.items() if sg in pilot}}
    return snaps


def _load_snapshot(name: str, snap: dict, log: list[dict]) -> pd.DataFrame:
    frames = []
    for sg, path in sorted(snap["files"].items()):
        with open(path, encoding="utf-8") as f:
            env = json.load(f)
        df = pd.DataFrame(env["items"])
        frames.append(df[KEEP])
        log.append({"snapshot": name, "item": f"{sg} 원본 행", "value": len(df), "used": True})
    out = pd.concat(frames, ignore_index=True)
    dup = out.duplicated("bizesId", keep="last")
    log.append({"snapshot": name, "item": "bizesId 중복 제거", "value": int(dup.sum()), "used": True})
    out = out.loc[~dup]
    out["lon"] = pd.to_numeric(out["lon"], errors="coerce").round(6)
    out["lat"] = pd.to_numeric(out["lat"], errors="coerce").round(6)
    ym = name.split("#")[0]
    return out.assign(snapshot=name, stdrYm=ym, collected_at=snap["collected_at"])


def changes(prev: pd.DataFrame, cur: pd.DataFrame) -> pd.DataFrame:
    """두 스냅샷 사이 행정동 × 소분류 신규·소멸·유지. (bizesId, 소분류) 를 매장 단위로 본다."""
    key = ["bizesId", "indsSclsCd"]
    m = prev[key + ["adongCd"]].merge(cur[key + ["adongCd"]], on=key, how="outer", suffixes=("_prev", "_cur"), indicator=True)
    m["adongCd"] = m["adongCd_cur"].fillna(m["adongCd_prev"])
    m["kind"] = m["_merge"].map({"left_only": "closed", "right_only": "opened", "both": "kept"})
    out = m.pivot_table(index=["adongCd", "indsSclsCd"], columns="kind", values="bizesId", aggfunc="count", fill_value=0)
    out = out.reindex(columns=["opened", "closed", "kept"], fill_value=0).reset_index()
    out.columns.name = None
    out["prev_count"] = out["closed"] + out["kept"]
    out["cur_count"] = out["opened"] + out["kept"]
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--min-gap-days", type=int, default=DEFAULT_MIN_GAP_DAYS,
                    help=f"같은 기준월을 이 일수 이상 뒤에 다시 받았으면 별도 스냅샷으로 센다(기본 {DEFAULT_MIN_GAP_DAYS})")
    args = ap.parse_args()

    log: list[dict] = []
    snaps = snapshot_files(RAW_SBIZ, set(config.PILOT_SIGUNGU), args.min_gap_days, log)
    if not snaps:
        raise SystemExit("파일럿 시군구가 모두 있는 상가정보 스냅샷이 없습니다 — collect_sbiz_stores 를 먼저 실행하세요")
    frames = [_load_snapshot(name, snap, log) for name, snap in snaps.items()]
    order = {name: i for i, name in enumerate(snaps)}
    snap = (pd.concat(frames, ignore_index=True).assign(_o=lambda d: d["snapshot"].map(order))
            .sort_values(["_o", "bizesId"]).drop(columns="_o").reset_index(drop=True))
    snap.to_parquet(config.PROCESSED_DIR / "store_snapshots.parquet", index=False)

    meta = ["snapshot", "stdrYm", "collected_at"]
    hist = snap.groupby(meta + ["adongCd", "indsSclsCd"]).size().rename("stores").reset_index()
    hist = (hist.assign(_o=hist["snapshot"].map(order)).sort_values(["_o", "adongCd", "indsSclsCd"]).drop(columns="_o"))
    hist.to_parquet(config.PROCESSED_DIR / "store_count_history.parquet", index=False)

    names = list(snaps)
    diffs = []
    for a, b in zip(names, names[1:]):
        d = changes(snap.loc[snap["snapshot"] == a], snap.loc[snap["snapshot"] == b]).assign(
            from_snapshot=a, to_snapshot=b, from_collected=snaps[a]["collected_at"], to_collected=snaps[b]["collected_at"])
        diffs.append(d)
        log.append({"snapshot": b, "item": f"{a}→{b} 신규/소멸", "value": f"{int(d['opened'].sum())}/{int(d['closed'].sum())}", "used": True})
    cols = ["from_snapshot", "to_snapshot", "from_collected", "to_collected", "adongCd", "indsSclsCd",
            "opened", "closed", "kept", "prev_count", "cur_count"]
    if diffs:
        chg = pd.concat(diffs, ignore_index=True)[cols]
    else:
        chg = pd.DataFrame({c: pd.Series(dtype="object" if i < 6 else "int64") for i, c in enumerate(cols)})
    chg.sort_values(cols[:6]).to_parquet(config.PROCESSED_DIR / "store_count_changes.parquet", index=False)

    pd.DataFrame(log).to_csv(config.TABLES_DIR / "store_snapshots_log.csv", index=False)
    print(f"[done] 스냅샷 {len(names)}개({', '.join(names)}) · 매장 행 {len(snap):,} · 점포수 이력 {len(hist):,}행 · 변화 {len(chg):,}행")
    if len(names) < 2:
        print("  스냅샷이 1개라 점포수 변동(신규·소멸)은 아직 계산할 수 없습니다 — 다음 분기 수집 후 자동으로 채워집니다.")
    for r in log:
        print(f"  {r['snapshot']}: {r['item']} {r['value']}{'' if r['used'] else ' (시군구 누락 — 비교 제외)'}")


if __name__ == "__main__":
    main()
