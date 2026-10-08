"""FastAPI 진입점.

실행: 프로젝트 루트에서
    .venv/bin/python -m uvicorn app.main:app --reload --app-dir backend
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import competitors, food, regions, stores

app = FastAPI(title="상권 분석 API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(regions.router)
app.include_router(competitors.router)
app.include_router(stores.router)
app.include_router(food.router)


@app.get("/health")
def health() -> dict:
    return {"ok": True}
