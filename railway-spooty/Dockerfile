FROM raiper34/spooty:latest

WORKDIR /spooty

ENV YTDLP_BINARY_PATH=/usr/local/bin/yt-dlp

RUN apk add --no-cache make g++ python3 py3-pip \
  && python3 -m pip install --break-system-packages --no-cache-dir --prefix=/usr/local yt-dlp \
  && /usr/local/bin/yt-dlp --version \
  && if grep -q "new ytdlp_nodejs_1.YtDlp()" backend/shared/youtube.service.js; then \
    sed -i "s|new ytdlp_nodejs_1.YtDlp()|new ytdlp_nodejs_1.YtDlp({ binaryPath: process.env.YTDLP_BINARY_PATH || '/usr/local/bin/yt-dlp' })|" backend/shared/youtube.service.js; \
  else \
    echo "Could not find Spooty's YtDlp constructor call to patch" >&2; \
    exit 1; \
  fi \
  && grep -F "binaryPath" backend/shared/youtube.service.js \
  && node -e "const { YtDlp } = require('ytdlp-nodejs'); new YtDlp({ binaryPath: process.env.YTDLP_BINARY_PATH }); console.log('yt-dlp runtime path is usable')" \
  && npm install sqlite3@5.1.7 --save \
  && node -e "require('sqlite3'); console.log('sqlite3 runtime dependency is installed')" \
  && npm cache clean --force
