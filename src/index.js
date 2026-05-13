import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { pipeline } from "node:stream/promises";

loadEnvFile();

const BOT_TOKEN = process.env.BOT_TOKEN;
const PUBLIC_BASE_URL = getPublicBaseUrl();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const SONGLINK_API_KEY = process.env.SONGLINK_API_KEY;
const AUDIO_PROVIDER = process.env.AUDIO_PROVIDER || "soundhelix";
const LICENSED_SPOTIFY_MODULE = process.env.LICENSED_SPOTIFY_MODULE;
const LICENSED_SPOTIFY_COOKIE = process.env.LICENSED_SPOTIFY_COOKIE || process.env.SP_DC_COOKIE;
const LICENSED_TELEGRAM_MEDIA_TYPE = process.env.LICENSED_TELEGRAM_MEDIA_TYPE || "audio";
const SPOTIFY_SCOPE = "user-read-recently-played";
const SPOTIFY_REDIRECT_URI = `${PUBLIC_BASE_URL}/spotify/callback`;
const DATA_DIR = join(process.cwd(), "data");
const AUDIO_DIR = join(DATA_DIR, "audio");
const TOKEN_PATH = join(DATA_DIR, "spotify-tokens.json");

mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(AUDIO_DIR, { recursive: true });

const apiBase = BOT_TOKEN ? `https://api.telegram.org/bot${BOT_TOKEN}` : "";
const spotifyTokens = loadJson(TOKEN_PATH, {});
const loginStates = new Map();
const chosenTracks = new Map();
const jobs = new Map();
let licensedSpotifyClient;
let updateOffset = 0;

const testTunes = [
  {
    title: "SoundHelix Song 1",
    performer: "T. Schurger / SoundHelix",
    durationSeconds: 372,
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    credit: "SoundHelix Song 1 by T. Schurger, provided by SoundHelix."
  },
  {
    title: "SoundHelix Song 2",
    performer: "T. Schurger / SoundHelix",
    durationSeconds: 345,
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
    credit: "SoundHelix Song 2 by T. Schurger, provided by SoundHelix."
  },
  {
    title: "SoundHelix Song 3",
    performer: "T. Schurger / SoundHelix",
    durationSeconds: 342,
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
    credit: "SoundHelix Song 3 by T. Schurger, provided by SoundHelix."
  }
];

createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", PUBLIC_BASE_URL || "http://localhost");

    if (url.pathname === "/health") {
      sendText(res, 200, getConfigErrors().length ? `booted with missing config: ${getConfigErrors().join(", ")}` : "ok");
      return;
    }

    if (url.pathname === "/spotify/login") {
      handleSpotifyLogin(url, res);
      return;
    }

    if (url.pathname === "/spotify/callback") {
      await handleSpotifyCallback(url, res);
      return;
    }

    if (url.pathname.startsWith("/files/")) {
      serveAudioFile(url, res);
      return;
    }

    sendText(res, 404, "not found");
  } catch (err) {
    console.error("HTTP handler failed:", err);
    sendText(res, 500, "internal error");
  }
}).listen(PORT, HOST, () => {
  console.log(`Server listening on ${HOST}:${PORT}`);
  if (PUBLIC_BASE_URL) {
    console.log(`Public base URL: ${PUBLIC_BASE_URL}`);
    console.log(`Spotify redirect URI: ${SPOTIFY_REDIRECT_URI}`);
  }
});

const configErrors = getConfigErrors();
if (configErrors.length) {
  console.error(`Bot is not polling because config is incomplete: ${configErrors.join(", ")}`);
} else {
  pollTelegram().catch((err) => {
    console.error("Bot polling stopped:", err);
    process.exitCode = 1;
  });
}

async function pollTelegram() {
  console.log("Bot polling started. Type your bot username inline in Telegram.");

  while (true) {
    try {
      const updates = await telegram("getUpdates", {
        offset: updateOffset,
        timeout: 30,
        allowed_updates: ["inline_query", "chosen_inline_result", "callback_query", "message"]
      });

      for (const update of updates) {
        updateOffset = update.update_id + 1;
        handleUpdate(update).catch((err) => console.error("Update failed:", err));
      }
    } catch (err) {
      console.error("Polling failed:", err);
      await sleep(1500);
    }
  }
}

async function handleUpdate(update) {
  if (update.inline_query) {
    await handleInlineQuery(update.inline_query);
    return;
  }

  if (update.chosen_inline_result) {
    await handleChosenInlineResult(update.chosen_inline_result);
    return;
  }

  if (update.callback_query) {
    await telegram("answerCallbackQuery", {
      callback_query_id: update.callback_query.id,
      text: "Still preparing the audio..."
    });
    return;
  }

  if (update.message?.text === "/start") {
    const loginUrl = makeLoginUrl(update.message.from.id);
    await telegram("sendMessage", {
      chat_id: update.message.chat.id,
      text: "Connect Spotify, then use me inline in any chat.",
      reply_markup: {
        inline_keyboard: [[{ text: "Connect Spotify", url: loginUrl }]]
      }
    });
  }
}

async function handleInlineQuery(query) {
  const telegramUserId = String(query.from.id);

  if (!spotifyTokens[telegramUserId]) {
    await answerWithConnectResult(query.id, telegramUserId);
    return;
  }

  let tracks;
  try {
    tracks = await getRecentlyPlayed(telegramUserId);
  } catch (err) {
    console.error("Spotify recent tracks failed:", err);
    await answerWithConnectResult(query.id, telegramUserId, "Reconnect Spotify");
    return;
  }

  if (tracks.length === 0) {
    await telegram("answerInlineQuery", {
      inline_query_id: query.id,
      results: [{
        type: "article",
        id: "no-recent-tracks",
        title: "No recent Spotify tracks",
        description: "Play something on Spotify, then try again.",
        input_message_content: { message_text: "No recent Spotify tracks found." }
      }],
      cache_time: 1,
      is_personal: true
    });
    return;
  }

  const results = tracks.map((track, index) => {
    const resultId = makeResultId(telegramUserId, track, index);
    chosenTracks.set(resultId, track);

    return {
      type: "article",
      id: resultId,
      title: track.title,
      description: `${track.artist} - ${track.album}`,
      thumbnail_url: track.artwork,
      input_message_content: {
        message_text: `Preparing audio for:\n${track.title}\n${track.artist} - ${track.album}`
      },
      reply_markup: {
        inline_keyboard: [[{ text: "Loading audio...", callback_data: "loading" }]]
      }
    };
  });

  await telegram("answerInlineQuery", {
    inline_query_id: query.id,
    results,
    cache_time: 1,
    is_personal: true
  });
}

async function answerWithConnectResult(inlineQueryId, telegramUserId, title = "Connect Spotify") {
  await telegram("answerInlineQuery", {
    inline_query_id: inlineQueryId,
    results: [{
      type: "article",
      id: "connect-spotify",
      title,
      description: "Authorize Spotify to show recently listened songs.",
      input_message_content: { message_text: "Connect Spotify first, then try inline mode again." },
      reply_markup: {
        inline_keyboard: [[{ text: "Connect Spotify", url: makeLoginUrl(telegramUserId) }]]
      }
    }],
    cache_time: 1,
    is_personal: true
  });
}

async function handleChosenInlineResult(chosen) {
  if (!chosen.inline_message_id) {
    console.warn("Chosen result has no inline_message_id. Enable /setinlinefeedback and keep an inline keyboard attached.");
    return;
  }

  const track = chosenTracks.get(chosen.result_id);
  if (!track) {
    await editText(chosen.inline_message_id, "That result expired. Trigger the bot inline again and pick it once more.");
    return;
  }

  const jobKey = `${chosen.inline_message_id}:${chosen.result_id}`;
  if (jobs.has(jobKey)) return;

  jobs.set(jobKey, prepareAndSwap(chosen.inline_message_id, track).finally(() => jobs.delete(jobKey)));
}

async function prepareAndSwap(inlineMessageId, spotifyTrack) {
  try {
    await editText(inlineMessageId, `Loading audio...\n${spotifyTrack.title}\n${spotifyTrack.artist} - ${spotifyTrack.album}`);
    await sleep(1200);

    const audio = await resolveAudio(spotifyTrack);
    const links = await resolveSongLinks(spotifyTrack);
    await editInlineMedia(inlineMessageId, audio, spotifyTrack, links);
  } catch (err) {
    console.error("Audio swap failed:", err);
    await editText(inlineMessageId, `Couldn't swap in the audio.\n${spotifyTrack.title}\nTry another result.`);
  }
}

async function editInlineMedia(inlineMessageId, audio, spotifyTrack, links) {
  const media = {
    type: LICENSED_TELEGRAM_MEDIA_TYPE,
    media: audio.url,
    title: audio.title,
    performer: audio.performer,
    duration: audio.durationSeconds,
    caption: buildAudioCaption(spotifyTrack, audio, links),
    parse_mode: "HTML"
  };

  try {
    await telegram("editMessageMedia", {
      inline_message_id: inlineMessageId,
      media,
      reply_markup: {
        inline_keyboard: [[{ text: "Show recent Spotify songs", switch_inline_query_current_chat: "" }]]
      }
    });
  } catch (err) {
    if (media.type !== "audio") throw err;
    console.error("Audio edit failed; retrying as document:", err);
    await telegram("editMessageMedia", {
      inline_message_id: inlineMessageId,
      media: {
        type: "document",
        media: audio.url,
        caption: buildAudioCaption(spotifyTrack, audio, links),
        parse_mode: "HTML"
      },
      reply_markup: {
        inline_keyboard: [[{ text: "Show recent Spotify songs", switch_inline_query_current_chat: "" }]]
      }
    });
  }
}

async function resolveAudio(spotifyTrack) {
  if (AUDIO_PROVIDER === "licensed_spotify") {
    return downloadLicensedSpotifyAudio(spotifyTrack);
  }

  const tune = pickRandom(testTunes);
  return {
    title: tune.title,
    performer: tune.performer,
    durationSeconds: tune.durationSeconds,
    url: tune.url,
    credit: tune.credit
  };
}

async function downloadLicensedSpotifyAudio(spotifyTrack) {
  if (!LICENSED_SPOTIFY_MODULE) {
    throw new Error("AUDIO_PROVIDER=licensed_spotify requires LICENSED_SPOTIFY_MODULE.");
  }

  if (!LICENSED_SPOTIFY_COOKIE) {
    throw new Error("AUDIO_PROVIDER=licensed_spotify requires LICENSED_SPOTIFY_COOKIE or SP_DC_COOKIE.");
  }

  if (!spotifyTrack.spotifyUrl) {
    throw new Error("Spotify track URL is missing.");
  }

  const fileName = `${safeSegment(spotifyTrack.spotifyId || createHash("sha256").update(spotifyTrack.spotifyUrl).digest("hex"))}.ogg`;
  const filePath = join(AUDIO_DIR, fileName);

  if (!existsSync(filePath)) {
    const client = await getLicensedSpotifyClient();
    const stream = client.download(spotifyTrack.spotifyUrl);
    await pipeline(stream, createWriteStream(filePath));
  }

  return {
    title: spotifyTrack.title,
    performer: spotifyTrack.artist,
    durationSeconds: undefined,
    url: `${PUBLIC_BASE_URL}/files/${encodeURIComponent(fileName)}`,
    credit: "Licensed Spotify audio."
  };
}

async function getLicensedSpotifyClient() {
  if (licensedSpotifyClient) return licensedSpotifyClient;

  const provider = await import(LICENSED_SPOTIFY_MODULE);
  const Spotify = provider.Spotify || provider.default?.Spotify || provider.default;

  if (!Spotify?.create) {
    throw new Error(`Module ${LICENSED_SPOTIFY_MODULE} does not export Spotify.create().`);
  }

  licensedSpotifyClient = await Spotify.create({
    cookie: normalizeSpotifyCookie(LICENSED_SPOTIFY_COOKIE)
  });
  return licensedSpotifyClient;
}

function serveAudioFile(url, res) {
  const fileName = basename(decodeURIComponent(url.pathname.slice("/files/".length)));
  const filePath = join(AUDIO_DIR, fileName);

  if (!existsSync(filePath)) {
    sendText(res, 404, "not found");
    return;
  }

  const { size } = statSync(filePath);
  res.writeHead(200, {
    "content-type": guessMediaType(fileName),
    "content-length": String(size),
    "accept-ranges": "bytes",
    "cache-control": "public, max-age=86400"
  });
  createReadStream(filePath).pipe(res);
}

async function resolveSongLinks(track) {
  const fallbackOther = track.spotifyId ? `https://song.link/s/${track.spotifyId}` : track.spotifyUrl;
  const fallback = {
    spotify: track.spotifyUrl,
    appleMusic: undefined,
    other: fallbackOther
  };

  if (!track.spotifyUrl) return fallback;

  try {
    const url = new URL("https://api.song.link/v1-alpha.1/links");
    url.searchParams.set("url", track.spotifyUrl);
    if (SONGLINK_API_KEY) url.searchParams.set("key", SONGLINK_API_KEY);

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Song.link failed: ${res.status}`);

    const data = await res.json();
    return {
      spotify: data.linksByPlatform?.spotify?.url || track.spotifyUrl,
      appleMusic: data.linksByPlatform?.appleMusic?.url,
      other: data.pageUrl || fallbackOther
    };
  } catch (err) {
    console.error("Song.link lookup failed:", err);
    return fallback;
  }
}

function buildAudioCaption(spotifyTrack, audio, links) {
  const linkParts = [
    links.spotify ? makeHtmlLink("Spotify", links.spotify) : undefined,
    links.appleMusic ? makeHtmlLink("Apple Music", links.appleMusic) : undefined,
    links.other ? makeHtmlLink("Other", links.other) : undefined
  ].filter(Boolean);

  return [
    `Spotify pick: ${escapeHtml(spotifyTrack.title)} - ${escapeHtml(spotifyTrack.artist)}`,
    audio.credit ? `Audio: ${escapeHtml(audio.credit)}` : undefined,
    linkParts.length ? `Listen: ${linkParts.join(" | ")}` : undefined
  ].filter(Boolean).join("\n");
}

function makeHtmlLink(label, url) {
  return `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`;
}

function handleSpotifyLogin(url, res) {
  const telegramUserId = url.searchParams.get("telegram_user_id");
  if (!telegramUserId || !/^\d+$/.test(telegramUserId)) {
    sendText(res, 400, "missing telegram_user_id");
    return;
  }

  const state = randomBytes(24).toString("hex");
  loginStates.set(state, { telegramUserId, createdAt: Date.now() });

  const authUrl = new URL("https://accounts.spotify.com/authorize");
  authUrl.searchParams.set("client_id", SPOTIFY_CLIENT_ID);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", SPOTIFY_REDIRECT_URI);
  authUrl.searchParams.set("scope", SPOTIFY_SCOPE);
  authUrl.searchParams.set("state", state);

  res.writeHead(302, { location: authUrl.toString() });
  res.end();
}

async function handleSpotifyCallback(url, res) {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    sendHtml(res, 400, `<h1>Spotify login failed</h1><p>${escapeHtml(error)}</p>`);
    return;
  }

  const loginState = state ? loginStates.get(state) : undefined;
  if (!code || !state || !loginState || Date.now() - loginState.createdAt > 10 * 60 * 1000) {
    sendHtml(res, 400, "<h1>Spotify login expired</h1><p>Please restart login from Telegram.</p>");
    return;
  }

  loginStates.delete(state);
  const token = await exchangeSpotifyCode(code);
  spotifyTokens[loginState.telegramUserId] = token;
  saveTokens();

  sendHtml(res, 200, "<h1>Spotify connected</h1><p>You can return to Telegram and use the bot inline now.</p>");
}

async function getRecentlyPlayed(telegramUserId) {
  const token = await getValidSpotifyToken(telegramUserId);
  const res = await fetch("https://api.spotify.com/v1/me/player/recently-played?limit=10", {
    headers: { authorization: `Bearer ${token.access_token}` }
  });

  if (res.status === 401) {
    delete spotifyTokens[telegramUserId];
    saveTokens();
    throw new Error("Spotify token rejected");
  }

  if (!res.ok) throw new Error(`Spotify recently played failed: ${res.status}`);

  const data = await res.json();
  return (data.items || [])
    .filter((item) => item.track?.type === "track")
    .map((item) => ({
      spotifyId: item.track.id,
      title: item.track.name,
      artist: item.track.artists?.map((artist) => artist.name).join(", ") || "Unknown artist",
      album: item.track.album?.name || "Unknown album",
      artwork: item.track.album?.images?.at(-1)?.url || item.track.album?.images?.[0]?.url,
      playedAt: item.played_at,
      spotifyUrl: item.track.external_urls?.spotify
    }));
}

async function getValidSpotifyToken(telegramUserId) {
  const token = spotifyTokens[telegramUserId];
  if (!token) throw new Error("No Spotify token");

  if (Date.now() < token.expires_at - 60_000) return token;
  if (!token.refresh_token) throw new Error("Spotify token has no refresh token");

  const refreshed = await refreshSpotifyToken(token.refresh_token);
  spotifyTokens[telegramUserId] = {
    ...token,
    ...refreshed,
    refresh_token: refreshed.refresh_token || token.refresh_token
  };
  saveTokens();
  return spotifyTokens[telegramUserId];
}

async function exchangeSpotifyCode(code) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: SPOTIFY_REDIRECT_URI
  });

  const token = await spotifyTokenRequest(body);
  return withExpiry(token);
}

async function refreshSpotifyToken(refreshToken) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken
  });

  const token = await spotifyTokenRequest(body);
  return withExpiry(token);
}

async function spotifyTokenRequest(body) {
  const auth = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString("base64");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      authorization: `Basic ${auth}`,
      "content-type": "application/x-www-form-urlencoded"
    },
    body
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`Spotify token request failed: ${data.error_description || res.status}`);
  return data;
}

async function editText(inlineMessageId, text) {
  await telegram("editMessageText", {
    inline_message_id: inlineMessageId,
    text,
    reply_markup: {
      inline_keyboard: [[{ text: "Preparing...", callback_data: "loading" }]]
    }
  });
}

async function telegram(method, body) {
  const res = await fetch(`${apiBase}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(`${method} failed: ${data.description || res.statusText}`);
  }
  return data.result;
}

function makeLoginUrl(telegramUserId) {
  const url = new URL(`${PUBLIC_BASE_URL}/spotify/login`);
  url.searchParams.set("telegram_user_id", String(telegramUserId));
  return url.toString();
}

function makeResultId(telegramUserId, track, index) {
  const raw = `${telegramUserId}:${track.spotifyId}:${track.playedAt}:${index}`;
  return `sp:${createHash("sha256").update(raw).digest("base64url").slice(0, 32)}`;
}

function loadJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8"));
}

function saveTokens() {
  writeFileSync(TOKEN_PATH, JSON.stringify(spotifyTokens, null, 2));
}

function withExpiry(token) {
  return {
    ...token,
    expires_at: Date.now() + token.expires_in * 1000
  };
}

function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function sendText(res, status, text) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(text);
}

function sendHtml(res, status, html) {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8" });
  res.end(`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><body>${html}</body>`);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function normalizeSpotifyCookie(value) {
  return value.startsWith("sp_dc=") ? value : `sp_dc=${value}`;
}

function safeSegment(value) {
  return String(value).replace(/[^a-z0-9_-]+/gi, "_").slice(0, 80);
}

function guessMediaType(fileName) {
  if (fileName.endsWith(".ogg")) return "audio/ogg";
  if (fileName.endsWith(".opus")) return "audio/ogg";
  if (fileName.endsWith(".mp3")) return "audio/mpeg";
  if (fileName.endsWith(".m4a")) return "audio/mp4";
  return "application/octet-stream";
}

function getPublicBaseUrl() {
  if (process.env.PUBLIC_BASE_URL) {
    return trimTrailingSlash(process.env.PUBLIC_BASE_URL);
  }

  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    return `https://${trimTrailingSlash(process.env.RAILWAY_PUBLIC_DOMAIN)}`;
  }

  return "";
}

function getConfigErrors() {
  const errors = [];
  if (!BOT_TOKEN) errors.push("BOT_TOKEN");
  if (!PUBLIC_BASE_URL) errors.push("PUBLIC_BASE_URL or RAILWAY_PUBLIC_DOMAIN");
  if (!SPOTIFY_CLIENT_ID) errors.push("SPOTIFY_CLIENT_ID");
  if (!SPOTIFY_CLIENT_SECRET) errors.push("SPOTIFY_CLIENT_SECRET");
  if (AUDIO_PROVIDER === "licensed_spotify" && !LICENSED_SPOTIFY_MODULE) errors.push("LICENSED_SPOTIFY_MODULE");
  if (AUDIO_PROVIDER === "licensed_spotify" && !LICENSED_SPOTIFY_COOKIE) errors.push("LICENSED_SPOTIFY_COOKIE or SP_DC_COOKIE");
  return errors;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadEnvFile() {
  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsAt = trimmed.indexOf("=");
    if (equalsAt === -1) continue;

    const key = trimmed.slice(0, equalsAt).trim();
    const rawValue = trimmed.slice(equalsAt + 1).trim();
    const value = rawValue.replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}
