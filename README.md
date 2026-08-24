# Inline Telegram Spotify Bot

This inline Telegram bot shows recently played Spotify tracks and turns a selected result into audio. It also accepts pasted YouTube and YouTube Music links without requiring Spotify login.

Every audio request uses `ytconverter` with FFmpeg. Spotify results are searched on YouTube using the track title and artist, then downloaded and converted to the configured audio format. No separate audio service is required.

## Deploy on Railway

1. Connect this repository to a Railway service.
2. Generate a public domain for the service.
3. Set these variables:

```text
BOT_TOKEN=123456:replace-me
SPOTIFY_CLIENT_ID=replace-me
SPOTIFY_CLIENT_SECRET=replace-me
```

Railway provides `PORT` automatically. The bot uses `RAILWAY_PUBLIC_DOMAIN` when `PUBLIC_BASE_URL` is not set.

The build installs Python, `ytconverter`, and FFmpeg from [nixpacks.toml](nixpacks.toml). No second Railway service is needed.

Optional downloader settings:

```text
YTCONVERTER_AUDIO_EXTENSION=mp3
YTCONVERTER_AUDIO_QUALITY=192
YTCONVERTER_TIMEOUT_MS=180000
PYTHON_BIN=python
TELEGRAM_MEDIA_TYPE=audio
```

Normal public YouTube downloads do not need cookies. The bot uses yt-dlp's EJS challenge solver and refreshes its solver components automatically. If a video genuinely requires a signed-in account, it will retry once with an optional Netscape cookies file:

```text
YT_COOKIES_FILE_BASE64=base64-encoded-cookies-txt
```

Cookies are now a fallback only; stale cookies are not sent on normal requests.

4. Set the Spotify redirect URI to:

```text
https://your-service.up.railway.app/spotify/callback
```

5. Enable inline mode and inline feedback in `@BotFather`.
6. Deploy the service.

## Run locally

Requires Node 20+, Python 3.11+, and FFmpeg.

```powershell
Copy-Item .env.example .env
python -m pip install -r requirements.txt
npm start
```

Set `PUBLIC_BASE_URL` to a public HTTPS tunnel when testing inline message edits locally.

## Spotify setup

Create a Spotify Developer application, add the callback URL above, and provide its client ID and secret. The bot requests recently played and currently playing permissions.

## Notes

- Spotify tokens are stored in `data/spotify-tokens.json`.
- Downloaded audio is stored in `data/audio` and served from `/files/...` for Telegram.
- Railway storage is ephemeral unless a volume is attached.
- After Telegram caches a track, production code can reuse its `file_id` instead of downloading again.

