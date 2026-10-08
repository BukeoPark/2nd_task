"""상가(상권)정보 스냅샷 누적 → 점포수 변동성(개별 매장 단위 신규·소멸).

실행: .venv/bin/python -m pipelines.transform.build_store_snapshots
입력: data/raw/sbiz/sangga_<시군구코드>_<시군구명>_<수집일>.json 전부 (파일 안의 stdrYm = API 기준연월)
출력: data/processed/store_snapshots.parquet      스냅샷(stdrYm) × 매장 1행 — 업종·행정동·상권 판정에 필요한 칸만
      data/processed/store_count_history.parquet  스냅샷 × 행정동 × 소분류 점포 수
      data/processed/store_count_changes.parquet  연속한 두 스냅샷 사이 행정동 × 소분류 신규·소멸·유지 매장 수
      outputs/tables/store_snapshots_log.csv      스냅샷별 시군구 파일·건수, 비교 가능 여부

규칙
  - 스냅샷 = 파일럿 시군구가 모두 있는 stdrYm. 같은 stdrYm·시군구 파일이 여럿이면 가장 늦게 수집한 것을 쓴다.
    시군구 일부만 있는 stdrYm 은 비교에서 빼고 로그에 남긴다.
  - 신규 = 이번 스냅샷에만 있는 bizesId, 소멸 = 이전 스냅샷에만 있는 bizesId, 유지 = 둘 다 있는 bizesId.
    소상공인 상가정보는 개업·폐업일을 주지 않으므로 '그 사이에 목록에 새로 생김/빠짐'이며, 업종 변경·재등록으로
    ID 가 바뀐 매장도 신규·소멸로 잡힐 수 있다(분기별 서울시 개폐업 수와 함께 해석).
  - 업종 변경(같은 bizesId 의 소분류가 바뀜)은 이전 업종에서 소멸, 새 업종에서 신규로 센다.
  - 스냅샷이 1개뿐이면 변화표는 빈 표(칸만 있음)로 쓰고, 분기마다 collect_sbiz_stores 를 돌려 쌓이면 자동으로 채워진다.
"""
from __future__ import annotations

import json
import re

import pandas as pd

from pipelines.common import config

RAW_SBIZ = config.RAW_DIR / "sbiz"
KEEP = ["bizesId", "indsLclsCd", "indsSclsCd", "signguCd", "adongCd", "lon", "lat"]
FILE_RE = re.compile(r"sangga_(\d{5})_.+_(\d{8})\.json$")


def _snapshot_files(log: list[dict]) -> dict[str, dict[str, object]]:
    """{stdrYm: {시군구코드: 파일경로}} — 같은 기준월·시군구는 가장 늦은 수집일."""
    found: dict[str, dict[str, tuple[str, object]]] = {}
    for p in sorted(RAW_SBIZ.glob("sangga_*.json")):
        m = FILE_RE.match(p.name)
        if not m:
            continue
        with p.open(encoding="utf-8") as f:
            ym = json.load(f).get("stdrYm") or f"collected_{m.group(2)}"
        prev = found.setdefault(ym, {}).get(m.group(1))
        if prev is None or m.group(2) > prev[0]:
            found[ym][m.group(1)] = (m.group(2), p)
    snaps = {}
    for ym in sorted(found):
        have = set(found[ym])
        complete = have >= set(config.PILOT_SIGUNGU)
        log.append({"stdrYm": ym, "item": "시군구 파일", "value": ",".join(sorted(have)), "used": complete})
        if complete:
            snaps[ym] = {sg: path for sg, (_, path) in found[ym].items() if sg in config.PILOT_SIGUNGU}
    return snaps


def _load_snapshot(ym: str, files: dict[str, object], log: list[dict]) -> pd.DataFrame:
    frames = []
    for sg, path in sorted(files.items()):
        with open(path, encoding="utf-8") as f:
            env = json.load(f)
        df = pd.DataFrame(env["items"])
        frames.append(df[KEEP])
        log.append({"stdrYm": ym, "item": f"{sg} 원본 행", "value": len(df), "used": True})
    out = pd.concat(frames, ignore_index=True)
    dup = out.duplicated("bizesId", keep="last")
    log.append({"stdrYm": ym, "item": "bizesId 중복 제거", "value": int(dup.sum()), "used": True})
    out = out.loc[~dup].assign(stdrYm=ym)
    out["lon"] = pd.to_numeric(out["lon"], errors="coerce").round(6)
    out["lat"] = pd.to_numeric(out["lat"], errors="coerce").round(6)
    return out


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
    log: list[dict] = []
    snaps = _snapshot_files(log)
    if not snaps:
        raise SystemExit("파일럿 시군구가 모두 있는 상가정보 스냅샷이 없습니다 — collect_sbiz_stores 를 먼저 실행하세요")
    frames = [_load_snapshot(ym, files, log) for ym, files in snaps.items()]
    snap = pd.concat(frames, ignore_index=True).sort_values(["stdrYm", "bizesId"]).reset_index(drop=True)
    snap.to_parquet(config.PROCESSED_DIR / "store_snapshots.parquet", index=False)

    hist = (snap.groupby(["stdrYm", "adongCd", "indsSclsCd"]).size().rename("stores").reset_index()
            .sort_values(["stdrYm", "adongCd", "indsSclsCd"]))
    hist.to_parquet(config.PROCESSED_DIR / "store_count_history.parquet", index=False)

    yms = sorted(snaps)
    diffs = []
    for a, b in zip(yms, yms[1:]):
        d = changes(snap.loc[snap["stdrYm"] == a], snap.loc[snap["stdrYm"] == b]).assign(from_ym=a, to_ym=b)
        diffs.append(d)
        log.append({"stdrYm": b, "item": f"{a}→{b} 신규/소멸", "value": f"{int(d['opened'].sum())}/{int(d['closed'].sum())}", "used": True})
    cols = ["from_ym", "to_ym", "adongCd", "indsSclsCd", "opened", "closed", "kept", "prev_count", "cur_count"]
    chg = pd.concat(diffs, ignore_index=True)[cols] if diffs else pd.DataFrame({c: pd.Series(dtype="object" if c in cols[:4] else "int64") for c in cols})
    chg.sort_values(cols[:4]).to_parquet(config.PROCESSED_DIR / "store_count_changes.parquet", index=False)

    pd.DataFrame(log).to_csv(config.TABLES_DIR / "store_snapshots_log.csv", index=False)
    print(f"[done] 스냅샷 {len(yms)}개({', '.join(yms)}) · 매장 행 {len(snap):,} · 점포수 이력 {len(hist):,}행 · 변화 {len(chg):,}행")
    if len(yms) < 2:
        print("  스냅샷이 1개라 점포수 변동(신규·소멸)은 아직 계산할 수 없습니다 — 다음 분기 수집 후 자동으로 채워집니다.")
    for r in log:
        print(f"  {r['stdrYm']}: {r['item']} {r['value']}{'' if r['used'] else ' (시군구 누락 — 비교 제외)'}")


if __name__ == "__main__":
    main()
