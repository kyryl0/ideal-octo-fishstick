FROM raiper34/spooty:latest

WORKDIR /spooty

RUN apk add --no-cache make g++ python3 py3-pip \
  && python3 -m pip install --break-system-packages --no-cache-dir yt-dlp \
  && yt-dlp --version \
  && YTDLP_PATH=$(which yt-dlp) \
  && echo "yt-dlp installed at: $YTDLP_PATH" \
  && if grep -q "new ytdlp_nodejs_1.YtDlp()" backend/shared/youtube.service.js; then \
    sed -i "s|new ytdlp_nodejs_1.YtDlp()|new ytdlp_nodejs_1.YtDlp({ binaryPath: process.env.YTDLP_BINARY_PATH || '$YTDLP_PATH' })|" backend/shared/youtube.service.js; \
  else \
    echo "Could not find Spooty's YtDlp constructor call to patch" >&2; \
    exit 1; \
  fi \
  && grep -F "binaryPath" backend/shared/youtube.service.js \
  && node -e "const { YtDlp } = require('ytdlp-nodejs'); new YtDlp({ binaryPath: '$YTDLP_PATH' }); console.log('yt-dlp runtime path is usable')" \
  && npm install sqlite3@5.1.7 --save \
  && node -e "require('sqlite3'); console.log('sqlite3 runtime dependency is installed')" \
  && npm cache clean --force

ENV YTDLP_BINARY_PATH=/usr/bin/yt-dlp
