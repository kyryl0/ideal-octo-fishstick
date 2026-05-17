FROM raiper34/spooty:latest

WORKDIR /spooty

RUN apk add --no-cache make g++ python3 \
  && npm install sqlite3@5.1.7 --omit=dev --no-save \
  && npm cache clean --force
