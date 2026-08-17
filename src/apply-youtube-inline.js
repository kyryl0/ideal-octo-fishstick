import { readFileSync, writeFileSync } from "node:fs";

const indexPath = new URL("./index.js", import.meta.url);
let source = readFileSync(indexPath, "utf8");
let changed = false;

function replaceOnce(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Could not apply YouTube Music inline patch. Missing ${label}.`);
  }
  source = source.replace(before, after);
  changed = true;
}

function insertAfter(needle, insertion, label) {
  if (source.includes(insertion)) return;
  if (!source.includes(needle)) {
    throw new Error(`Could not apply YouTube Music inline patch. Missing ${label}.`);
  }
  source = source.replace(needle, `${needle}${insertion}`);
  changed = true;
}

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
  `const SPOOTY_AUDIO_EXTENSION = normalizeAudioExtension(process.env.SPOOTY_AUDIO_EXTENSION || "mp3");`,
  `\nconst YTMUSIC_INLINE_LIMIT = normalizeInlineLimit(process.env.YTMUSIC_INLINE_LIMIT || 5);`,
  "YouTube Music inline limit"
);

insertAfter(
  `const jobs = new Map();`,
  `\nconst execFileAsync = promisify(execFile);`,
  "execFileAsync helper"
);

replaceOnce(
  `async function handleInlineQuery(query) {\n  const telegramUserId = String(query.from.id);\n\n  if (!spotifyTokens[telegramUserId]) {`,
  `async function handleInlineQuery(query) {\n  const telegramUserId = String(query.from.id);\n  const youtubeTracks = await getYtMusicInlineTracks(query.query);\n\n  if (youtubeTracks.length) {\n    await answerWithYoutubeResults(query.id, telegramUserId, youtubeTracks);\n    return;\n  }\n\n  if (!spotifyTokens[telegramUserId]) {`,
  "inline YouTube Music branch"
);

replaceOnce(
  `async function answerWithConnectResult(inlineQueryId, telegramUserId, title = "Connect Spotify") {`,
  `async function answerWithYoutubeResults(inlineQueryId, telegramUserId, tracks) {\n  const results = tracks.map((track, index) => {\n    const resultId = makeYoutubeResultId(telegramUserId, track, index);\n    chosenTracks.set(resultId, track);\n\n    return {\n      type: "article",\n      id: resultId,\n      title: track.title,\n      description: \`${track.artist} - ${track.album}\`,\n      thumbnail_url: track.artwork,\n      input_message_content: {\n        message_text: \`Preparing audio for:\\n${track.title}\\n${track.artist} - ${track.album}\`\n      },\n      reply_markup: {\n        inline_keyboard: [[{ text: "Loading audio...", callback_data: "loading" }]]\n      }\n    };\n  });\n\n  await telegram("answerInlineQuery", {\n    inline_query_id: inlineQueryId,\n    results,\n    cache_time: 0,\n    is_personal: true\n  });\n}\n\nasync function answerWithConnectResult(inlineQueryId, telegramUserId, title = "Connect Spotify") {`,
  "YouTube Music inline result helper"
);

replaceOnce(
  `  if (!spotifyTrack.spotifyUrl) {\n    throw new Error("Spotify track URL is missing.");\n  }\n\n  const fileBase = safeSegment(spotifyTrack.spotifyId || createHash("sha256").update(spotifyTrack.spotifyUrl).digest("hex"));`,
  `  const sourceUrl = spotifyTrack.youtubeUrl || spotifyTrack.spotifyUrl;\n\n  if (!sourceUrl) {\n    throw new Error("Track URL is missing.");\n  }\n\n  const fileBase = safeSegment(spotifyTrack.spotifyId || spotifyTrack.youtubeId || createHash("sha256").update(sourceUrl).digest("hex"));`,
  "Spooty source URL selection"
);

replaceOnce(
  `  const spootyTrack = await createAndWaitForSpootyTrack(spotifyTrack.spotifyUrl);`,
  `  const spootyTrack = await createAndWaitForSpootyTrack(sourceUrl, spotifyTrack);`,
  "Spooty direct URL create call"
);

replaceOnce(
  `async function createAndWaitForSpootyTrack(spotifyUrl) {\n  const createUrl = new URL("/api/playlist", SPOOTY_BASE_URL);\n  const createRes = await fetch(createUrl, {\n    method: "POST",\n    headers: { "content-type": "application/json" },\n    body: JSON.stringify({ spotifyUrl, active: false })\n  });\n\n  if (!createRes.ok) {\n    throw new Error(\`Spooty create request failed: ${createRes.status}\`);\n  }`,
  `async function createAndWaitForSpootyTrack(spotifyUrl, sourceTrack = {}) {\n  const createUrl = new URL("/api/playlist", SPOOTY_BASE_URL);\n  const createRes = await fetch(createUrl, {\n    method: "POST",\n    headers: { "content-type": "application/json" },\n    body: JSON.stringify({ spotifyUrl, name: sourceTrack.title, active: false })\n  });\n\n  if (!createRes.ok) {\n    const errorText = await createRes.text().catch(() => "");\n    throw new Error(\`Spooty create request failed: ${createRes.status}${formatRemoteError(errorText)}\`);\n  }`,
  "Spooty create metadata"
);

replaceOnce(
  `async function resolveSongLinks(track) {\n  const fallbackOther = track.spotifyId ? \`https://song.link/s/${track.spotifyId}\` : track.spotifyUrl;`,
  `async function resolveSongLinks(track) {\n  if (track.youtubeUrl) {\n    return {\n      spotify: undefined,\n      appleMusic: undefined,\n      youtubeMusic: track.youtubeUrl,\n      other: track.youtubeUrl\n    };\n  }\n\n  const fallbackOther = track.spotifyId ? \`https://song.link/s/${track.spotifyId}\` : track.spotifyUrl;`,
  "YouTube Music song links"
);

replaceOnce(
  `    \`Spotify pick: ${escapeHtml(spotifyTrack.title)} - ${escapeHtml(spotifyTrack.artist)}\`,`,
  `    \`${spotifyTrack.source === "youtubeMusic" ? "YouTube Music pick" : "Spotify pick"}: ${escapeHtml(spotifyTrack.title)} - ${escapeHtml(spotifyTrack.artist)}\`,`,
  "YouTube Music caption label"
);

const helper = `
async function getYtMusicInlineTracks(queryText) {
  const text = String(queryText || "").trim();
  if (!text) return [];

  const youtubeUrl = extractYoutubeUrl(text);
  if (youtubeUrl) {
    return [await getYtMusicTrackFromUrl(youtubeUrl)];
  }

  if (looksLikeUrl(text) || text.length < 2) return [];

  try {
    const results = await runYtMusicApi("search", { query: text, limit: YTMUSIC_INLINE_LIMIT });
    return results.map(normalizeYtMusicTrack).filter(Boolean);
  } catch (err) {
    console.error("YouTube Music search failed:", err);
    return [];
  }
}

async function getYtMusicTrackFromUrl(youtubeUrl) {
  const youtubeId = getYoutubeVideoId(youtubeUrl);
  if (!youtubeId) {
    return makeFallbackYoutubeTrack(youtubeUrl);
  }

  try {
    const results = await runYtMusicApi("song", { videoId: youtubeId });
    return normalizeYtMusicTrack(results[0]) || makeFallbackYoutubeTrack(youtubeUrl, youtubeId);
  } catch (err) {
    console.error("YouTube Music metadata lookup failed:", err);
    return makeFallbackYoutubeTrack(youtubeUrl, youtubeId);
  }
}

async function runYtMusicApi(mode, payload) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64");
  const script = \`
import base64
import json
import sys
from ytmusicapi import YTMusic

def pick_thumb(item):
    thumbs = item.get("thumbnails") or []
    if not thumbs:
        return None
    return sorted(thumbs, key=lambda thumb: int(thumb.get("width") or 0))[-1].get("url")

def artist_names(artists):
    if isinstance(artists, list):
        return ", ".join([artist.get("name") for artist in artists if artist.get("name")])
    return None

def from_search_item(item):
    video_id = item.get("videoId")
    if not video_id:
        return None
    return {
        "videoId": video_id,
        "title": item.get("title") or "YouTube Music audio",
        "artist": artist_names(item.get("artists")) or item.get("artist") or "YouTube Music",
        "album": (item.get("album") or {}).get("name") or item.get("category") or "YouTube Music",
        "artwork": pick_thumb(item),
        "durationSeconds": item.get("duration_seconds"),
    }

mode = sys.argv[1]
payload = json.loads(base64.b64decode(sys.argv[2]).decode("utf-8"))
ytmusic = YTMusic()

if mode == "search":
    items = ytmusic.search(payload["query"], filter="songs", limit=int(payload.get("limit") or 5))
    print(json.dumps([track for track in [from_search_item(item) for item in items] if track]))
elif mode == "song":
    song = ytmusic.get_song(payload["videoId"])
    details = song.get("videoDetails") or {}
    microformat = (song.get("microformat") or {}).get("microformatDataRenderer") or {}
    thumbnails = details.get("thumbnail", {}).get("thumbnails") or microformat.get("thumbnail", {}).get("thumbnails") or []
    item = {
        "videoId": details.get("videoId") or payload["videoId"],
        "title": details.get("title") or microformat.get("title") or "YouTube Music audio",
        "artist": details.get("author") or microformat.get("ownerChannelName") or "YouTube Music",
        "album": "YouTube Music",
        "artwork": pick_thumb({"thumbnails": thumbnails}),
        "durationSeconds": int(details["lengthSeconds"]) if details.get("lengthSeconds") else None,
    }
    print(json.dumps([item]))
else:
    raise SystemExit(f"Unknown mode: {mode}")
\`;

  const errors = [];
  for (const command of getPythonCommands()) {
    try {
      const { stdout } = await execFileAsync(command, ["-c", script, mode, encodedPayload], {
        maxBuffer: 1024 * 1024,
        timeout: 15000,
        windowsHide: true
      });
      return JSON.parse(stdout);
    } catch (err) {
      errors.push(\`${command}: ${err.message}\`);
    }
  }

  throw new Error(\`ytmusicapi unavailable (${errors.join("; ")})\`);
}

function normalizeYtMusicTrack(item) {
  if (!item?.videoId) return undefined;
  const youtubeUrl = \`https://music.youtube.com/watch?v=${encodeURIComponent(item.videoId)}\`;
  return {
    source: "youtubeMusic",
    youtubeId: item.videoId,
    youtubeUrl,
    spotifyId: \`ytm:${item.videoId}\`,
    title: item.title || "YouTube Music audio",
    artist: item.artist || "YouTube Music",
    album: item.album || "YouTube Music",
    artwork: item.artwork || \`https://img.youtube.com/vi/${item.videoId}/mqdefault.jpg\`,
    durationSeconds: item.durationSeconds,
    playedAt: new Date().toISOString(),
    spotifyUrl: undefined
  };
}

function makeFallbackYoutubeTrack(youtubeUrl, youtubeId = getYoutubeVideoId(youtubeUrl)) {
  return {
    source: "youtubeMusic",
    youtubeId,
    youtubeUrl: youtubeId ? \`https://music.youtube.com/watch?v=${encodeURIComponent(youtubeId)}\` : youtubeUrl,
    spotifyId: youtubeId ? \`ytm:${youtubeId}\` : undefined,
    title: "YouTube Music audio",
    artist: "YouTube Music",
    album: "Direct link",
    artwork: youtubeId ? \`https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg\` : undefined,
    playedAt: new Date().toISOString(),
    spotifyUrl: undefined
  };
}

function makeYoutubeResultId(telegramUserId, track, index = 0) {
  const raw = [telegramUserId, track.youtubeId || track.youtubeUrl, track.title, index].join(":");
  return "yt:" + createHash("sha256").update(raw).digest("base64url").slice(0, 32);
}

function extractYoutubeUrl(queryText) {
  const text = String(queryText || "").trim();
  if (!text) return undefined;

  const match = text.match(/(?:https?:\\/\\/)?(?:www\\.|m\\.)?(?:youtube\\.com|music\\.youtube\\.com|youtu\\.be)\\/[^\\s<>]+/i);
  if (!match) return undefined;

  const raw = match[0].startsWith("http") ? match[0] : \`https://${match[0]}\`;
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

function looksLikeUrl(value) {
  return /^https?:\/\//i.test(value) || /^[a-z][a-z0-9+.-]*:/i.test(value);
}

function getPythonCommands() {
  return [process.env.PYTHON_BIN, "python3", "python"].filter(Boolean);
}

function normalizeInlineLimit(value) {
  const limit = Number(value);
  if (Number.isFinite(limit)) return Math.min(Math.max(Math.floor(limit), 1), 10);
  return 5;
}
`;

if (!source.includes("async function getYtMusicInlineTracks(queryText)")) {
  const insertionPoint = "\nasync function answerWithYoutubeResults";
  if (!source.includes(insertionPoint)) {
    throw new Error("Could not insert YouTube Music link helpers.");
  }
  source = source.replace(insertionPoint, `${helper}${insertionPoint}`);
  changed = true;
}

if (changed) {
  writeFileSync(indexPath, source);
  console.log("Applied YouTube Music inline support.");
}
