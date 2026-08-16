FROM node:20.20.0-alpine AS builder

WORKDIR /spooty

COPY patch-spooty.cjs /tmp/patch-spooty.cjs

RUN apk add --no-cache ca-certificates wget tar \
  && wget -O /tmp/spooty.tar.gz https://github.com/TorMatzAndren/jarri-spooty/archive/refs/heads/main.tar.gz \
  && tar -xzf /tmp/spooty.tar.gz --strip-components=1 -C . \
  && rm /tmp/spooty.tar.gz \
  && node /tmp/patch-spooty.cjs \
  && npm ci \
  && npm run build

FROM node:20.20.0-alpine AS bgutil-provider

WORKDIR /root/bgutil-ytdlp-pot-provider

RUN apk add --no-cache ca-certificates wget tar make g++ python3 pkgconfig cairo-dev pango-dev jpeg-dev giflib-dev librsvg-dev \
  && wget -O /tmp/bgutil.tar.gz https://github.com/Brainicism/bgutil-ytdlp-pot-provider/archive/refs/tags/1.3.1.tar.gz \
  && tar -xzf /tmp/bgutil.tar.gz --strip-components=1 -C . \
  && rm /tmp/bgutil.tar.gz \
  && cd server \
  && npm ci --no-audit --no-fund \
  && npx tsc \
  && npm prune --omit=dev --no-audit --no-fund

FROM node:20.20.0-alpine

WORKDIR /spooty

ENV YTDLP_BINARY_PATH=/usr/bin/yt-dlp
ENV YTDLP_FORMAT=bestaudio/best
ENV YT_COOKIES_FILE=/spooty/config/cookies.txt
ENV BGUTIL_PROVIDER_HOME=/root/bgutil-ytdlp-pot-provider
ENV BGUTIL_PROVIDER_PORT=4416

COPY --from=builder /spooty/dist .
COPY --from=builder /spooty/src ./src
COPY --from=builder /spooty/package.json ./package.json
COPY --from=builder /spooty/package-lock.json ./package-lock.json
COPY --from=builder /spooty/src/backend/.env.docker ./.env
COPY --from=bgutil-provider /root/bgutil-ytdlp-pot-provider/server /root/bgutil-ytdlp-pot-provider/server
COPY start-spooty.sh /spooty/start-spooty.sh

RUN apk add --no-cache make g++ python3 py3-pip ffmpeg redis ca-certificates wget cairo pango jpeg giflib librsvg \
  && npm ci --omit=dev \
  && npm install sqlite3@5.1.7 --save \
  && node -e "require('sqlite3'); console.log('sqlite3 runtime dependency is installed')" \
  && rm -rf src package.json package-lock.json \
  && python3 -m pip install --break-system-packages --no-cache-dir --upgrade --pre "yt-dlp[default]" bgutil-ytdlp-pot-provider \
  && yt-dlp --version \
  && python3 -m pip show bgutil-ytdlp-pot-provider \
  && test -f /root/bgutil-ytdlp-pot-provider/server/build/main.js \
  && python3 -m pip show yt-dlp-ejs \
  && chmod +x /spooty/start-spooty.sh \
  && which yt-dlp \
  && grep -F "active" backend/playlist/dto/create-playlist.dto.js \
  && grep -F "YouTube cookies file not found or empty" backend/shared/youtube.service.js \
  && grep -F "createYoutubeTrack" backend/playlist/playlist.service.js \
  && grep -F "savedTrack.youtubeUrl" backend/track/track.service.js \
  && npm cache clean --force

EXPOSE 3000
CMD ["/spooty/start-spooty.sh"]
