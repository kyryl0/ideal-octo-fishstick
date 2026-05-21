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

replaceOnce(
  `const SPOOTY_BASE_URL = process.env.SPOOTY_BASE_URL ? trimTrailingSlash(process.env.SPOOTY_BASE_URL) : "";`,
  `const SPOOTY_BASE_URL = process.env.SPOOTY_BASE_URL ? trimTrailingSlash(process.env.SPOOTY_BASE_URL) : "";\nconst SPOOTY_YOUTUBE_BASE_URL = process.env.SPOOTY_YOUTUBE_BASE_URL\n  ? trimTrailingSlash(process.env.SPOOTY_YOUTUBE_BASE_URL)\n  : deriveSpootyYoutubeBaseUrl(SPOOTY_BASE_URL);`,
  "SPOOTY_YOUTUBE_BASE_URL config"
);

replaceOnce(
  `async function handleInlineQuery(query) {\n  const telegramUserId = String(query.from.id);\n\n  if (!spotifyTokens[telegramUserId]) {`,
  `async function handleInlineQuery(query) {\n  const telegramUserId = String(query.from.id);\n  const youtubeTrack = makeYoutubeTrackFromInlineQuery(query.query);\n\n  if (youtubeTrack) {\n    await answerWithYoutubeResult(query.id, youtubeTrack);\n    return;\n  }\n\n  if (!spotifyTokens[telegramUserId]) {`,
  "inline YouTube query branch"
);

replaceOnce(
  `async function answerWithConnectResult(inlineQueryId, telegramUserId, title = "Connect Spotify") {`,
  `async function answerWithYoutubeResult(inlineQueryId, track) {\n  const resultId = makeYoutubeResultId(track.youtubeUrl);\n  chosenTracks.set(resultId, track);\n\n  await telegram("answerInlineQuery", {\n    inline_query_id: inlineQueryId,\n    results: [{\n      type: "article",\n      id: resultId,\n      title: track.title,\n      description: "Download this YouTube Music link",\n      thumbnail_url: track.artwork,\n      input_message_content: {\n        message_text: `Preparing audio for:\\n${track.title}\\n${track.youtubeUrl}`\n      },\n      reply_markup: {\n        inline_keyboard: [[{ text: "Loading audio...", callback_data: "loading" }]]\n      }\n    }],\n    cache_time: 0,\n    is_personal: true\n  });\n}\n\nasync function answerWithConnectResult(inlineQueryId, telegramUserId, title = "Connect Spotify") {`,
  "YouTube inline answer function"
);

replaceOnce(
  `async function resolveAudio(spotifyTrack) {\n  if (AUDIO_PROVIDER === "spooty") {\n    return downloadSpootyAudio(spotifyTrack);\n  }`,
  `async function resolveAudio(spotifyTrack) {\n  if (AUDIO_PROVIDER === "spooty" && spotifyTrack.youtubeUrl) {\n    return downloadSpootyYoutubeAudio(spotifyTrack);\n  }\n\n  if (AUDIO_PROVIDER === "spooty") {\n    return downloadSpootyAudio(spotifyTrack);\n  }`,
  "YouTube resolveAudio branch"
);

replaceOnce(
  `async function downloadSpootyAudio(spotifyTrack) {`,
  `async function downloadSpootyYoutubeAudio(youtubeTrack) {\n  if (!SPOOTY_YOUTUBE_BASE_URL) {\n    throw new Error("YouTube links require SPOOTY_YOUTUBE_BASE_URL or a SPOOTY_BASE_URL on port 3000.");\n  }\n\n  const fileBase = safeSegment(youtubeTrack.youtubeId || createHash("sha256").update(youtubeTrack.youtubeUrl).digest("hex"));\n  const cachedFileName = findCachedAudioFile(fileBase);\n\n  if (cachedFileName) {\n    return buildLocalAudioResult(youtubeTrack, cachedFileName, "YouTube Music audio.");\n  }\n\n  const fileName = `${fileBase}.${SPOOTY_AUDIO_EXTENSION}`;\n  const filePath = join(AUDIO_DIR, fileName);\n  const downloadUrl = new URL("/api/youtube/download", SPOOTY_YOUTUBE_BASE_URL);\n  const res = await fetch(downloadUrl, {\n    method: "POST",\n    headers: { "content-type": "application/json" },\n    body: JSON.stringify({ url: youtubeTrack.youtubeUrl, format: SPOOTY_AUDIO_EXTENSION })\n  });\n\n  if (!res.ok) {\n    const errorText = await res.text().catch(() => "");\n    throw new Error(`YouTube download failed: ${res.status}${errorText ? ` ${errorText.slice(0, 120)}` : ""}`);\n  }\n\n  if (!res.body) {\n    throw new Error("YouTube download response did not include a body.");\n  }\n\n  await pipeline(Readable.fromWeb(res.body), createWriteStream(filePath));\n  return buildLocalAudioResult(youtubeTrack, fileName, "YouTube Music audio.");\n}\n\nasync function downloadSpootyAudio(spotifyTrack) {`,
  "YouTube downloader function"
);

replaceOnce(
  `function buildLocalAudioResult(spotifyTrack, fileName) {\n  return {\n    title: spotifyTrack.title,\n    performer: spotifyTrack.artist,\n    durationSeconds: undefined,\n    url: `${PUBLIC_BASE_URL}/files/${encodeURIComponent(fileName)}`,\n    credit: "Spooty audio."\n  };\n}`,
  `function buildLocalAudioResult(spotifyTrack, fileName, credit = "Spooty audio.") {\n  return {\n    title: spotifyTrack.title,\n    performer: spotifyTrack.artist,\n    durationSeconds: undefined,\n    url: `${PUBLIC_BASE_URL}/files/${encodeURIComponent(fileName)}`,\n    credit\n  };\n}`,
  "buildLocalAudioResult credit parameter"
);

replaceOnce(
  `  const fallbackOther = track.spotifyId ? `,
  `  const fallbackOther = track.youtubeUrl || (track.spotifyId ? `,
  "song.link fallback YouTube URL start"
);

replaceOnce(
  ` : track.spotifyUrl;\n  const fallback = {`,
  ` : track.spotifyUrl);\n  const fallback = {`,
  "song.link fallback YouTube URL end"
);

replaceOnce(
  `spotify: track.spotifyUrl,\n    youtubeMusic: makeYoutubeMusicSearchUrl(track),`,
  `spotify: track.spotifyUrl,\n    youtubeMusic: track.youtubeUrl || makeYoutubeMusicSearchUrl(track),`,
  "YouTube direct fallback link"
);

replaceOnce(
  `function makeYoutubeMusicSearchUrl(track) {`,
  `function makeYoutubeTrackFromInlineQuery(query) {\n  const youtubeUrl = extractYoutubeUrl(query);\n  if (!youtubeUrl) return undefined;\n\n  const youtubeId = extractYoutubeVideoId(youtubeUrl);\n  return {\n    source: "youtube",\n    youtubeUrl,\n    youtubeId,\n    spotifyId: youtubeId || createHash("sha256").update(youtubeUrl).digest("hex").slice(0, 16),\n    title: "YouTube Music link",\n    artist: "",\n    album: "Pasted inline",\n    artwork: youtubeId ? `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg` : undefined,\n    playedAt: new Date().toISOString()\n  };\n}\n\nfunction extractYoutubeUrl(query) {\n  if (!query) return undefined;\n\n  const match = String(query).match(/https?:\\/\\/[^\\s<>]+/i);\n  if (!match) return undefined;\n\n  try {\n    const url = new URL(match[0]);\n    const host = url.hostname.replace(/^www\\./, "").toLowerCase();\n    const allowedHosts = new Set(["youtube.com", "music.youtube.com", "m.youtube.com", "youtu.be"]);\n\n    if (!allowedHosts.has(host)) return undefined;\n    url.hash = "";\n    return url.toString();\n  } catch {\n    return undefined;\n  }\n}\n\nfunction extractYoutubeVideoId(value) {\n  try {\n    const url = new URL(value);\n    const host = url.hostname.replace(/^www\\./, "").toLowerCase();\n\n    if (host === "youtu.be") {\n      return url.pathname.split("/").filter(Boolean)[0];\n    }\n\n    return url.searchParams.get("v") || undefined;\n  } catch {\n    return undefined;\n  }\n}\n\nfunction makeYoutubeResultId(youtubeUrl) {\n  return `yt:${createHash("sha256").update(youtubeUrl).digest("base64url").slice(0, 32)}`;\n}\n\nfunction makeYoutubeMusicSearchUrl(track) {`,
  "YouTube URL helpers"
);

replaceOnce(
  `function trimTrailingSlash(value) {`,
  `function deriveSpootyYoutubeBaseUrl(spootyBaseUrl) {\n  if (!spootyBaseUrl) return "";\n\n  try {\n    const url = new URL(spootyBaseUrl);\n    if (url.port === "3000") url.port = "3001";\n    return trimTrailingSlash(url.toString());\n  } catch {\n    return "";\n  }\n}\n\nfunction trimTrailingSlash(value) {`,
  "Spooty YouTube sidecar base URL helper"
);

if (changed) {
  writeFileSync(indexPath, source);
  console.log("Applied YouTube inline support.");
}
