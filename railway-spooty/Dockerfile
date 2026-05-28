FROM node:20.20.0-alpine AS builder

WORKDIR /spooty

RUN apk add --no-cache ca-certificates wget tar \
  && wget -O /tmp/spooty.tar.gz https://github.com/Raiper34/spooty/archive/refs/heads/main.tar.gz \
  && tar -xzf /tmp/spooty.tar.gz --strip-components=1 -C . \
  && rm /tmp/spooty.tar.gz \
  && npm ci \
  && npm run build

FROM node:20.20.0-alpine

WORKDIR /spooty

ENV YTDLP_BINARY_PATH=/usr/bin/yt-dlp
ENV YTDLP_FORMAT=bestaudio/best
ENV YT_COOKIES_FILE=/spooty/config/cookies.txt

COPY --from=builder /spooty/dist .
COPY --from=builder /spooty/src ./src
COPY --from=builder /spooty/package.json ./package.json
COPY --from=builder /spooty/package-lock.json ./package-lock.json
COPY --from=builder /spooty/src/backend/.env.docker ./.env
COPY start-spooty.sh /spooty/start-spooty.sh
COPY patch-spooty.cjs /spooty/patch-spooty.cjs

RUN apk add --no-cache make g++ python3 py3-pip ffmpeg redis \
  && npm ci --omit=dev \
  && npm install sqlite3@5.1.7 --save \
  && node -e "require('sqlite3'); console.log('sqlite3 runtime dependency is installed')" \
  && rm -rf src package.json package-lock.json \
  && python3 -m pip install --break-system-packages --no-cache-dir "yt-dlp[default]" \
  && yt-dlp --version \
  && python3 -m pip show yt-dlp-ejs \
  && chmod +x /spooty/start-spooty.sh \
  && YTDLP_PATH=$(which yt-dlp) \
  && echo "yt-dlp installed at: $YTDLP_PATH" \
  && YTDLP_PATH="$YTDLP_PATH" node /spooty/patch-spooty.cjs \
  && grep -F "binaryPath" backend/shared/youtube.service.js \
  && grep -F "process.env.YT_COOKIES_FILE" backend/shared/youtube.service.js \
  && grep -F "process.env.YTDLP_FORMAT" backend/shared/youtube.service.js \
  && grep -F "process.env.YTDLP_VERBOSE" backend/shared/youtube.service.js \
  && grep -F "createYoutubeTrack" backend/playlist/playlist.service.js \
  && grep -F "savedTrack.youtubeUrl" backend/track/track.service.js \
  && node -e "const { YtDlp } = require('ytdlp-nodejs'); new YtDlp({ binaryPath: process.env.YTDLP_BINARY_PATH }); console.log('yt-dlp runtime path is usable')" \
  && npm cache clean --force

EXPOSE 3000
CMD ["/spooty/start-spooty.sh"]
