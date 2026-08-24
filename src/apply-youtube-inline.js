import { readFileSync, writeFileSync } from "node:fs";

const indexPath = new URL("./index.js", import.meta.url);
let source = readFileSync(indexPath, "utf8");
let changed = false;

function replaceOnce(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Could not apply YouTube patch. Missing ${label}.`);
  }
  source = source.replace(before, after);
  changed = true;
}

function replacePatternOnce(pattern, replacement, label) {
  if (!pattern.test(source)) return;
  source = source.replace(pattern, replacement);
  changed = true;
}

function insertAfter(needle, insertion, label) {
  if (source.includes(insertion)) return;
  if (!source.includes(needle)) {
    throw new Error(`Could not apply YouTube patch. Missing ${label}.`);
  }
  source = source.replace(needle, `${needle}${insertion}`);
  changed = true;
}

replacePatternOnce(
  /const AUDIO_PROVIDER = [^\n]+\nconst TELEGRAM_MEDIA_TYPE = [^\n]+\nconst SPOOTY_BASE_URL = [^\n]+\nconst SPOOTY_POLL_INTERVAL_MS = [^\n]+\nconst SPOOTY_POLL_TIMEOUT_MS = [^\n]+\nconst SPOOTY_AUDIO_EXTENSION = [^\n]+\n/,
  `const TELEGRAM_MEDIA_TYPE = process.env.TELEGRAM_MEDIA_TYPE || "audio";\n`,
  "Spooty configuration"
);

replacePatternOnce(
  /if \(AUDIO_PROVIDER === "spooty" && !SPOOTY_BASE_URL\) errors\.push\("SPOOTY_BASE_URL"\);\n/,
  "",
  "Spooty validation"
);

replacePatternOnce(
  /await editText\(inlineMessageId, `Loading audio\.\.\.\\n\$\{spotifyTrack\.title\}\\n\$\{spotifyTrack\.artist\} - \$\{spotifyTrack\.album\}`\);/,
  `await editText(inlineMessageId, "Loading... \\u{1F504}");`,
  "encoding-safe loading message"
);

replacePatternOnce(
  /  if \(!SPOTIFY_CLIENT_ID\) errors\.push\("SPOTIFY_CLIENT_ID"\);\n  if \(!SPOTIFY_CLIENT_SECRET\) errors\.push\("SPOTIFY_CLIENT_SECRET"\);\n/,
  "",
  "optional Spotify configuration"
);

replacePatternOnce(
  /async function resolveAudio\(spotifyTrack\) \{[\s\S]*?\n\}/,
  `async function resolveAudio(track) {
  return downloadYoutubeAudio(track);
}`,
  "ytconverter audio provider"
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
  "Spooty downloader"
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
  `\nconst YTCONVERTER_AUDIO_EXTENSION = normalizeAudioExtension(process.env.YTCONVERTER_AUDIO_EXTENSION || "mp3");\nconst YTCONVERTER_AUDIO_QUALITY = String(process.env.YTCONVERTER_AUDIO_QUALITY || "192");`,
  "ytconverter configuration"
);

insertAfter(
  `const TOKEN_PATH = join(DATA_DIR, "spotify-tokens.json");`,
  `\nconst KNOWN_USER_PATH = join(DATA_DIR, "known-users.json");\nconst DOWNLOAD_HISTORY_PATH = join(DATA_DIR, "download-history.json");
const OWNER_TELEGRAM_ID = "443036991";
const BOOTSTRAP_USERS = process.env.BOOTSTRAP_USERS || "";`,
  "new user notification paths"
);

insertAfter(
  `const spotifyTokens = loadJson(TOKEN_PATH, {});`,
  `\nconst knownUsers = loadJson(KNOWN_USER_PATH, {});
const downloadHistory = loadJson(DOWNLOAD_HISTORY_PATH, {});
seedKnownUsersFromEnvironment();`,
  "new user storage"
);

insertAfter(
  `const jobs = new Map();`,
  `\nconst execFileAsync = promisify(execFile);\nconst songLinkLookups = new Map();`,
  "metadata lookup cache"
);

replaceOnce(
  `  if (update.message?.text === "/start") {\n    const loginUrl = makeLoginUrl(update.message.from.id);`,
  `  if (update.message?.text === "/start") {\n    await notifyOwnerAboutNewUser(update.message.from);\n    const loginUrl = makeLoginUrl(update.message.from.id);`,
  "new user notification on start"
);
replaceOnce(
  `  if (update.message?.text === "/start") {\n    await notifyOwnerAboutNewUser(update.message.from);\n    const loginUrl = makeLoginUrl(update.message.from.id);`,
  `  if (update.message?.text?.startsWith("/")) {\n    if (await handleAdminCommand(update.message)) return;\n  }\n\n  if (update.message?.text === "/start") {\n    await notifyOwnerAboutNewUser(update.message.from);\n    const loginUrl = makeLoginUrl(update.message.from.id);`,
  "admin command handling"
);

replaceOnce(
  `  jobs.set(jobKey, prepareAndSwap(chosen.inline_message_id, track).finally(() => jobs.delete(jobKey)));`,
  `  jobs.set(jobKey, prepareAndSwap(chosen.inline_message_id, track, chosen.from).finally(() => jobs.delete(jobKey)));`,
  "download user handoff"
);

replaceOnce(
  `async function prepareAndSwap(inlineMessageId, spotifyTrack) {`,
  `async function prepareAndSwap(inlineMessageId, spotifyTrack, telegramUser) {`,
  "download user signature"
);

replaceOnce(
  `    await editInlineMedia(inlineMessageId, audio, spotifyTrack, links);`,
  `    await editInlineMedia(inlineMessageId, audio, spotifyTrack, links);\n    if (telegramUser) {\n      await notifyOwnerAboutNewUser(telegramUser);\n      recordDownload(telegramUser.id, spotifyTrack);\n    }`,
  "download history record"
);

replaceOnce(
  `  authUrl.searchParams.set("scope", SPOTIFY_SCOPE);\n  authUrl.searchParams.set("state", state);`,
  `  authUrl.searchParams.set("scope", SPOTIFY_SCOPE);\n  authUrl.searchParams.set("show_dialog", "true");\n  authUrl.searchParams.set("state", state);`,
  "Spotify playback scope consent"
);

replaceOnce(
  `async function handleInlineQuery(query) {\n  const telegramUserId = String(query.from.id);\n\n  if (!spotifyTokens[telegramUserId]) {`,
  `async function handleInlineQuery(query) {\n  const telegramUserId = String(query.from.id);\n  const youtubeTrack = await getYoutubeInlineTrack(query.query);\n\n  if (youtubeTrack) {\n    await answerWithYoutubeResult(query.id, telegramUserId, await enrichTrackWithSongLink(youtubeTrack));\n    return;\n  }\n\n  if (!spotifyTokens[telegramUserId]) {`,
  "inline YouTube branch"
);

replaceOnce(
  `async function answerWithConnectResult(inlineQueryId, telegramUserId, title = "Connect Spotify") {`,
  `async function answerWithYoutubeResult(inlineQueryId, telegramUserId, track) {\n  const resultId = makeYoutubeResultId(telegramUserId, track);\n  chosenTracks.set(resultId, track);\n\n  await telegram("answerInlineQuery", {\n    inline_query_id: inlineQueryId,\n    results: [{\n      type: "article",\n      id: resultId,\n      title: track.title,\n      description: track.artist + " - " + track.album,\n      thumbnail_url: track.inlineArtwork || track.artwork,\n      input_message_content: { message_text: "Preparing audio for:\\n" + track.title + "\\n" + track.artist },\n      reply_markup: { inline_keyboard: [[{ text: "Loading audio...", callback_data: "loading" }]] }\n    }],\n    cache_time: 0,\n    is_personal: true\n  });\n}\n\nasync function answerWithConnectResult(inlineQueryId, telegramUserId, title = "Connect Spotify") {`,
  "YouTube inline result"
);

replacePatternOnce(
  /async function resolveSongLinks\(track\) \{[\s\S]*?\n\}\n\nfunction buildAudioCaption\(spotifyTrack, audio, links\) \{[\s\S]*?\n\}/,
  `async function resolveSongLinks(track) {
  const enriched = await enrichTrackWithSongLink(track);
  const spotify = enriched.spotifyUrl || makeSpotifySearchUrl(enriched.title, enriched.artist);
  const fallbackSongLink = track.spotifyId && !String(track.spotifyId).includes(":") ? "https://song.link/s/" + track.spotifyId : undefined;
  return {
    spotify,
    youtubeMusic: enriched.youtubeUrl || "https://music.youtube.com/search?q=" + encodeURIComponent([enriched.title, enriched.artist].filter(Boolean).join(" ")),
    songLink: enriched.songLinkUrl || fallbackSongLink
  };
}

function buildAudioCaption(track, audio, links) {
  const linkParts = [
    links.spotify ? makeHtmlLink("Spotify", links.spotify) : undefined,
    links.youtubeMusic ? makeHtmlLink("Youtube Music ", links.youtubeMusic) + "ÃÆÃÆÃâ ÃâÃÆÃâÃâÃÂ°ÃÆÃÆÃÂ¢Ãâ¬ÃÂ¦ÃÆÃâÃâÃÂ¸ÃÆÃÆÃÂ¢Ãâ¬ÃÂ¹ÃÆÃâÃâ¦ÃâÃÆÃÆÃâÃÂ¢ÃÆÃâÃÂ¢ÃâÃÂ¬ÃÆÃâÃÂ¢ÃâÃÂ¢" : undefined,
    links.songLink ? makeHtmlLink("Other", links.songLink) : undefined
  ].filter(Boolean);

  return linkParts.length ? "ÃÆÃÆÃâ ÃâÃÆÃâÃâÃÂ°ÃÆÃÆÃÂ¢Ãâ¬ÃÂ¦ÃÆÃâÃâÃÂ¸ÃÆÃÆÃâÃÂ¢ÃÆÃâÃÂ¢ÃâÃÂ¬ÃÆÃâÃÂ¢ÃâÃÂ¢ÃÆÃÆÃâÃÂ¢ÃÆÃâÃÂ¢ÃâÃÂ¬ÃÆÃâÃâÃÂ¹ " + linkParts.join(" | ") : undefined;
}`,
  "Song.link caption and links"
);

replacePatternOnce(
  /links\.youtubeMusic \? makeHtmlLink\("Youtube Music ", links\.youtubeMusic\) \+ "[^"]*" : undefined,/,
  `links.youtubeMusic ? makeHtmlLink("Youtube Music ", links.youtubeMusic) + "\\u{1F612}" : undefined,`,
  "encoding-safe YouTube Music emoji"
);

replacePatternOnce(
  /return linkParts\.length \? "[^"]* " \+ linkParts\.join\(" \| "\) : undefined;/,
  `return linkParts.length ? "\\u{1F48B} " + linkParts.join(" | ") : undefined;`,
  "encoding-safe caption emoji"
);

replaceOnce(
  `      reply_markup: { inline_keyboard: [[{ text: "Loading audio...", callback_data: "loading" }]] }\n    }],\n    cache_time: 0,\n    is_personal: true\n  });\n}\n\nasync function answerWithConnectResult`,
  `      reply_markup: { inline_keyboard: [[{ text: "Loading... \\u{1F504}", callback_data: "loading" }]] }\n    }],\n    cache_time: 0,\n    is_personal: true\n  });\n}\n\nasync function answerWithConnectResult`,
  "encoding-safe YouTube loading label"
);

const helper = `
async function notifyOwnerAboutNewUser(user) {
  if (!user || String(user.id) === OWNER_TELEGRAM_ID) return;

  const userId = String(user.id);
  if (knownUsers[userId]) return;

  const displayName = user.username ? "@" + user.username : [user.first_name, user.last_name].filter(Boolean).join(" ") || "Unknown user";
  knownUsers[userId] = { username: user.username || undefined, displayName, startedAt: new Date().toISOString() };
  saveKnownUsers();

  try {
    await telegram("sendMessage", { chat_id: OWNER_TELEGRAM_ID, text: "New bot user: " + displayName + " (" + userId + ")" });
  } catch (err) {
    console.error("New user notification failed:", err);
  }
}



function saveKnownUsers() {
  writeFileSync(KNOWN_USER_PATH, JSON.stringify(knownUsers, null, 2));
}

function normalizeUsername(value) {
  const username = String(value || "").trim().replace(/^@/, "");
  return username || undefined;
}

function resolveKnownUser(query) {
  const value = String(query || "").trim().replace(/^@/, "").toLowerCase();
  if (!value) return undefined;
  return Object.keys(knownUsers).find((id) => {
    const user = knownUsers[id] || {};
    return id === value || String(user.username || "").toLowerCase() === value;
  });
}

function seedKnownUsersFromEnvironment() {
  let changed = false;
  for (const entry of BOOTSTRAP_USERS.split(",")) {
    const [rawId, rawUsername] = entry.trim().split(":", 2);
    const userId = String(rawId || "").trim();
    if (!/^\\d+$/.test(userId) || userId === OWNER_TELEGRAM_ID) continue;
    if (knownUsers[userId]) continue;

    const username = normalizeUsername(rawUsername);
    knownUsers[userId] = {
      username,
      displayName: username ? "@" + username : userId,
      addedAt: new Date().toISOString(),
      manuallyAdded: true
    };
    changed = true;
  }
  if (changed) saveKnownUsers();
}

function recordDownload(telegramUserId, track) {
  if (!telegramUserId) return;
  const userId = String(telegramUserId);
  const entries = downloadHistory[userId] || [];
  entries.unshift({
    title: track.title || "Unknown title",
    artist: track.artist || "Unknown artist",
    album: track.album || undefined,
    source: track.source || (track.spotifyUrl ? "spotify" : "youtube"),
    downloadedAt: new Date().toISOString()
  });
  downloadHistory[userId] = entries.slice(0, 200);
  writeFileSync(DOWNLOAD_HISTORY_PATH, JSON.stringify(downloadHistory, null, 2));
}

async function handleAdminCommand(message) {
  const userId = String(message?.from?.id || "");
  if (userId !== OWNER_TELEGRAM_ID) return false;

  const words = String(message.text || "").trim().split(" ").filter(Boolean);
  const normalizedCommand = String(words.shift() || "").split("@")[0].toLowerCase();
  const lineBreak = String.fromCharCode(10);

  if (normalizedCommand === "/broadcast") {
    if (!message.reply_to_message) {
      await telegram("sendMessage", {
        chat_id: message.chat.id,
        text: "Reply to a message, then send /broadcast."
      });
      return true;
    }

    const recipients = Object.keys(knownUsers).filter((id) => id !== OWNER_TELEGRAM_ID);
    let sent = 0;
    let failed = 0;
    for (const chatId of recipients) {
      try {
        await telegram("copyMessage", {
          chat_id: chatId,
          from_chat_id: message.chat.id,
          message_id: message.reply_to_message.message_id
        });
        sent += 1;
      } catch (error) {
        failed += 1;
        console.warn("Broadcast delivery failed for", chatId, error.message);
      }
      await sleep(40);
    }

    await telegram("sendMessage", {
      chat_id: message.chat.id,
      text: "Broadcast complete. Sent: " + sent + ". Failed: " + failed + "."
    });
    return true;
  }


  if (normalizedCommand === "/adduser") {
    const targetId = String(words.shift() || "").trim();
    if (!/^\\d+$/.test(targetId)) {
      await telegram("sendMessage", {
        chat_id: message.chat.id,
        text: "Use /adduser followed by a numeric Telegram user ID, optionally then @username."
      });
      return true;
    }

    const username = normalizeUsername(words.shift());
    const existing = knownUsers[targetId] || {};
    knownUsers[targetId] = {
      ...existing,
      username: username || existing.username,
      displayName: username ? "@" + username : (existing.displayName || targetId),
      addedAt: existing.addedAt || new Date().toISOString(),
      manuallyAdded: true
    };
    saveKnownUsers();
    await telegram("sendMessage", {
      chat_id: message.chat.id,
      text: "Added " + (knownUsers[targetId].displayName || targetId) + " (" + targetId + ")."
    });
    return true;
  }

  if (normalizedCommand === "/removeuser") {
    const targetId = resolveKnownUser(words.join(" "));
    if (!targetId) {
      await telegram("sendMessage", {
        chat_id: message.chat.id,
        text: "Use /removeuser followed by a user ID or @username from /users."
      });
      return true;
    }

    const label = knownUsers[targetId]?.displayName || targetId;
    delete knownUsers[targetId];
    delete downloadHistory[targetId];
    saveKnownUsers();
    writeFileSync(DOWNLOAD_HISTORY_PATH, JSON.stringify(downloadHistory, null, 2));
    await telegram("sendMessage", {
      chat_id: message.chat.id,
      text: "Removed " + label + " (" + targetId + ") from broadcasts and history."
    });
    return true;
  }

  if (normalizedCommand === "/users") {
    const userIds = Object.keys(knownUsers);
    const lines = userIds.slice(0, 100).map((id) => {
      const user = knownUsers[id] || {};
      const label = user.displayName || (user.username ? "@" + user.username : id);
      return label + " (" + id + "): " + (downloadHistory[id] || []).length + " downloads";
    });
    const remaining = userIds.length - lines.length;
    await telegram("sendMessage", {
      chat_id: message.chat.id,
      text: lines.length
        ? "Users (" + userIds.length + "):" + lineBreak + lines.join(lineBreak) + (remaining > 0 ? lineBreak + "+" + remaining + " more" : "")
        : "No users recorded yet."
    });
    return true;
  }

  if (normalizedCommand === "/history") {
    const matchingId = resolveKnownUser(words.join(" "));

    if (!matchingId) {
      await telegram("sendMessage", {
        chat_id: message.chat.id,
        text: "Use /history followed by a user ID or @username from /users."
      });
      return true;
    }

    const user = knownUsers[matchingId] || {};
    const label = user.displayName || (user.username ? "@" + user.username : matchingId);
    const tracks = (downloadHistory[matchingId] || []).slice(0, 50);
    const lines = tracks.map((track) =>
      track.title + " - " + track.artist + " [" + track.source + "] " + String(track.downloadedAt || "").slice(0, 16).replace("T", " ")
    );
    await telegram("sendMessage", {
      chat_id: message.chat.id,
      text: lines.length
        ? "Downloads for " + label + " (" + matchingId + "):" + lineBreak + lines.join(lineBreak)
        : "No downloads recorded for " + label + " yet."
    });
    return true;
  }

  return false;
}

async function downloadYoutubeAudio(track) {
  const sourceUrl = track.youtubeUrl || "ytsearch1:" + track.title + " " + track.artist;
  const fileBase = makeAudioFileBase(track, sourceUrl);
  const cachedFileName = findCachedAudioFile(fileBase);

  if (cachedFileName) return buildLocalAudioResult(track, cachedFileName);

  try {
    await runYtConverterDownload(sourceUrl, AUDIO_DIR, fileBase, track, false);
  } catch (publicError) {
    if (!process.env.YT_COOKIES_FILE_BASE64 || !shouldRetryWithCookies(publicError)) {
      throw publicError;
    }

    console.warn("Public YouTube download was challenged; retrying with configured cookies.");
    await runYtConverterDownload(sourceUrl, AUDIO_DIR, fileBase, track, true);
  }

  const downloadedFileName = findCachedAudioFile(fileBase);
  if (!downloadedFileName) throw new Error("ytconverter finished without producing an audio file.");
  return buildLocalAudioResult(track, downloadedFileName);
}

function shouldRetryWithCookies(error) {
  return /sign in|not a bot|confirm you|age.restricted|private|members.only|\\b403\\b|forbidden/i.test(
    String(error?.message || error)
  );
}

function makeAudioFileBase(track, sourceUrl) {
  const label = safeSegment([track.artist, track.title].filter(Boolean).join(" - ") || "youtube-audio").slice(0, 56);
  const identity = track.youtubeId || sourceUrl;
  const uniqueSuffix = createHash("sha256").update(identity).digest("hex").slice(0, 16);
  return label + "-" + uniqueSuffix;
}

async function runYtConverterDownload(sourceUrl, outputDir, fileBase, track, useCookies) {
  const payload = Buffer.from(JSON.stringify({
    url: sourceUrl,
    outputDir,
    fileBase,
    audioFormat: YTCONVERTER_AUDIO_EXTENSION,
    audioQuality: YTCONVERTER_AUDIO_QUALITY,
    artworkUrl: track.artwork,
    title: track.title,
    artist: track.artist,
    album: track.album,
    useCookies
  })).toString("base64");

  const script = \`
import base64
import builtins
import json
import os
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

payload = json.loads(base64.b64decode(sys.argv[1]).decode("utf-8"))
if payload["audioFormat"].lower() != "mp3":
    raise SystemExit("ytconverter single_mp3 supports only MP3 output")

output_dir = Path(payload["outputDir"])
output_dir.mkdir(parents=True, exist_ok=True)
cookie_b64 = os.environ.get("YT_COOKIES_FILE_BASE64")
if payload.get("useCookies") and cookie_b64:
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
        runtime = [
            sys.executable, "-m", "yt_dlp",
            "--js-runtimes", "node",
            "--remote-components", "ejs:github"
        ]
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
audio_path = created[0]
try:
    artwork_path = None
    if payload.get("artworkUrl"):
        artwork_path = output_dir / ".song-cover.jpg"
        request = urllib.request.Request(payload["artworkUrl"], headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(request, timeout=20) as response:
            artwork_path.write_bytes(response.read())

    remuxed = output_dir / ".metadata.mp3"
    command = ["ffmpeg", "-y", "-i", str(audio_path)]
    if artwork_path and artwork_path.exists():
        command += ["-i", str(artwork_path), "-map", "0:a:0", "-map", "1:v:0", "-c:v", "mjpeg", "-disposition:v:0", "attached_pic"]
    else:
        command += ["-map", "0:a:0"]
    command += ["-c:a", "copy", "-id3v2_version", "3"]
    for name in ("title", "artist", "album"):
        if payload.get(name):
            command += ["-metadata", name + "=" + str(payload[name])]
    command += [str(remuxed)]
    subprocess.run(command, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    remuxed.replace(audio_path)
except Exception as error:
    print("Could not apply canonical metadata: " + str(error), file=sys.stderr)

audio_path.rename(output_dir / (payload["fileBase"] + ".mp3"))
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
      errors.push(command + ": " + String(err.stderr || err.message).slice(-1200));
    }
  }
  throw new Error("ytconverter download failed: " + errors.join("; ").slice(-1200));
}

async function getYoutubeInlineTrack(queryText) {
  const youtubeUrl = extractYoutubeUrl(queryText);
  if (!youtubeUrl) return undefined;

  const youtubeId = getYoutubeVideoId(youtubeUrl);
  const normalizedUrl = youtubeId ? "https://music.youtube.com/watch?v=" + youtubeId : youtubeUrl;
  const metadata = await getYoutubeMetadata(normalizedUrl);
  return {
    source: "youtube",
    youtubeId,
    youtubeUrl: normalizedUrl,
    title: metadata.title,
    artist: metadata.artist || "YouTube",
    album: "Direct link",
    artwork: youtubeId ? "https://img.youtube.com/vi/" + youtubeId + "/hqdefault.jpg" : undefined,
    inlineArtwork: youtubeId ? "https://img.youtube.com/vi/" + youtubeId + "/mqdefault.jpg" : undefined,
    playedAt: new Date().toISOString()
  };
}

async function enrichTrackWithSongLink(track) {
  const lookupUrl = track.spotifyUrl || track.youtubeUrl;
  if (!lookupUrl) return { ...track, spotifyUrl: makeSpotifySearchUrl(track.title, track.artist) };

  try {
    const data = await getSongLinkLookup(lookupUrl);
    const entity = data.entitiesByUniqueId?.[data.entityUniqueId] || {};
    const title = entity.title || track.title;
    const artist = entity.artistName || track.artist;
    return {
      ...track,
      title,
      artist,
      album: entity.albumName || track.album,
      artwork: track.artwork,
      spotifyUrl: data.linksByPlatform?.spotify?.url || track.spotifyUrl || makeSpotifySearchUrl(title, artist),
      appleMusicUrl: data.linksByPlatform?.appleMusic?.url,
      songLinkUrl: data.pageUrl
    };
  } catch (err) {
    console.error("Song.link metadata lookup failed:", err);
    return { ...track, spotifyUrl: track.spotifyUrl || makeSpotifySearchUrl(track.title, track.artist) };
  }
}

async function getSongLinkLookup(url) {
  if (!songLinkLookups.has(url)) {
    songLinkLookups.set(url, (async () => {
      const apiUrl = new URL("https://api.song.link/v1-alpha.1/links");
      apiUrl.searchParams.set("url", url);
      if (SONGLINK_API_KEY) apiUrl.searchParams.set("key", SONGLINK_API_KEY);
      const res = await fetch(apiUrl);
      if (!res.ok) throw new Error("Song.link failed: " + res.status);
      return res.json();
    })());
  }
  return songLinkLookups.get(url);
}

function makeSpotifySearchUrl(title, artist) {
  return "https://open.spotify.com/search/" + encodeURIComponent([title, artist].filter(Boolean).join(" "));
}

function makeYoutubeResultId(telegramUserId, track) {
  const raw = [telegramUserId, track.youtubeId || track.youtubeUrl, track.title].join(":");
  return "yt:" + createHash("sha256").update(raw).digest("base64url").slice(0, 32);
}

function extractYoutubeUrl(queryText) {
  const text = String(queryText || "").trim();
  const match = text.match(/(?:https?:\\/\\/)?(?:www\\.|m\\.)?(?:youtube\\.com|music\\.youtube\\.com|youtu\\.be)\\/[^\\s<>]+/i);
  if (!match) return undefined;
  const raw = match[0].startsWith("http") ? match[0] : "https://" + match[0];
  try {
    const url = new URL(raw);
    return isYoutubeHost(url.hostname) ? url.toString() : undefined;
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
    if (url.hostname.toLowerCase() === "youtu.be") return url.pathname.split("/").filter(Boolean)[0];
    if (url.pathname === "/watch") return url.searchParams.get("v") || undefined;
    const parts = url.pathname.split("/").filter(Boolean);
    return ["shorts", "embed", "live"].includes(parts[0]) ? parts[1] : undefined;
  } catch {
    return undefined;
  }
}

async function getYoutubeMetadata(youtubeUrl) {
  try {
    const url = new URL("https://www.youtube.com/oembed");
    url.searchParams.set("url", youtubeUrl);
    url.searchParams.set("format", "json");
    const res = await fetch(url);
    if (!res.ok) throw new Error("YouTube oEmbed failed: " + res.status);
    const data = await res.json();
    return {
      title: data.title || "YouTube audio",
      artist: normalizeYoutubeArtist(data.author_name)
    };
  } catch (err) {
    console.error("YouTube metadata lookup failed:", err);
    return { title: "YouTube audio", artist: undefined };
  }
}

function normalizeYoutubeArtist(value) {
  return String(value || "")
    .replace(/\s+-\s+(topic|vevo)$/i, "")
    .trim() || undefined;
}

function getPythonCommands() {
  return [process.env.PYTHON_BIN, "python3", "python"].filter(Boolean);
}
`;

if (!source.includes("async function downloadYoutubeAudio(track)")) {
  const insertionPoint = "\nasync function answerWithYoutubeResult";
  if (!source.includes(insertionPoint)) throw new Error("Could not insert YouTube helpers.");
  source = source.replace(insertionPoint, `${helper}${insertionPoint}`);
  changed = true;
}


const currentTrackHelper = `
async function getCurrentTrack(telegramUserId) {
  const token = await getValidSpotifyToken(telegramUserId);
  const headers = { authorization: "Bearer " + token.access_token, "cache-control": "no-cache" };
  let res = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
    headers,
    cache: "no-store"
  });

  if (res.status === 204) return undefined;

  if (!res.ok) {
    console.warn("Spotify current track lookup skipped:", res.status);
    res = await fetch("https://api.spotify.com/v1/me/player", {
      headers,
      cache: "no-store"
    });
    if (res.status === 204) return undefined;
    if (!res.ok) {
      console.warn("Spotify playback state lookup skipped:", res.status);
      return undefined;
    }
  }

  const data = await res.json();
  if (data.item?.type !== "track") return undefined;

  return {
    spotifyId: data.item.id,
    title: data.item.name,
    artist: data.item.artists?.map((artist) => artist.name).join(", ") || "Unknown artist",
    album: data.item.album?.name || "Unknown album",
    artwork: data.item.album?.images?.[0]?.url || data.item.album?.images?.at(-1)?.url,
    inlineArtwork: data.item.album?.images?.[1]?.url || data.item.album?.images?.at(-1)?.url || data.item.album?.images?.[0]?.url,
    playedAt: new Date().toISOString(),
    spotifyUrl: data.item.external_urls?.spotify
  };
}
`;

if (!source.includes("async function getCurrentTrack(telegramUserId)")) {
  const insertionPoint = "\nasync function answerWithYoutubeResult";
  if (!source.includes(insertionPoint)) throw new Error("Could not insert Spotify live-track helper.");
  source = source.replace(insertionPoint, `${currentTrackHelper}${insertionPoint}`);
  changed = true;
}



const localizedStartMessageHelper = `
function getStartMessage(languageCode) {
  const english = "Welcome to the tiny song contraption, babe. \\ud83d\\udc85\\n\\nRight now I only flirt with Spotify: connect your account, then summon me inline in any chat and pick a recent track. I\\u2019ll do the audio nonsense. \\ud83e\\udea9\\n\\nI also support YouTube links inline now. \\u2728\\n\\nTiny bureaucracy jumpscare: the Spotify app is still in development mode, so if login acts allergic to you, message @kyrylo0 first and I\\u2019ll add you to the whitelist. \\ud83e\\uddfe\\u2728";
  const ukrainian = "\\u041b\\u0430\\u0441\\u043a\\u0430\\u0432\\u043e \\u043f\\u0440\\u043e\\u0448\\u0443 \\u0434\\u043e \\u043c\\u0430\\u043b\\u0435\\u043d\\u044c\\u043a\\u043e\\u0457 \\u043f\\u0456\\u0441\\u0435\\u043d\\u043d\\u043e\\u0457 \\u043c\\u0430\\u0448\\u0438\\u043d\\u043a\\u0438, \\u0431\\u0435\\u0439\\u0431. \\ud83d\\udc85\\n\\n\\u041f\\u043e\\u043a\\u0438 \\u0449\\u043e \\u044f \\u0444\\u043b\\u0456\\u0440\\u0442\\u0443\\u044e \\u043b\\u0438\\u0448\\u0435 \\u0437\\u0456 Spotify: \\u043f\\u0456\\u0434\\u043a\\u043b\\u044e\\u0447\\u0438 \\u0441\\u0432\\u0456\\u0439 \\u0430\\u043a\\u0430\\u0443\\u043d\\u0442, \\u043f\\u043e\\u0442\\u0456\\u043c \\u0432\\u0438\\u043a\\u043b\\u0438\\u0447 \\u043c\\u0435\\u043d\\u0435 \\u0456\\u043d\\u043b\\u0430\\u0439\\u043d\\u043e\\u043c \\u0443 \\u0431\\u0443\\u0434\\u044c-\\u044f\\u043a\\u043e\\u043c\\u0443 \\u0447\\u0430\\u0442\\u0456 \\u0442\\u0430 \\u043e\\u0431\\u0435\\u0440\\u0438 \\u043d\\u0435\\u0449\\u043e\\u0434\\u0430\\u0432\\u043d\\u0456\\u0439 \\u0442\\u0440\\u0435\\u043a. \\u042f \\u0440\\u043e\\u0437\\u0431\\u0435\\u0440\\u0443\\u0441\\u044f \\u0437 \\u0430\\u0443\\u0434\\u0456\\u043e. \\ud83e\\udea9\\n\\n\\u0422\\u0435\\u043f\\u0435\\u0440 \\u044f \\u0442\\u0430\\u043a\\u043e\\u0436 \\u043f\\u0456\\u0434\\u0442\\u0440\\u0438\\u043c\\u0443\\u044e YouTube-\\u043f\\u043e\\u0441\\u0438\\u043b\\u0430\\u043d\\u043d\\u044f \\u0456\\u043d\\u043b\\u0430\\u0439\\u043d\\u043e\\u043c. \\u2728\\n\\n\\u041c\\u0430\\u043b\\u0435\\u043d\\u044c\\u043a\\u0438\\u0439 \\u0431\\u044e\\u0440\\u043e\\u043a\\u0440\\u0430\\u0442\\u0438\\u0447\\u043d\\u0438\\u0439 \\u0441\\u043a\\u0440\\u0456\\u043c\\u0435\\u0440: Spotify-\\u0437\\u0430\\u0441\\u0442\\u043e\\u0441\\u0443\\u043d\\u043e\\u043a \\u0443\\u0441\\u0435 \\u0449\\u0435 \\u0432 \\u0440\\u0435\\u0436\\u0438\\u043c\\u0456 \\u0440\\u043e\\u0437\\u0440\\u043e\\u0431\\u043a\\u0438, \\u0442\\u043e\\u0436 \\u044f\\u043a\\u0449\\u043e \\u0432\\u0445\\u0456\\u0434 \\u043f\\u043e\\u0432\\u043e\\u0434\\u0438\\u0442\\u044c\\u0441\\u044f \\u0430\\u043b\\u0435\\u0440\\u0433\\u0456\\u0447\\u043d\\u043e, \\u0441\\u043f\\u043e\\u0447\\u0430\\u0442\\u043a\\u0443 \\u043d\\u0430\\u043f\\u0438\\u0448\\u0438 @kyrylo0, \\u0456 \\u044f \\u0434\\u043e\\u0434\\u0430\\u043c \\u0442\\u0435\\u0431\\u0435 \\u0434\\u043e \\u0432\\u0430\\u0439\\u0442\\u043b\\u0456\\u0441\\u0442\\u0430. \\ud83e\\uddfe\\u2728";
  return String(languageCode || "").toLowerCase().startsWith("uk") ? ukrainian : english;
}
`;

replaceOnce(
  `      text: "Connect Spotify, then use me inline in any chat.",`,
  `      text: getStartMessage(update.message.from.language_code),`,
  "localized welcome message"
);

if (!source.includes("function getStartMessage(languageCode)")) {
  const insertionPoint = "\nasync function handleUpdate(update)";
  if (!source.includes(insertionPoint)) throw new Error("Could not insert localized welcome helper.");
  source = source.replace(insertionPoint, `${localizedStartMessageHelper}${insertionPoint}`);
  changed = true;
}

if (changed) {
  writeFileSync(indexPath, source);
  console.log("Applied Spotify metadata and YouTube audio support.");
}
