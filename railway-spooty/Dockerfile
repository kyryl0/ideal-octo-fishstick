FROM raiper34/spooty:latest

WORKDIR /spooty

RUN apk add --no-cache make g++ python3 py3-pip \
  && python3 -m pip install --break-system-packages --no-cache-dir yt-dlp \
  && yt-dlp --version \
  && npm install sqlite3@5.1.7 --save \
  && node -e "require('sqlite3'); console.log('sqlite3 runtime dependency is installed')" \
  && npm cache clean --force
