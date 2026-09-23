"""백엔드 설정. 프로젝트 루트의 .env 에서 값을 읽는다."""
from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ROOT / ".env", env_file_encoding="utf-8", extra="ignore"
    )

    # 외부 API 키 (없으면 해당 기능은 비활성)
    data_go_kr_key: str = ""
    seoul_openapi_key: str = ""
    kakao_rest_api_key: str = ""
    kakao_js_app_key: str = ""
    naver_client_id: str = ""
    naver_client_secret: str = ""
    anthropic_api_key: str = ""
    neis_api_key: str = ""

    # Google Places API (New) Text Search — 매장↔Google 장소 연결에만 사용(서버 전용 키, 결과는 Place ID 만 저장)
    google_maps_server_key: str = ""
    # 무료 한도(Text Search Pro 월 5,000건) 안에 머물도록 일 150건 · 분당 20건으로 제한한다.
    google_textsearch_daily_cap: int = 150
    google_textsearch_per_minute: int = 20

    # DB 미설정 시 파일 기반(data/processed)으로 동작
    database_url: str = ""

    # 데이터 경로
    processed_dir: Path = ROOT / "data" / "processed"
    # 앱이 쓰는 캐시(Google Place ID 연결 결과). git 제외.
    cache_dir: Path = ROOT / "data" / "cache"

    # CORS 허용 오리진 (프론트 개발 서버)
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]


settings = Settings()
