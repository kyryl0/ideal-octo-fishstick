FROM node:20-bookworm-slim AS bgutil-builder

ARG BGUTIL_PROVIDER_VERSION=1.3.1

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates unzip \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /bgutil

RUN curl -fsSL "https://github.com/Brainicism/bgutil-ytdlp-pot-provider/archive/refs/tags/${BGUTIL_PROVIDER_VERSION}.zip" -o bgutil.zip \
  && unzip bgutil.zip \
  && mv "bgutil-ytdlp-pot-provider-${BGUTIL_PROVIDER_VERSION}" source \
  && cd source/server \
  && npm ci --omit=dev

FROM python:3.11-slim AS spooty

ARG SPOOTY_REF=main

ENV YTDLP_CONFIG_DIR=/config \
    YTDLP_PLUGIN_DIR=/config/yt-dlp-plugins \
    BGUTIL_PROVIDER_PORT=4416 \
    BGUTIL_PROVIDER_HOST=127.0.0.1 \
    PATH="/app/.local/bin:${PATH}"

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    curl \
    ffmpeg \
    git \
    nodejs \
    npm \
    patch \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN git clone --depth 1 --branch "${SPOOTY_REF}" https://github.com/jarriagada/spooty.git .

COPY --from=bgutil-builder /bgutil/source/server /opt/bgutil-pot-provider
COPY --from=bgutil-builder /bgutil/source/Youtube-Internal-Clients /opt/bgutil-pot-provider/Youtube-Internal-Clients
COPY patch-spooty.cjs /tmp/patch-spooty.cjs
COPY start-spooty.sh /usr/local/bin/start-spooty.sh

RUN node /tmp/patch-spooty.cjs \
  && npm run install:all \
  && npm run build:backend \
  && npm run build:frontend \
  && grep -F "allowUpdatingPlaylistById" dist/backend/main.js \
  && grep -F "SPOTIFY_SEARCH_LIMIT" dist/backend/main.js \
  && grep -F "active" backend/playlist/dto/create-playlist.dto.js \
  && grep -F "name" backend/playlist/dto/create-playlist.dto.js \
  && grep -F "yt-dlp" backend/youtube/youtube.module.js \
  && grep -F "createYoutubeTrack" dist/backend/main.js \
  && chmod +x /usr/local/bin/start-spooty.sh

EXPOSE 3000

CMD ["/usr/local/bin/start-spooty.sh"]
