"""소상공인시장진흥공단 상권정보 업종 대·중·소분류 코드표 수집.

실행: .venv/bin/python -m pipelines.collect.collect_sbiz_upjong
출력: data/raw/sbiz/upjong_{large,middle,small}_<YYYYMMDD>.json (원본 그대로 + 메타)
"""
from __future__ import annotations

import json
from datetime import date, datetime, timezone

import httpx

from pipelines.common import config
from pipelines.common.env import require_env

BASE = "https://apis.data.go.kr/B553077/api/open/sdsc2"
LEVELS = {"large": "largeUpjongList", "middle": "middleUpjongList", "small": "smallUpjongList"}
OUT_DIR = config.RAW_DIR / "sbiz"


def main() -> None:
    key = require_env("DATA_GO_KR_KEY")
    today = date.today().strftime("%Y%m%d")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with httpx.Client(timeout=30) as client:
        for level, ep in LEVELS.items():
            resp = client.get(f"{BASE}/{ep}", params={"serviceKey": key, "type": "json"})
            resp.raise_for_status()
            payload = resp.json()
            if payload["header"]["resultCode"] != "00":
                raise RuntimeError(f"{ep} 오류: {payload['header']}")
            items = payload["body"]["items"]
            out = OUT_DIR / f"upjong_{level}_{today}.json"
            with out.open("w", encoding="utf-8") as f:
                json.dump({"source": "sbiz_upjong", "endpoint": f"{BASE}/{ep}",
                           "collected_at": datetime.now(timezone.utc).isoformat(),
                           "item_count": len(items), "items": items}, f, ensure_ascii=False)
            print(f"저장: {out.relative_to(config.ROOT)} ({len(items)}건)")


if __name__ == "__main__":
    main()
