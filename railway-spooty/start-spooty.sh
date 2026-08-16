#!/bin/sh
set -eu

COOKIE_FILE="${YT_COOKIES_FILE:-/spooty/config/cookies.txt}"

write_cookie_content() {
  mkdir -p /spooty/config
  printf '%b' "$1" | tr -d '\r' > "$COOKIE_FILE"
  chmod 600 "$COOKIE_FILE"
}

if [ -n "${YT_COOKIES_FILE_BASE64:-}" ]; then
  mkdir -p /spooty/config
  printf '%s' "$YT_COOKIES_FILE_BASE64" | base64 -d | tr -d '\r' > "$COOKIE_FILE"
  chmod 600 "$COOKIE_FILE"
  echo "Decoded YouTube cookies file to $COOKIE_FILE"
elif [ -n "${YT_COOKIES_FILE_CONTENT:-}" ]; then
  write_cookie_content "$YT_COOKIES_FILE_CONTENT"
  echo "Wrote YouTube cookies file to $COOKIE_FILE"
elif [ -n "${YT_COOKIES:-}" ]; then
  write_cookie_content "$YT_COOKIES"
  echo "Wrote YouTube cookies file to $COOKIE_FILE from YT_COOKIES"
fi

if [ -s "$COOKIE_FILE" ]; then
  COOKIE_BYTES=$(wc -c < "$COOKIE_FILE" | tr -d ' ')
  echo "YouTube cookies file ready: $COOKIE_FILE (${COOKIE_BYTES} bytes)"
  if ! head -n 1 "$COOKIE_FILE" | grep -qi "netscape"; then
    echo "Warning: YouTube cookies file does not start with a Netscape cookies header"
  fi

  YOUTUBE_COOKIE_LINES=$(grep -Ec '(^|\.)youtube\.com|(^|\.)google\.com' "$COOKIE_FILE" || true)
  SESSION_COOKIE_LINES=$(grep -Ec '[[:space:]](__Secure-[13]PSID|SAPISID|SID|LOGIN_INFO)[[:space:]]' "$COOKIE_FILE" || true)
  echo "YouTube cookies diagnostics: ${YOUTUBE_COOKIE_LINES} YouTube/Google lines, ${SESSION_COOKIE_LINES} key session lines"
else
  echo "YouTube cookies file not found or empty at $COOKIE_FILE"
fi

BGUTIL_PROVIDER_DIR="${BGUTIL_PROVIDER_HOME:-/root/bgutil-ytdlp-pot-provider}/server"
BGUTIL_PROVIDER_PORT="${BGUTIL_PROVIDER_PORT:-4416}"
BGUTIL_PROVIDER_PID=""

if [ "${BGUTIL_PROVIDER_ENABLED:-true}" != "false" ] && [ -f "$BGUTIL_PROVIDER_DIR/build/main.js" ]; then
  echo "Starting bgutil POT provider on 127.0.0.1:${BGUTIL_PROVIDER_PORT}"
  node "$BGUTIL_PROVIDER_DIR/build/main.js" --port "$BGUTIL_PROVIDER_PORT" &
  BGUTIL_PROVIDER_PID="$!"

  for _ in 1 2 3 4 5 6 7 8 9 10; do
    if wget -q -O /dev/null "http://127.0.0.1:${BGUTIL_PROVIDER_PORT}/ping"; then
      echo "bgutil POT provider is ready"
      break
    fi
    sleep 1
  done
else
  echo "bgutil POT provider is disabled or missing at $BGUTIL_PROVIDER_DIR"
fi

cleanup() {
  if [ -n "$BGUTIL_PROVIDER_PID" ]; then
    kill "$BGUTIL_PROVIDER_PID" 2>/dev/null || true
  fi
}

trap cleanup INT TERM EXIT

node backend/main.js
