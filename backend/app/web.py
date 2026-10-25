"""API와 충돌하지 않는 React 정적 파일·SPA 경로 제공."""
from pathlib import Path
from fastapi import FastAPI
from starlette.exceptions import HTTPException
from starlette.staticfiles import StaticFiles


class FrontendFiles(StaticFiles):
    async def get_response(self, path, scope):
        # 없는 API·서버 경로를 index.html(200)로 숨기지 않는다.
        if any(part.startswith(".") for part in path.split("/")) or path.split("/", 1)[0] in {"api", "health", "docs", "redoc", "openapi.json"}:
            raise HTTPException(404)
        try:
            return await super().get_response(path, scope)
        except HTTPException as exc:
            if exc.status_code != 404 or Path(path).suffix or scope["method"] not in {"GET", "HEAD"}:
                raise
            return await super().get_response("index.html", scope)


def mount_frontend(app: FastAPI, directory: Path | None) -> None:
    if directory is None:
        return
    if not (directory / "index.html").is_file():
        raise RuntimeError("프론트엔드 빌드가 없습니다. npm run build를 먼저 실행하세요.")
    app.mount("/", FrontendFiles(directory=directory, html=True), name="frontend")
