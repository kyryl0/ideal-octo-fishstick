#!/bin/sh
set -eu

COOKIE_FILE="${YT_COOKIES_FILE:-/spooty/config/cookies.txt}"

if [ -n "${YT_COOKIES_FILE_CONTENT:-}" ]; then
  mkdir -p /spooty/config
  printf '%s' "$YT_COOKIES_FILE_CONTENT" > "$COOKIE_FILE"
  chmod 600 "$COOKIE_FILE"
  echo "Wrote YouTube cookies file to $COOKIE_FILE"
elif [ -n "${YT_COOKIES_FILE_BASE64:-}" ]; then
  mkdir -p /spooty/config
  printf '%s' "$YT_COOKIES_FILE_BASE64" | base64 -d > "$COOKIE_FILE"
  chmod 600 "$COOKIE_FILE"
  echo "Decoded YouTube cookies file to $COOKIE_FILE"
fi

if [ -s "$COOKIE_FILE" ]; then
  COOKIE_BYTES=$(wc -c < "$COOKIE_FILE" | tr -d ' ')
  echo "YouTube cookies file ready: $COOKIE_FILE (${COOKIE_BYTES} bytes)"
else
  echo "YouTube cookies file not found or empty at $COOKIE_FILE"
fi

node /spooty/youtube-direct-server.cjs &
exec node backend/main.js
