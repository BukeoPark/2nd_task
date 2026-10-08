"""분기 갱신 — 수집 → 변환 → 검증을 정해진 순서로 한 번에 돌린다.

실행 (프로젝트 루트):
    .venv/bin/python -m pipelines.run_quarterly --quarter 20263            # 수집·변환·검증 전부
    .venv/bin/python -m pipelines.run_quarterly --quarter 20263 --dry-run  # 순서만 출력
    .venv/bin/python -m pipelines.run_quarterly --skip-collect             # 이미 받은 원천으로 변환·검증만
    .venv/bin/python -m pipelines.run_quarterly --quarter 20263 --with-annual  # 공정위(연 1회)도 수집
    .venv/bin/python -m pipelines.run_quarterly --quarter 20263 --from build_sales_timeseries  # 중간부터 재시작

--quarter 는 서울시 상권분석서비스가 새로 공개한 분기(YYYYQ). 수집할 때만 필요하다.
단계 하나라도 실패하면 거기서 멈추고(뒤 단계가 낡은 입력으로 돌지 않도록), --from 으로 그 단계부터 다시 돌린다.
수집기는 같은 날짜 파일이 있으면 건너뛰므로 같은 날 다시 돌려도 API 를 중복 호출하지 않는다.
키가 없는 선택 원천(NEIS)과 원본이 없는 보강(네이버 앵커)은 건너뛰고 그 사실을 기록한다.

출력: 각 단계의 산출물(각 모듈 docstring 참고) + outputs/tables/run_quarterly_<YYYYMMDD>.csv (단계별 결과·소요 시간)

순서가 중요한 곳
  - clean_stores 가 stores.parquet·anchor_stores.parquet 를 새로 쓰므로, 매장에 기대는 변환(격자·상권 배정·인허가 연결·
    프랜차이즈 연결)은 모두 그 뒤에 돈다. 네이버 앵커 보강도 clean_stores 가 덮어쓴 뒤 다시 합친다.
  - 상권 단위 매출(build_sales_timeseries --level trdar)·수요 기반(build_hinterland)은 build_trdar_areas 뒤.
  - build_sales_crosswalk 는 행정동 매출 시계열 뒤, build_dong_metrics 는 둘 다 뒤.
  - 행정동 경계·격자(build_regions)·R-ONE 좌표(카카오)는 분기마다 바뀌지 않는 정적 자료라 여기서 돌리지 않는다.
"""
from __future__ import annotations

import argparse
import csv
import os
import subprocess
import sys
import time
from dataclasses import dataclass, field
from datetime import date

import pipelines.common.env  # noqa: F401 — import 시 .env 를 읽어 선택 원천의 키 유무를 판단한다
from pipelines.common import config


@dataclass(frozen=True)
class Step:
    name: str
    module: str
    args: tuple[str, ...] = ()
    collect: bool = False                  # 수집 단계(--skip-collect 로 건너뜀)
    needs_quarter: bool = False            # --quarter 를 인자로 넘김
    annual: bool = False                   # --with-annual 일 때만
    env: tuple[str, ...] = field(default=())  # 이 키가 하나라도 없으면 건너뜀(선택 원천)
    raw_glob: str | None = None            # 이 원본이 하나도 없으면 건너뜀(선택 보강)
    cwd: str = "."                         # 프로젝트 루트 기준 실행 위치


SEOUL_QUARTER_DATASETS = ("sales", "stores", "floating_pop", "workplace_pop", "change_index", "resident_pop",
                          "trdar_sales", "trdar_stores", "trdar_flpop")
SEOUL_ALL_QUARTER_DATASETS = ("trdar_workplace", "trdar_resident", "trdar_facility", "dong_facility")

STEPS: list[Step] = [
    # ── 수집 ───────────────────────────────────────────────
    Step("collect_sbiz_upjong", "pipelines.collect.collect_sbiz_upjong", collect=True),
    Step("collect_sbiz_stores", "pipelines.collect.collect_sbiz_stores", collect=True),  # 상가정보 스냅샷(점포수 변동성 원천)
    Step("collect_seoul_localdata", "pipelines.collect.collect_seoul_localdata", collect=True),
    Step("collect_neis_academy", "pipelines.collect.collect_neis_academy", collect=True, env=("NEIS_API_KEY",)),
    Step("collect_seoul_trdar", "pipelines.collect.collect_seoul_trdar", ("--datasets", *SEOUL_QUARTER_DATASETS),
         collect=True, needs_quarter=True),
    Step("collect_seoul_trdar_all_quarters", "pipelines.collect.collect_seoul_trdar", ("--datasets", *SEOUL_ALL_QUARTER_DATASETS),
         collect=True),
    Step("collect_reb_rone", "pipelines.collect.collect_reb_rone", collect=True),
    Step("collect_ftc_franchise", "pipelines.collect.collect_ftc_franchise", collect=True, annual=True),
    # ── 매장·업종 ──────────────────────────────────────────
    Step("clean_stores", "pipelines.transform.clean_stores"),
    Step("build_store_snapshots", "pipelines.transform.build_store_snapshots"),
    Step("merge_naver_anchors", "pipelines.transform.merge_naver_anchors", raw_glob="naver_local/*.json"),
    Step("compute_store_density", "pipelines.transform.compute_store_density"),
    Step("compute_anchor_features", "pipelines.transform.compute_anchor_features"),
    Step("build_dong_crosswalk", "pipelines.transform.build_dong_crosswalk"),
    Step("build_trdar_areas", "pipelines.transform.build_trdar_areas"),
    Step("build_licenses", "pipelines.transform.build_licenses"),
    Step("build_industry_crosswalk", "pipelines.transform.build_industry_crosswalk"),
    Step("link_store_licenses", "pipelines.transform.link_store_licenses"),
    # ── 서울시 상권분석서비스 ───────────────────────────────
    Step("filter_seoul_trdar", "pipelines.transform.filter_seoul_trdar"),
    Step("build_sales_timeseries", "pipelines.transform.build_sales_timeseries", ("--level", "dong")),
    Step("build_sales_timeseries_trdar", "pipelines.transform.build_sales_timeseries", ("--level", "trdar")),
    Step("build_sales_crosswalk", "pipelines.transform.build_sales_crosswalk"),
    Step("build_dong_metrics", "pipelines.transform.build_dong_metrics"),
    Step("build_hinterland", "pipelines.transform.build_hinterland"),
    # ── 프랜차이즈·임대 ────────────────────────────────────
    Step("build_franchise", "pipelines.transform.build_franchise"),
    Step("build_reb_zone_metrics", "pipelines.transform.build_reb_zone_metrics"),
    # ── 마무리 ─────────────────────────────────────────────
    Step("export_source_registry", "pipelines.transform.export_source_registry"),
    Step("backend_tests", "pytest", ("-q",), cwd="backend"),
]


def _skip_reason(step: Step, args: argparse.Namespace) -> str | None:
    if step.collect and args.skip_collect:
        return "--skip-collect"
    if step.annual and not args.with_annual:
        return "연 1회 원천(--with-annual 일 때만)"
    if step.name == "backend_tests" and args.no_check:
        return "--no-check"
    if missing := [k for k in step.env if not os.environ.get(k, "").strip()]:
        return f"키 없음({', '.join(missing)}) — 선택 원천"
    if step.raw_glob and not any(config.RAW_DIR.glob(step.raw_glob)):
        return f"원본 없음(data/raw/{step.raw_glob})"
    return None


def _command(step: Step, args: argparse.Namespace) -> list[str]:
    cmd = [sys.executable, "-m", step.module, *step.args]
    if step.needs_quarter:
        cmd += ["--quarter", args.quarter]
    return cmd


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--quarter", help="서울시 상권분석서비스 기준 분기 YYYYQ (수집 시 필수, 예: 20263)")
    ap.add_argument("--skip-collect", action="store_true", help="수집 단계를 건너뛰고 이미 받은 원천으로 변환만")
    ap.add_argument("--with-annual", action="store_true", help="연 1회 원천(공정위 가맹정보)도 수집")
    ap.add_argument("--no-check", action="store_true", help="마지막 backend 테스트를 건너뜀")
    ap.add_argument("--from", dest="start", choices=[s.name for s in STEPS], help="이 단계부터 시작(실패 후 재시작용)")
    ap.add_argument("--dry-run", action="store_true", help="실행하지 않고 순서와 건너뛸 단계만 출력")
    args = ap.parse_args()

    if not args.skip_collect and not args.quarter:
        ap.error("수집하려면 --quarter 가 필요합니다(이미 받은 원천으로 변환만 하려면 --skip-collect)")
    if args.quarter and not (len(args.quarter) == 5 and args.quarter[:4].isdigit() and args.quarter[4] in "1234"):
        ap.error(f"--quarter 형식은 YYYYQ 입니다(예: 20263): {args.quarter}")

    steps = STEPS[[s.name for s in STEPS].index(args.start):] if args.start else STEPS
    results: list[dict] = []
    for i, step in enumerate(steps, 1):
        reason = _skip_reason(step, args)
        cmd = _command(step, args)
        label = f"[{i:>2}/{len(steps)}] {step.name}"
        if reason:
            print(f"{label} — 건너뜀: {reason}")
            results.append({"step": step.name, "status": "skipped", "note": reason, "seconds": 0})
            continue
        print(f"{label} — {' '.join(cmd[1:])}")
        if args.dry_run:
            results.append({"step": step.name, "status": "planned", "note": "", "seconds": 0})
            continue
        t0 = time.monotonic()
        proc = subprocess.run(cmd, cwd=config.ROOT / step.cwd)
        secs = round(time.monotonic() - t0, 1)
        if proc.returncode != 0:
            results.append({"step": step.name, "status": "failed", "note": f"exit {proc.returncode}", "seconds": secs})
            _write(results, args)
            raise SystemExit(f"\n{step.name} 실패(exit {proc.returncode}). 원인을 고친 뒤 이어서 실행하세요:\n"
                             f"  .venv/bin/python -m pipelines.run_quarterly --from {step.name}"
                             + (f" --quarter {args.quarter}" if args.quarter else " --skip-collect"))
        results.append({"step": step.name, "status": "ok", "note": "", "seconds": secs})

    _write(results, args)
    done = sum(r["status"] == "ok" for r in results)
    skipped = sum(r["status"] == "skipped" for r in results)
    print(f"\n완료: 실행 {done} · 건너뜀 {skipped}" + (" (dry-run)" if args.dry_run else "")
          + " — 백엔드는 산출물을 시작 시 읽으므로 서버를 다시 띄우세요.")


def _write(results: list[dict], args: argparse.Namespace) -> None:
    if args.dry_run:
        return
    path = config.TABLES_DIR / f"run_quarterly_{date.today():%Y%m%d}.csv"
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["step", "status", "note", "seconds"])
        w.writeheader()
        w.writerows(results)
    print(f"[log] {path.relative_to(config.ROOT)}")


if __name__ == "__main__":
    main()
