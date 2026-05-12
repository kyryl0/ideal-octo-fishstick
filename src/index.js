import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

loadEnvFile();

const BOT_TOKEN = process.env.BOT_TOKEN;
const PUBLIC_BASE_URL = getPublicBaseUrl();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const SPOTIFY_SCOPE = "user-read-recently-played";
const SPOTIFY_REDIRECT_URI = `${PUBLIC_BASE_URL}/spotify/callback`;
const DATA_DIR = join(process.cwd(), "data");
const TOKEN_PATH = join(DATA_DIR, "spotify-tokens.json");

if (!BOT_TOKEN) {
  throw new Error("Missing BOT_TOKEN. Copy .env.example to .env or set BOT_TOKEN in your environment.");
}

if (!PUBLIC_BASE_URL) {
  throw new Error("Missing PUBLIC_BASE_URL. Telegram and Spotify need your public HTTPS base URL.");
}

if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
  throw new Error("Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET.");
}

mkdirSync(DATA_DIR, { recursive: true });

const apiBase = `https://api.telegram.org/bot${BOT_TOKEN}`;
const spotifyTokens = loadJson(TOKEN_PATH, {});
const loginStates = new Map();
const chosenTracks = new Map();
const jobs = new Map();
let updateOffset = 0;

const testTunes = [
  {
    title: "SoundHelix Song 1",
    performer: "T. Schürger / SoundHelix",
    durationSeconds: 372,
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    credit: "SoundHelix Song 1 by T. Schürger, provided by SoundHelix."
  },
  {
    title: "SoundHelix Song 2",
    performer: "T. Schürger / SoundHelix",
    durationSeconds: 345,
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
    credit: "SoundHelix Song 2 by T. Schürger, provided by SoundHelix."
  },
  {
    title: "SoundHelix Song 3",
    performer: "T. Schürger / SoundHelix",
    durationSeconds: 342,
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
    credit: "SoundHelix Song 3 by T. Schürger, provided by SoundHelix."
  }
];

createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", PUBLIC_BASE_URL);

    if (url.pathname === "/health") {
      sendText(res, 200, "ok");
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

    sendText(res, 404, "not found");
  } catch (err) {
    console.error("HTTP handler failed:", err);
    sendText(res, 500, "internal error");
  }
}).listen(PORT, HOST, () => {
  console.log(`Server listening on ${HOST}:${PORT}`);
  console.log(`Spotify redirect URI: ${SPOTIFY_REDIRECT_URI}`);
});

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
      text: "Still preparing the test audio..."
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
        input_message_content: {
          message_text: "No recent Spotify tracks found."
        }
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
        message_text: `Preparing test audio for:\n${track.title}\n${track.artist} - ${track.album}`
      },
      reply_markup: {
        inline_keyboard: [[{ text: "Loading test audio...", callback_data: "loading" }]]
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
      input_message_content: {
        message_text: "Connect Spotify first, then try inline mode again."
      },
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
    await editText(inlineMessageId, `Loading test audio...\n${spotifyTrack.title}\n${spotifyTrack.artist} - ${spotifyTrack.album}`);
    await sleep(1200);

    const tune = pickRandom(testTunes);

    await telegram("editMessageMedia", {
      inline_message_id: inlineMessageId,
      media: {
        type: "audio",
        media: tune.url,
        title: tune.title,
        performer: tune.performer,
        duration: tune.durationSeconds,
        caption: `Spotify pick: ${spotifyTrack.title} - ${spotifyTrack.artist}\nTest audio: ${tune.credit}`
      },
      reply_markup: {
        inline_keyboard: [[{ text: "Show recent Spotify songs", switch_inline_query_current_chat: "" }]]
      }
    });
  } catch (err) {
    console.error("Audio swap failed:", err);
    await editText(inlineMessageId, `Couldn't swap in the test audio.\n${spotifyTrack.title}\nTry another result.`);
  }
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

function getPublicBaseUrl() {
  if (process.env.PUBLIC_BASE_URL) {
    return trimTrailingSlash(process.env.PUBLIC_BASE_URL);
  }

  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    return `https://${trimTrailingSlash(process.env.RAILWAY_PUBLIC_DOMAIN)}`;
  }

  return "";
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
