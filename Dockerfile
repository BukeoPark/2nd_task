FROM node:24-bookworm-slim AS frontend
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# 브라우저에 공개되는 카카오 JS 앱 키만 빌드에 넣는다. REST·Google 서버 키는 넣지 않는다.
ARG VITE_KAKAO_JS_APP_KEY
RUN test -n "$(printenv VITE_KAKAO_JS_APP_KEY)" && npm run build

FROM python:3.12-slim-bookworm
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=/app/backend \
    FRONTEND_DIST=/app/frontend/dist OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app/ ./backend/app/
COPY --from=frontend /build/frontend/dist/ ./frontend/dist/
RUN useradd --create-home appuser && mkdir -p data/processed data/cache && chown -R appuser:appuser /app
USER appuser
EXPOSE 8000
CMD ["python", "-m", "app.deploy"]
