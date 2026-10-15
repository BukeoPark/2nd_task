"""`.env`에서 시크릿을 읽는 공용 헬퍼. 값을 로그·예외 메시지에 그대로 찍지 않는다."""
from __future__ import annotations

import os

from dotenv import load_dotenv

from . import config

load_dotenv(config.ROOT / ".env")


def require_env(name: str) -> str:
    """환경변수를 읽는다. 없으면 어떤 키가 필요한지 알려주고 즉시 종료한다."""
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(
            f"환경변수 {name} 이(가) 비어 있습니다. "
            f"프로젝트 루트 .env 에 값을 채우세요 (.env.example 참고)."
        )
    return value


def redact(text: str, *secrets: str) -> str:
    """문장 속 비밀값(과 URL 인코딩된 형태)을 '***' 로 바꾼다. 오류 메시지·로그에 요청 URL(serviceKey 쿼리 포함)이 섞여 나가지 않게 한다."""
    from urllib.parse import quote

    for s in secrets:
        if s:
            for form in (s, quote(s, safe=""), quote(s)):
                text = text.replace(form, "***")
    return text
