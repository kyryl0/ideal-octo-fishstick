FROM raiper34/spooty:latest

WORKDIR /spooty

ENV YTDLP_BINARY_PATH=/usr/bin/yt-dlp
ENV YTDLP_FORMAT=bestaudio/best
ENV YT_COOKIES_FILE=/spooty/config/cookies.txt

COPY start-spooty.sh /spooty/start-spooty.sh
COPY patch-spooty.cjs /spooty/patch-spooty.cjs

RUN apk add --no-cache make g++ python3 py3-pip \
  && python3 -m pip install --break-system-packages --no-cache-dir yt-dlp \
  && yt-dlp --version \
  && chmod +x /spooty/start-spooty.sh \
  && YTDLP_PATH=$(which yt-dlp) \
  && echo "yt-dlp installed at: $YTDLP_PATH" \
  && YTDLP_PATH="$YTDLP_PATH" node /spooty/patch-spooty.cjs \
  && grep -F "binaryPath" backend/shared/youtube.service.js \
  && grep -F "process.env.YT_COOKIES_FILE" backend/shared/youtube.service.js \
  && grep -F "process.env.YTDLP_FORMAT" backend/shared/youtube.service.js \
  && node -e "const { YtDlp } = require('ytdlp-nodejs'); new YtDlp({ binaryPath: process.env.YTDLP_BINARY_PATH }); console.log('yt-dlp runtime path is usable')" \
  && npm install sqlite3@5.1.7 --save \
  && node -e "require('sqlite3'); console.log('sqlite3 runtime dependency is installed')" \
  && npm cache clean --force

CMD ["/spooty/start-spooty.sh"]
