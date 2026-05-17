#!/bin/sh
set -eu

if [ -n "${YT_COOKIES_FILE_CONTENT:-}" ]; then
  mkdir -p /spooty/config
  printf '%s' "$YT_COOKIES_FILE_CONTENT" > "${YT_COOKIES_FILE:-/spooty/config/cookies.txt}"
  chmod 600 "${YT_COOKIES_FILE:-/spooty/config/cookies.txt}"
  echo "Wrote YouTube cookies file to ${YT_COOKIES_FILE:-/spooty/config/cookies.txt}"
elif [ -n "${YT_COOKIES_FILE_BASE64:-}" ]; then
  mkdir -p /spooty/config
  printf '%s' "$YT_COOKIES_FILE_BASE64" | base64 -d > "${YT_COOKIES_FILE:-/spooty/config/cookies.txt}"
  chmod 600 "${YT_COOKIES_FILE:-/spooty/config/cookies.txt}"
  echo "Decoded YouTube cookies file to ${YT_COOKIES_FILE:-/spooty/config/cookies.txt}"
fi

exec node backend/main.js
