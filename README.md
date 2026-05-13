# Inline Telegram Spotify Test Bot

This is a working inline-mode Telegram bot skeleton for the flow:

1. User connects Spotify in a private bot chat.
2. User types `@your_bot` in any chat.
3. Bot returns recently listened Spotify tracks with name + album art.
4. User taps a result.
5. Telegram sends a small placeholder message immediately.
6. Bot edits that inline message into an audio message.

By default, the final audio is a SoundHelix test MP3. With `AUDIO_PROVIDER=licensed_spotify`, it downloads the selected Spotify track using the licensed provider package configured in Railway.

## Why this shape

Telegram does **not** support uploading a new local file when editing an inline message. The edited media must be a public HTTP URL or an existing Telegram `file_id`. So the placeholder should be a fast text/photo message, not a fake never-ending audio upload.

## Deploy on Railway

Railway already gives you the public HTTPS endpoint, so you do not need a separate ngrok or Cloudflare tunnel in production.

1. Create a new Railway project from this folder or GitHub repo.
2. In the service settings, open **Networking** and choose **Generate Domain**.
3. In Railway variables, add:

```text
BOT_TOKEN=123456:replace-me
SPOTIFY_CLIENT_ID=replace-me
SPOTIFY_CLIENT_SECRET=replace-me
```

Do not set `PORT` or `APP_PORT`; Railway provides `PORT` and the app reads it automatically. You also usually do not need `PUBLIC_BASE_URL`; the app automatically uses `https://$RAILWAY_PUBLIC_DOMAIN`.

4. Deploy/redeploy the service.
5. Open `https://your-service.up.railway.app/health`. It should return `ok`.
6. In Spotify, set the redirect URI to:

```text
https://your-service.up.railway.app/spotify/callback
```

7. In Telegram, open your bot and send `/start`.

If Railway asks which port the service domain should target, use the port Railway detects for the running service. Do not override the `PORT` variable manually.

## Licensed Audio Backend

Keep these unset to use the SoundHelix fallback. To use the licensed Spotify downloader, add these Railway variables:

```text
AUDIO_PROVIDER=licensed_spotify
LICENSED_SPOTIFY_MODULE=your-nda-import-specifier
LICENSED_SPOTIFY_INSTALL_SPEC=your-nda-npm-or-git-install-specifier
LICENSED_SPOTIFY_COOKIE=sp_dc=your-cookie-here
```

`LICENSED_SPOTIFY_MODULE` is the string used by dynamic `import(...)`, replacing the NDA import path in code. `LICENSED_SPOTIFY_INSTALL_SPEC` is what Railway installs during `npm install`; it can be the same value, or a private npm/git install spec if that differs.

The provider is expected to export `Spotify.create({ cookie })`, and `client.download(spotifyTrackUrl)` must return a readable stream. The bot saves the stream as an `.ogg` file under `data/audio`, exposes it at `/files/...`, and passes that public URL to Telegram for the inline message edit.

The example downloader returns Ogg Vorbis. Telegram may reject OGG as `InputMediaAudio`; if that happens, the bot automatically retries the edit as a document. If your provider can output MP3 or M4A later, that is better for Telegram's audio player.

## Spotify setup

Create an app in the Spotify Developer Dashboard:

1. Add this redirect URI: `https://your-service.up.railway.app/spotify/callback`
2. Copy the client ID and client secret into Railway variables, or into `.env` for local development.
3. The bot requests only this scope: `user-read-recently-played`.

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

Open a private chat with the bot and send `/start`, then use the Spotify login link. After login, type `@your_bot` in any chat to see recent tracks.

## Notes

- Spotify recently played may return up to 50 items and does not include podcasts.
- This stores Spotify tokens locally in `data/spotify-tokens.json`; use a real database and encryption for production.
- Railway's filesystem is ephemeral across deploys/restarts. For continued use, attach a database or volume for Spotify tokens and downloaded audio.
- After Telegram has cached a track once, a production bot should prefer reusing a Telegram `file_id`.
