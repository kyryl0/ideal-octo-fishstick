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

exec node backend/main.js
