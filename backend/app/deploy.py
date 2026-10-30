"""정식 서버 시작: 검증된 가공 데이터만 복원한 뒤 단일 worker로 실행."""
from __future__ import annotations
import hashlib
import logging
import re
import shutil
import stat
import tempfile
import zipfile
from pathlib import Path
from urllib.parse import urlparse
import httpx
from app.config import settings

log = logging.getLogger("uvicorn.error")
LOCAL_HOSTS = {"localhost", "127.0.0.1", "[::1]"}


def cors_warning(origins: list[str]) -> str | None:
    """허용 오리진이 모두 로컬뿐이면 안내 문구를 돌려준다 — 다른 주소(Cloudflare Pages 등)의 화면이 이 API 를 부르면 브라우저가 막는다."""
    if any(urlparse(o).hostname not in LOCAL_HOSTS for o in origins):
        return None
    return "CORS_ORIGINS 가 로컬 주소뿐입니다. 다른 주소(예: Cloudflare Pages)의 화면이 이 서버 API 를 부르려면 CORS_ORIGINS 에 그 주소를 JSON 목록으로 추가하세요."


def unpack_bundle(archive: Path, destination: Path, expected_sha: str) -> None:
    if not re.fullmatch(r"[0-9a-fA-F]{64}", expected_sha):
        raise ValueError("DATA_BUNDLE_SHA256에 올바른 SHA-256을 설정하세요.")
    with archive.open("rb") as stream:
        actual = hashlib.file_digest(stream, "sha256").hexdigest()
    if actual != expected_sha.lower():
        raise ValueError("분석 데이터 검증에 실패했습니다(SHA-256 불일치).")
    with zipfile.ZipFile(archive) as bundle:
        files = bundle.infolist()
        if not files or sum(f.file_size for f in files) > 250 * 1024 * 1024:
            raise ValueError("분석 데이터 묶음의 크기가 잘못되었습니다.")
        for item in files:
            path = Path(item.filename)
            if (path.name != item.filename or item.is_dir() or path.suffix not in {".parquet", ".json", ".geojson"}
                    or stat.S_ISLNK(item.external_attr >> 16)):
                raise ValueError("분석 데이터 묶음에 허용되지 않은 파일이 있습니다.")
        if "regions.geojson" not in bundle.namelist() or "stores.parquet" not in bundle.namelist():
            raise ValueError("필수 분석 데이터가 누락되었습니다.")
        destination.mkdir(parents=True, exist_ok=True)
        for item in files:
            with bundle.open(item) as src, (destination / item.filename).open("wb") as target:
                shutil.copyfileobj(src, target)


def prepare_data() -> None:
    if settings.data_bundle_path is not None:
        unpack_bundle(settings.data_bundle_path, settings.processed_dir, settings.data_bundle_sha256)
        return
    url = settings.data_bundle_url
    if not url or urlparse(url).scheme != "https":
        raise ValueError("DATA_BUNDLE_URL에 비공개 분석 묶음의 HTTPS 다운로드 주소를 설정하세요.")
    with tempfile.TemporaryDirectory() as folder:
        archive = Path(folder) / "analysis.zip"
        # 주소에는 서명·토큰이 포함될 수 있으므로 예외·로그에 원문을 남기지 않는다.
        try:
            with httpx.stream("GET", url, follow_redirects=True, timeout=120) as response:
                response.raise_for_status()
                total = 0
                with archive.open("wb") as stream:
                    for chunk in response.iter_bytes():
                        total += len(chunk)
                        if total > 100 * 1024 * 1024:
                            raise ValueError("분석 묶음 다운로드 용량 초과")
                        stream.write(chunk)
        except (httpx.HTTPError, ValueError):
            raise RuntimeError("분석 데이터 다운로드 실패. 비공개 다운로드 주소와 유효기간을 확인하세요.") from None
        unpack_bundle(archive, settings.processed_dir, settings.data_bundle_sha256)


if __name__ == "__main__":
    import uvicorn
    prepare_data()
    if (warning := cors_warning(settings.cors_origins)) is not None:
        log.warning(warning)
    uvicorn.run("app.main:app", host="0.0.0.0", port=settings.port, workers=1)
