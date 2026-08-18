# Inline Telegram Spotify Test Bot

This is a working inline-mode Telegram bot skeleton for the flow:

1. User connects Spotify in a private bot chat.
2. User types `@your_bot` in any chat.
3. Bot returns recently listened Spotify tracks with name + album art.
4. User taps a result.
5. Telegram sends a small placeholder message immediately.
6. Bot edits that inline message into an audio message.

With `AUDIO_PROVIDER=spooty`, Spotify audio comes from a self-hosted Spooty instance. Pasted YouTube / YouTube Music links are downloaded directly by the bot through the `ytconverter` Python package, then served back to Telegram the same way.

## Why this shape

Telegram does **not** support uploading a new local file when editing an inline message. The edited media must be a public HTTP URL or an existing Telegram `file_id`. So the placeholder should be a fast text/photo message, not a fake never-ending audio upload.

## Deploy on Railway

This repo is ready for Railway GitHub auto-deploys. Railway gives the bot a public HTTPS endpoint, so you do not need a separate ngrok or Cloudflare tunnel in production.

1. Use the existing Railway service connected to this GitHub repo.
2. In the bot service settings, open **Networking** and choose **Generate Domain** if it does not already have one.
3. In the bot service variables, add:

```text
BOT_TOKEN=123456:replace-me
SPOTIFY_CLIENT_ID=replace-me
SPOTIFY_CLIENT_SECRET=replace-me
AUDIO_PROVIDER=spooty
```

Do not set `PORT` or `APP_PORT`; Railway provides `PORT` and the app reads it automatically. You also usually do not need `PUBLIC_BASE_URL`; the app automatically uses `https://$RAILWAY_PUBLIC_DOMAIN`.

4. Add a second Railway service for Spooty from this same GitHub repo. In the new service settings, set the root directory to:

```text
/railway-spooty
```

This service uses `railway-spooty/Dockerfile`, downloads a public Spooty fork, installs SQLite support plus a current `yt-dlp`, starts a local bgutil PO-token provider for YouTube bot checks, and patches Spooty's YouTube service so direct YouTube / YouTube Music links route through the same Spooty backend.

Name the service `spooty` if possible. With that service name, the bot uses these internal Railway addresses:

```text
SPOOTY_BASE_URL=http://spooty.railway.internal:3000
```

If you use another service name or public Spooty domains, set those bot variables explicitly.

5. In the Spooty service variables, add:

```text
SPOTIFY_CLIENT_ID=replace-me
SPOTIFY_CLIENT_SECRET=replace-me
PORT=3000
FORMAT=mp3
REDIS_RUN=true
REDIS_HOST=localhost
REDIS_PORT=6379
YT_DOWNLOADS_PER_MINUTE=3
```

For YouTube bot-check failures, add cookies to the Spooty service, not the bot service. Prefer base64 so Railway preserves the exact `cookies.txt` line endings and tabs:

```text
YT_COOKIES_FILE_BASE64=base64-encoded-netscape-cookies-txt
```

The startup script also accepts `YT_COOKIES_FILE_CONTENT` and the upstream-compatible `YT_COOKIES` variable. After changing cookie variables, redeploy or restart the Spooty service and check the logs for `YouTube cookies file ready` plus nonzero YouTube/Google and key session cookie counts.

Optional yt-dlp tuning variables for the Spooty service:

```text
YTDLP_VERBOSE=true
YTDLP_FORCE_IPV4=true
YTDLP_DOWNLOAD_EXTRACTOR_ARGS=youtube:player_client=mweb
YTDLP_SEARCH_EXTRACTOR_ARGS=youtube:player_client=android_vr
YTDLP_USER_AGENT=Mozilla/5.0 ...
BGUTIL_PROVIDER_ENABLED=true
BGUTIL_PROVIDER_PORT=4416
```

The Spooty service logs should include `bgutil POT provider is ready`. With `YTDLP_VERBOSE=true`, yt-dlp should also log `PO Token Providers` and include `bgutil:http`.

6. Deploy/redeploy both services.
7. Open `https://your-service.up.railway.app/health`. It should return `ok`.
8. In Spotify, set the redirect URI to:

```text
https://your-service.up.railway.app/spotify/callback
```

9. In Telegram, open your bot and send `/start`.

If Railway asks which port the service domain should target, use the port Railway detects for the running service. Do not override the `PORT` variable manually.

## Spooty Audio Backend

Enable Spooty on the bot with these variables:

```text
AUDIO_PROVIDER=spooty
SPOOTY_BASE_URL=http://spooty.railway.internal:3000
SPOOTY_AUDIO_EXTENSION=mp3
```

Spooty is a separate self-hosted service, not an npm package. Configure it with its own Spotify client ID/secret and YouTube cookie settings as described in [Raiper34/spooty](https://github.com/Raiper34/spooty).

For Spotify inline results, the bot calls Spooty's `/api/playlist` endpoint with the selected Spotify URL, waits for the created track to reach `Completed`, downloads it from `/api/track/download/:id`, saves it under `data/audio`, exposes it at `/files/...`, and passes that public URL to Telegram.

For pasted YouTube / YouTube Music links, the bot returns a direct inline result without requiring Spotify login. When selected, it downloads the link as audio through `ytconverter`, saves the finished file under `data/audio`, exposes it at `/files/...`, and edits the Telegram message the same way.

Optional tuning:

```text
SPOOTY_POLL_INTERVAL_MS=3000
SPOOTY_POLL_TIMEOUT_MS=180000
TELEGRAM_MEDIA_TYPE=audio
YTCONVERTER_AUDIO_EXTENSION=mp3
YTCONVERTER_AUDIO_QUALITY=192
YTCONVERTER_TIMEOUT_MS=180000
PYTHON_BIN=python
```

Telegram may reject some formats as `InputMediaAudio`; if that happens, the bot automatically retries the edit as a document. Spooty's default `mp3` format is the best fit for Telegram's audio player.

## Spotify setup

Create an app in the Spotify Developer Dashboard:

1. Add this redirect URI: `https://your-service.up.railway.app/spotify/callback`
2. Copy the client ID and client secret into Railway variables, or into `.env` for local development.
3. The bot requests `user-read-recently-played` and `user-read-currently-playing`.

## BotFather setup

In `@BotFather`:

1. Create a bot and copy its token.
2. Run `/setinline` for the bot and set a placeholder like `Recent Spotify songs`.
3. Run `/setinlinefeedback` and enable feedback. Without this, Telegram will not send `chosen_inline_result`, and the bot will not know which inline message to edit.

## Run locally

Requires Node 20+.

```powershell
Copy-Item .env.example .env
# edit .env with your BOT_TOKEN, PUBLIC_BASE_URL, and Spotify app credentials
npm start
```

`PUBLIC_BASE_URL` must be public HTTPS and point to this app's `PORT`. For local testing, use a tunnel such as Cloudflare Tunnel or ngrok.

Open a private chat with the bot and send `/start`, then use the Spotify login link. After login, type `@your_bot` in any chat to see recent tracks. You can also paste a YouTube Music link after `@your_bot` inline.

## Notes

- Spotify recently played may return up to 50 items and does not include podcasts.
- This stores Spotify tokens locally in `data/spotify-tokens.json`; use a real database and encryption for production.
- Railway's filesystem is ephemeral across deploys/restarts. For continued use, attach a database or volume for Spotify tokens and downloaded audio.
- After Telegram has cached a track once, a production bot should prefer reusing a Telegram `file_id`.

