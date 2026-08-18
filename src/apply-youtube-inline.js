import { readFileSync, writeFileSync } from "node:fs";

const indexPath = new URL("./index.js", import.meta.url);
let source = readFileSync(indexPath, "utf8");
let changed = false;

function replaceOnce(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Could not apply YouTube inline patch. Missing ${label}.`);
  }
  source = source.replace(before, after);
  changed = true;
}

function insertAfter(needle, insertion, label) {
  if (source.includes(insertion)) return;
  if (!source.includes(needle)) {
    throw new Error(`Could not apply YouTube inline patch. Missing ${label}.`);
  }
  source = source.replace(needle, `${needle}${insertion}`);
  changed = true;
}

function replacePatternOnce(pattern, replacement, label) {
  if (!pattern.test(source)) return;
  source = source.replace(pattern, replacement);
  changed = true;
}

replacePatternOnce(
  /const AUDIO_PROVIDER = [^\n]+\nconst TELEGRAM_MEDIA_TYPE = [^\n]+\nconst SPOOTY_BASE_URL = [^\n]+\nconst SPOOTY_POLL_INTERVAL_MS = [^\n]+\nconst SPOOTY_POLL_TIMEOUT_MS = [^\n]+\nconst SPOOTY_AUDIO_EXTENSION = [^\n]+\n/,
  `const TELEGRAM_MEDIA_TYPE = process.env.TELEGRAM_MEDIA_TYPE || "audio";\n`,
  "Spooty configuration constants"
);

replacePatternOnce(
  /const YTCONVERTER_AUDIO_EXTENSION = [^\n]+/,
  `const YTCONVERTER_AUDIO_EXTENSION = normalizeAudioExtension(process.env.YTCONVERTER_AUDIO_EXTENSION || "mp3");`,
  "ytconverter audio extension"
);

replacePatternOnce(
  /if \(AUDIO_PROVIDER === "spooty" && !SPOOTY_BASE_URL\) errors\.push\("SPOOTY_BASE_URL"\);\n/,
  "",
  "Spooty config validation"
);

replacePatternOnce(
  /  if \(!SPOTIFY_CLIENT_ID\) errors\.push\("SPOTIFY_CLIENT_ID"\);\n  if \(!SPOTIFY_CLIENT_SECRET\) errors\.push\("SPOTIFY_CLIENT_SECRET"\);\n/,
  `  if (!hasSpotifyConfiguration() && !hasYoutubeMusicConfiguration()) errors.push("Spotify or YouTube Music OAuth configuration");\n`,
  "optional Spotify or YouTube Music configuration"
);

replacePatternOnce(
  /async function resolveAudio\(spotifyTrack\) \{[\s\S]*?\n\}/,
  `async function resolveAudio(track) {
  return downloadYoutubeAudio(track);
}`,
  "single ytconverter audio provider"
);

replacePatternOnce(
  /async function downloadSpootyAudio\(spotifyTrack\) \{[\s\S]*?\nasync function serveAudioFile/,
  `function buildLocalAudioResult(track, fileName) {
  return {
    title: track.title,
    performer: track.artist,
    durationSeconds: undefined,
    url: PUBLIC_BASE_URL + "/files/" + encodeURIComponent(fileName),
    credit: "ytconverter audio."
  };
}

async function serveAudioFile`,
  "remove Spooty download implementation"
);

insertAfter(
  `import { createHash, randomBytes } from "node:crypto";`,
  `\nimport { execFile } from "node:child_process";`,
  "execFile import"
);

insertAfter(
  `import { pipeline } from "node:stream/promises";`,
  `\nimport { promisify } from "node:util";`,
  "promisify import"
);

insertAfter(
  `const TELEGRAM_MEDIA_TYPE = process.env.TELEGRAM_MEDIA_TYPE || "audio";`,
  `\nconst YTCONVERTER_AUDIO_EXTENSION = normalizeAudioExtension(process.env.YTCONVERTER_AUDIO_EXTENSION || "mp3");\nconst YTCONVERTER_AUDIO_QUALITY = String(process.env.YTCONVERTER_AUDIO_QUALITY || "192");\nconst YTMUSIC_CLIENT_ID = process.env.YTMUSIC_CLIENT_ID || "";\nconst YTMUSIC_CLIENT_SECRET = process.env.YTMUSIC_CLIENT_SECRET || "";`,
  "ytconverter audio config"
);

insertAfter(
  `const TOKEN_PATH = join(DATA_DIR, "spotify-tokens.json");`,
  `\nconst YTMUSIC_TOKEN_DIR = join(DATA_DIR, "ytmusic-oauth");\nconst MUSIC_SOURCE_PATH = join(DATA_DIR, "music-sources.json");`,
  "YouTube Music data paths"
);

insertAfter(
  `const spotifyTokens = loadJson(TOKEN_PATH, {});`,
  `\nconst musicSources = loadJson(MUSIC_SOURCE_PATH, {});`,
  "music source storage"
);

insertAfter(
  `const jobs = new Map();`,
  `\nconst execFileAsync = promisify(execFile);\nconst ytmusicLoginStates = new Map();`,
  "execFileAsync helper"
);

replaceOnce(
  `    if (url.pathname === "/spotify/login") {`,
  `    if (url.pathname === "/ytmusic/connect") {\n      await handleYoutubeMusicConnect(url, res);\n      return;\n    }\n\n    if (url.pathname === "/ytmusic/status") {\n      await handleYoutubeMusicStatus(url, res);\n      return;\n    }\n\n    if (url.pathname === "/spotify/login") {`,
  "YouTube Music OAuth routes"
);

replaceOnce(
  `  if (update.callback_query) {\n    await telegram("answerCallbackQuery", {\n      callback_query_id: update.callback_query.id,\n      text: "Still preparing the audio..."\n    });\n    return;\n  }`,
  `  if (update.callback_query) {\n    await handleCallbackQuery(update.callback_query);\n    return;\n  }`,
  "music source callbacks"
);

replaceOnce(
  `  if (update.message?.text === "/start") {\n    const loginUrl = makeLoginUrl(update.message.from.id);\n    await telegram("sendMessage", {\n      chat_id: update.message.chat.id,\n      text: "Connect Spotify, then use me inline.",\n      reply_markup: {\n        inline_keyboard: [[{ text: "Connect Spotify", url: loginUrl }]]\n      }\n    });\n  }`,
  `  if (update.message?.text === "/start") {\n    await sendStartMessage(update.message);\n  }`,
  "music source start message"
);

replaceOnce(
  `async function handleInlineQuery(query) {\n  const telegramUserId = String(query.from.id);\n\n  if (!spotifyTokens[telegramUserId]) {`,
  `async function handleInlineQuery(query) {\n  const telegramUserId = String(query.from.id);\n  const youtubeTrack = await getYoutubeInlineTrack(query.query);\n\n  if (youtubeTrack) {\n    await answerWithYoutubeResult(query.id, telegramUserId, youtubeTrack);\n    return;\n  }\n\n  if (!spotifyTokens[telegramUserId]) {`,
  "inline YouTube branch"
);

replaceOnce(
  `  if (youtubeTrack) {\n    await answerWithYoutubeResult(query.id, telegramUserId, youtubeTrack);\n    return;\n  }\n\n  if (!spotifyTokens[telegramUserId]) {`,
  `  if (youtubeTrack) {\n    await answerWithYoutubeResult(query.id, telegramUserId, youtubeTrack);\n    return;\n  }\n\n  if (getMusicSource(telegramUserId) === "ytmusic") {\n    if (!hasYoutubeMusicToken(telegramUserId)) {\n      await answerWithYoutubeMusicConnectResult(query.id, telegramUserId);\n      return;\n    }\n\n    try {\n      const tracks = await getYoutubeMusicHistory(telegramUserId);\n      await answerWithMusicTracks(query.id, telegramUserId, tracks);\n    } catch (err) {\n      console.error("YouTube Music history failed:", err);\n      await answerWithYoutubeMusicConnectResult(query.id, telegramUserId, "Reconnect YouTube Music");\n    }\n    return;\n  }\n\n  if (!spotifyTokens[telegramUserId]) {`,
  "YouTube Music inline history"
);

replaceOnce(
  `async function answerWithConnectResult(inlineQueryId, telegramUserId, title = "Connect Spotify") {`,
  `async function answerWithYoutubeResult(inlineQueryId, telegramUserId, track) {\n  const resultId = makeYoutubeResultId(telegramUserId, track);\n  chosenTracks.set(resultId, track);\n\n  await telegram("answerInlineQuery", {\n    inline_query_id: inlineQueryId,\n    results: [{\n      type: "article",\n      id: resultId,\n      title: track.title,\n      description: "YouTube link - tap to fetch audio",\n      thumbnail_url: track.artwork,\n      input_message_content: {\n        message_text: "Preparing audio for:\\n" + track.title + "\\n" + track.artist\n      },\n      reply_markup: {\n        inline_keyboard: [[{ text: "Loading audio...", callback_data: "loading" }]]\n      }\n    }],\n    cache_time: 0,\n    is_personal: true\n  });\n}\n\nasync function answerWithYoutubeMusicConnectResult(inlineQueryId, telegramUserId, title = "Connect YouTube Music") {\n  await telegram("answerInlineQuery", {\n    inline_query_id: inlineQueryId,\n    results: [{\n      type: "article",\n      id: "ytmusic-connect",\n      title,\n      description: "Connect your YouTube Music history",\n      input_message_content: { message_text: "Connect YouTube Music, then try again." },\n      reply_markup: {\n        inline_keyboard: [[{ text: "Connect YouTube Music", url: makeYoutubeMusicLoginUrl(telegramUserId) }]]\n      }\n    }],\n    cache_time: 1,\n    is_personal: true\n  });\n}\n\nasync function answerWithMusicTracks(inlineQueryId, telegramUserId, tracks) {\n  if (!tracks.length) {\n    await telegram("answerInlineQuery", {\n      inline_query_id: inlineQueryId,\n      results: [{ type: "article", id: "no-ytmusic-history", title: "No YouTube Music history", description: "Play something in YouTube Music, then try again.", input_message_content: { message_text: "No YouTube Music history found." } }],\n      cache_time: 1,\n      is_personal: true\n    });\n    return;\n  }\n\n  const results = tracks.map((track, index) => {\n    const resultId = makeResultId(telegramUserId, track, index);\n    chosenTracks.set(resultId, track);\n    return {\n      type: "article",\n      id: resultId,\n      title: track.title,\n      description: track.artist + " - " + track.album,\n      thumbnail_url: track.artwork,\n      input_message_content: { message_text: "Preparing audio for:\\n" + track.title + "\\n" + track.artist },\n      reply_markup: { inline_keyboard: [[{ text: "Loading audio...", callback_data: "loading" }]] }\n    };\n  });\n\n  await telegram("answerInlineQuery", { inline_query_id: inlineQueryId, results, cache_time: 0, is_personal: true });\n}\n\nasync function answerWithConnectResult(inlineQueryId, telegramUserId, title = "Connect Spotify") {`,
  "YouTube and YouTube Music inline result helpers"
);

replaceOnce(
  `async function resolveSongLinks(track) {\n  const fallbackOther = track.spotifyId ? ` + "`https://song.link/s/${track.spotifyId}`" + ` : track.spotifyUrl;`,
  `async function resolveSongLinks(track) {\n  if (track.youtubeUrl) {\n    return {\n      spotify: undefined,\n      appleMusic: undefined,\n      youtubeMusic: track.youtubeUrl,\n      other: track.youtubeUrl\n    };\n  }\n\n  const fallbackOther = track.spotifyId ? ` + "`https://song.link/s/${track.spotifyId}`" + ` : track.spotifyUrl;`,
  "YouTube song links"
);

const helper = `
async function downloadYoutubeAudio(track) {
  const sourceUrl = track.youtubeUrl || "ytsearch1:" + track.title + " " + track.artist;

  const fileBase = makeAudioFileBase(track, sourceUrl);
  const cachedFileName = findCachedAudioFile(fileBase);

  if (cachedFileName) {
    return buildLocalAudioResult(track, cachedFileName);
  }

  await runYtConverterDownload(sourceUrl, AUDIO_DIR, fileBase);

  const downloadedFileName = findCachedAudioFile(fileBase);
  if (!downloadedFileName) {
    throw new Error("ytconverter finished without producing an audio file.");
  }

  return buildLocalAudioResult(track, downloadedFileName);
}

function makeAudioFileBase(track, sourceUrl) {
  const label = [track.artist, track.title].filter(Boolean).join(" - ");
  return safeSegment(label || track.youtubeId || createHash("sha256").update(sourceUrl).digest("hex"));
}

async function runYtConverterDownload(sourceUrl, outputDir, fileBase) {
  const payload = Buffer.from(JSON.stringify({
    url: sourceUrl,
    outputDir,
    fileBase,
    audioFormat: YTCONVERTER_AUDIO_EXTENSION,
    audioQuality: YTCONVERTER_AUDIO_QUALITY
  })).toString("base64");

  const script = \`
import base64
import builtins
import json
import os
import re
import sys
from pathlib import Path

payload = json.loads(base64.b64decode(sys.argv[1]).decode("utf-8"))
if payload["audioFormat"].lower() != "mp3":
    raise SystemExit("ytconverter single_mp3 supports only MP3 output")

output_dir = Path(payload["outputDir"])
output_dir.mkdir(parents=True, exist_ok=True)
cookie_b64 = os.environ.get("YT_COOKIES_FILE_BASE64")
if cookie_b64:
    cookie_path = output_dir / ".yt-cookies.txt"
    cookie_path.write_bytes(base64.b64decode(cookie_b64))
    config_home = output_dir / ".yt-dlp-config"
    config_dir = config_home / "yt-dlp"
    config_dir.mkdir(parents=True, exist_ok=True)
    (config_dir / "config").write_text("--cookies\\\\n" + str(cookie_path) + "\\\\n")
    os.environ["XDG_CONFIG_HOME"] = str(config_home)

before = {
    path.resolve() for path in output_dir.iterdir()
    if path.is_file() and not path.name.startswith(".")
}
answers = iter([payload["url"], "0", str(output_dir)])
builtins.input = lambda prompt="": next(answers)

import ytconverter.downloaders.single_mp3 as single_mp3
single_mp3.URL_RE = re.compile(r".+")
original_check_output = single_mp3.sp.check_output
original_run = single_mp3.sp.run

def yt_dlp_module_command(command):
    if command and command[0] == "yt-dlp":
        command = command[1:]
        runtime = [sys.executable, "-m", "yt_dlp", "--js-runtimes", "node"]
        if "-x" in command:
            return [*runtime, "--add-metadata", "--embed-thumbnail", *command]
        return [*runtime, *command]
    return command

def check_output(command, *args, **kwargs):
    kwargs.pop("stderr", None)
    return original_check_output(yt_dlp_module_command(command), *args, **kwargs)

def run(command, *args, **kwargs):
    return original_run(yt_dlp_module_command(command), *args, **kwargs)

single_mp3.sp.check_output = check_output
single_mp3.sp.run = run
single_mp3.run()

created = [
    path for path in output_dir.iterdir()
    if path.is_file() and not path.name.startswith(".") and path.resolve() not in before
]
if not created:
    raise SystemExit("ytconverter did not create an audio file")

created.sort(key=lambda path: path.stat().st_mtime, reverse=True)
created[0].rename(output_dir / (payload["fileBase"] + ".mp3"))
\`;

  const errors = [];
  for (const command of getPythonCommands()) {
    try {
      await execFileAsync(command, ["-c", script, payload], {
        maxBuffer: 1024 * 1024 * 4,
        timeout: Number(process.env.YTCONVERTER_TIMEOUT_MS || 180000),
        windowsHide: true
      });
      return;
    } catch (err) {
      const detail = String(err.stderr || err.message);
      errors.push(\`\${command}: \${detail.slice(-1200)}\`);
    }
  }

  throw new Error(\`ytconverter download failed: \${errors.join("; ").slice(-1200)}\`);
}

async function getYoutubeInlineTrack(queryText) {
  const youtubeUrl = extractYoutubeUrl(queryText);
  if (!youtubeUrl) return undefined;

  const youtubeId = getYoutubeVideoId(youtubeUrl);
  const normalizedUrl = youtubeId ? \`https://music.youtube.com/watch?v=\${youtubeId}\` : youtubeUrl;
  const title = await getYoutubeTitle(normalizedUrl);

  return {
    source: "youtube",
    youtubeId,
    youtubeUrl: normalizedUrl,
    spotifyId: youtubeId ? \`yt:\${youtubeId}\` : undefined,
    title,
    artist: "YouTube",
    album: "Direct link",
    artwork: youtubeId ? \`https://img.youtube.com/vi/\${youtubeId}/mqdefault.jpg\` : undefined,
    playedAt: new Date().toISOString(),
    spotifyUrl: undefined
  };
}

function makeYoutubeResultId(telegramUserId, track) {
  const raw = [telegramUserId, track.youtubeId || track.youtubeUrl, track.title].join(":");
  return "yt:" + createHash("sha256").update(raw).digest("base64url").slice(0, 32);
}

function extractYoutubeUrl(queryText) {
  const text = String(queryText || "").trim();
  if (!text) return undefined;

  const match = text.match(/(?:https?:\\/\\/)?(?:www\\.|m\\.)?(?:youtube\\.com|music\\.youtube\\.com|youtu\\.be)\\/[^\\s<>]+/i);
  if (!match) return undefined;

  const raw = match[0].startsWith("http") ? match[0] : \`https://\${match[0]}\`;
  try {
    const url = new URL(raw);
    if (!isYoutubeHost(url.hostname)) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function isYoutubeHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  return host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com");
}

function getYoutubeVideoId(youtubeUrl) {
  try {
    const url = new URL(youtubeUrl);
    if (url.hostname.toLowerCase() === "youtu.be") {
      return url.pathname.split("/").filter(Boolean)[0];
    }
    if (url.pathname === "/watch") {
      return url.searchParams.get("v") || undefined;
    }
    const parts = url.pathname.split("/").filter(Boolean);
    if (["shorts", "embed", "live"].includes(parts[0])) return parts[1];
  } catch {
    return undefined;
  }
  return undefined;
}

async function getYoutubeTitle(youtubeUrl) {
  try {
    const url = new URL("https://www.youtube.com/oembed");
    url.searchParams.set("url", youtubeUrl);
    url.searchParams.set("format", "json");

    const res = await fetch(url);
    if (!res.ok) throw new Error(\`YouTube oEmbed failed: \${res.status}\`);

    const data = await res.json();
    return data.title || "YouTube audio";
  } catch (err) {
    console.error("YouTube title lookup failed:", err);
    return "YouTube audio";
  }
}

function getPythonCommands() {
  return [process.env.PYTHON_BIN, "python3", "python"].filter(Boolean);
}
`;

const ytmusicHelper = `
async function sendStartMessage(message) {
  const buttons = [];
  if (hasSpotifyConfiguration()) buttons.push([{ text: "Connect Spotify", url: makeLoginUrl(message.from.id) }]);
  if (hasYoutubeMusicConfiguration()) buttons.push([{ text: "Connect YouTube Music", url: makeYoutubeMusicLoginUrl(message.from.id) }]);
  buttons.push([
    { text: "Use Spotify", callback_data: "source:spotify" },
    { text: "Use YouTube Music", callback_data: "source:ytmusic" }
  ]);

  await telegram("sendMessage", {
    chat_id: message.chat.id,
    text: "Choose a music service, then use me inline.",
    reply_markup: { inline_keyboard: buttons }
  });
}

async function handleCallbackQuery(query) {
  const source = String(query.data || "").replace("source:", "");
  if (source === "spotify" || source === "ytmusic") {
    musicSources[String(query.from.id)] = source;
    saveMusicSources();
    await telegram("answerCallbackQuery", {
      callback_query_id: query.id,
      text: source === "ytmusic" ? "YouTube Music selected" : "Spotify selected"
    });
    return;
  }

  await telegram("answerCallbackQuery", {
    callback_query_id: query.id,
    text: "Still preparing the audio..."
  });
}

function hasSpotifyConfiguration() {
  return Boolean(SPOTIFY_CLIENT_ID && SPOTIFY_CLIENT_SECRET);
}

function hasYoutubeMusicConfiguration() {
  return Boolean(YTMUSIC_CLIENT_ID && YTMUSIC_CLIENT_SECRET);
}

function getMusicSource(telegramUserId) {
  return musicSources[telegramUserId] || (hasSpotifyConfiguration() ? "spotify" : "ytmusic");
}

function saveMusicSources() {
  writeFileSync(MUSIC_SOURCE_PATH, JSON.stringify(musicSources, null, 2));
}

function makeYoutubeMusicLoginUrl(telegramUserId) {
  const url = new URL(PUBLIC_BASE_URL + "/ytmusic/connect");
  url.searchParams.set("telegram_user_id", String(telegramUserId));
  return url.toString();
}

function getYoutubeMusicTokenPath(telegramUserId) {
  return join(YTMUSIC_TOKEN_DIR, String(telegramUserId), "oauth.json");
}

function hasYoutubeMusicToken(telegramUserId) {
  return existsSync(getYoutubeMusicTokenPath(telegramUserId));
}

async function handleYoutubeMusicConnect(url, res) {
  const telegramUserId = url.searchParams.get("telegram_user_id");
  if (!telegramUserId || !/^\\d+$/.test(telegramUserId)) {
    sendText(res, 400, "missing telegram_user_id");
    return;
  }
  if (!hasYoutubeMusicConfiguration()) {
    sendText(res, 503, "YouTube Music is not configured.");
    return;
  }

  const authorization = await runYoutubeMusicBridge("start", {});
  if (!authorization.device_code || !authorization.user_code) {
    throw new Error("YouTube Music did not return a device authorization code.");
  }

  const state = randomBytes(24).toString("hex");
  ytmusicLoginStates.set(state, {
    telegramUserId,
    deviceCode: authorization.device_code,
    expiresAt: Date.now() + Number(authorization.expires_in || 1800) * 1000
  });

  const verificationUrl = new URL(authorization.verification_url || authorization.verification_uri || "https://www.google.com/device");
  verificationUrl.searchParams.set("user_code", authorization.user_code);
  const statusUrl = new URL(PUBLIC_BASE_URL + "/ytmusic/status");
  statusUrl.searchParams.set("state", state);
  sendHtml(res, 200, "<h1>Connect YouTube Music</h1><p><a href=\"" + escapeHtml(verificationUrl.toString()) + "\">Open Google and continue</a></p><p>Code: <strong>" + escapeHtml(authorization.user_code) + "</strong></p><p>This page will finish automatically after approval.</p><meta http-equiv=\"refresh\" content=\"4; url=" + escapeHtml(statusUrl.toString()) + "\">");
}

async function handleYoutubeMusicStatus(url, res) {
  const state = url.searchParams.get("state");
  const pending = state ? ytmusicLoginStates.get(state) : undefined;
  if (!pending || pending.expiresAt < Date.now()) {
    if (state) ytmusicLoginStates.delete(state);
    sendText(res, 400, "YouTube Music connection expired. Return to Telegram and start again.");
    return;
  }

  const result = await runYoutubeMusicBridge("complete", {
    deviceCode: pending.deviceCode,
    tokenPath: getYoutubeMusicTokenPath(pending.telegramUserId)
  });
  if (result.state === "connected") {
    ytmusicLoginStates.delete(state);
    sendHtml(res, 200, "<h1>YouTube Music connected</h1><p>Return to Telegram and use the bot inline.</p>");
    return;
  }
  if (result.state === "authorization_pending" || result.state === "slow_down") {
    const statusUrl = new URL(PUBLIC_BASE_URL + "/ytmusic/status");
    statusUrl.searchParams.set("state", state);
    sendHtml(res, 200, "<h1>Waiting for Google approval</h1><p>Finish the approval in the Google page, then this page will continue automatically.</p><meta http-equiv=\"refresh\" content=\"4; url=" + escapeHtml(statusUrl.toString()) + "\">");
    return;
  }

  ytmusicLoginStates.delete(state);
  throw new Error("YouTube Music connection failed: " + (result.state || "unknown error"));
}

async function getYoutubeMusicHistory(telegramUserId) {
  const result = await runYoutubeMusicBridge("history", {
    tokenPath: getYoutubeMusicTokenPath(telegramUserId),
    limit: 10
  });
  return (result.tracks || []).map((track, index) => ({
    ...track,
    source: "ytmusic",
    spotifyId: "yt:" + (track.youtubeId || index),
    spotifyUrl: undefined,
    playedAt: new Date(Date.now() - index * 1000).toISOString()
  }));
}

async function runYoutubeMusicBridge(action, payload) {
  const argument = Buffer.from(JSON.stringify(payload)).toString("base64");
  const bridgePath = new URL("./ytmusic-bridge.py", import.meta.url).pathname;
  let lastError;

  for (const command of getPythonCommands()) {
    try {
      const { stdout } = await execFileAsync(command, [bridgePath, action, argument], {
        maxBuffer: 1024 * 1024,
        timeout: 30000,
        windowsHide: true
      });
      const result = JSON.parse(stdout.trim());
      if (result.error) throw new Error(result.error);
      return result;
    } catch (err) {
      const output = String(err.stdout || "").trim();
      if (output) {
        try {
          const result = JSON.parse(output);
          if (result.error) throw new Error(result.error);
          return result;
        } catch (parseError) {
          lastError = parseError;
          continue;
        }
      }
      lastError = err;
    }
  }

  throw lastError || new Error("YouTube Music helper could not start.");
}
`;

if (!source.includes("async function downloadYoutubeAudio(track)")) {
  const insertionPoint = "\nasync function answerWithYoutubeResult";
  if (!source.includes(insertionPoint)) {
    throw new Error("Could not insert YouTube download helpers.");
  }
  source = source.replace(insertionPoint, `${helper}${insertionPoint}`);
  changed = true;
}

if (!source.includes("async function getYoutubeMusicHistory(telegramUserId)")) {
  const insertionPoint = "\nasync function getRecentlyPlayed(telegramUserId)";
  if (!source.includes(insertionPoint)) {
    throw new Error("Could not insert YouTube Music helpers.");
  }
  source = source.replace(insertionPoint, `${ytmusicHelper}${insertionPoint}`);
  changed = true;
}

if (changed) {
  writeFileSync(indexPath, source);
  console.log("Applied YouTube inline support with ytconverter audio downloads.");
}

