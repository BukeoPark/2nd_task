"""데이터 공급원 등록부 + 원천별 기준일을 backend 용 JSON 으로 내보낸다.

실행: .venv/bin/python -m pipelines.transform.export_source_registry
입력: pipelines/common/sources.py, data/raw/sbiz/*.json(기준월), data/processed/license_sources.parquet
출력: data/processed/data_sources.json  {key: {등록부 항목..., reference: {기준일 정보}}}
"""
from __future__ import annotations

import json
from dataclasses import asdict

import pandas as pd

from pipelines.common import config
from pipelines.common.sources import SOURCES


def _sbiz_reference() -> dict:
    envs = [json.loads(p.read_text(encoding="utf-8")) for p in (config.RAW_DIR / "sbiz").glob("sangga_*.json")]
    return {"stdrYm": max(e["stdrYm"] for e in envs), "collected_at": max(e["collected_at"][:10] for e in envs)} if envs else {}


def _upjong_reference() -> dict:
    paths = sorted((config.RAW_DIR / "sbiz").glob("upjong_small_*.json"))
    if not paths:
        return {}
    env = json.loads(paths[-1].read_text(encoding="utf-8"))
    return {"stdrDt": max(i["stdrDt"] for i in env["items"]), "collected_at": env["collected_at"][:10]}


def main() -> None:
    src = pd.read_parquet(config.PROCESSED_DIR / "license_sources.parquet")
    model = pd.read_parquet(config.PROCESSED_DIR / "model_restaurants.parquet")
    local = src[src["license_code"] != "NEIS"]
    neis = src[src["license_code"] == "NEIS"]
    refs = {
        "sbiz_store": _sbiz_reference(),
        "sbiz_upjong": _upjong_reference(),
        "seoul_localdata": {"collected_at": local["collected_at"].min(),
                            "source_updated_max": local["source_updated_max"].dropna().max()},
        "seoul_model_restaurant": {"collected_at": model["collected_at"].min()} if len(model) else {},
        "neis_academy": {"collected_at": neis["collected_at"].min()} if len(neis) else {},
    }
    out = {}
    for key, s in SOURCES.items():
        item = asdict(s)
        item["reference"] = refs.get(key, {})
        if key == "neis_academy" and len(neis):
            item["status"] = "connected"
        out[key] = item
    path = config.PROCESSED_DIR / "data_sources.json"
    path.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"저장: {path.relative_to(config.ROOT)} ({len(out)}개 원천)")
    for k, v in refs.items():
        print(f"  - {k}: {v}")


if __name__ == "__main__":
    main()
