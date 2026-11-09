# ---- 1. build the web app ----
FROM node:22.11-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
# slow/unstable home internet: long timeouts + retries so one stalled download doesn't fail the whole build
RUN npm config set fetch-retries 6 && npm config set fetch-retry-mintimeout 20000 \
    && npm config set fetch-retry-maxtimeout 180000 && npm config set fetch-timeout 600000 \
    && npm ci --no-audit --no-fund --maxsockets 4
COPY frontend/ ./
RUN npm run build

# ---- 2. runtime: API + worker share one image (different start commands) ----
FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 FRONTEND_DIST=/app/frontend/dist
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg curl libglib2.0-0 && rm -rf /var/lib/apt/lists/* \
    && useradd -m -u 10001 app
WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir --retries 10 --timeout 120 -r requirements.txt
# Piper voice engine (open source) — voices themselves download on first use into MODEL_CACHE
RUN curl -fsSL https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz | tar -xz -C /opt \
    && chmod -R a+rX /opt/piper
ENV PIPER_BIN=/opt/piper/piper MODEL_CACHE=/var/models U2NET_HOME=/var/models/u2net
RUN mkdir -p /var/models && chown 10001 /var/models
COPY backend/ ./
COPY --from=web /web/dist /app/frontend/dist
USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD curl -fsS http://localhost:${PORT:-8000}/api/v1/health || exit 1
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
