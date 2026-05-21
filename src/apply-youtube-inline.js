import { readFileSync, writeFileSync } from "node:fs";

const indexPath = new URL("./index.js", import.meta.url);
let source = readFileSync(indexPath, "utf8");
let changed = false;

function block(lines) {
  return lines.join("\n");
}

function replaceOnce(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Could not apply YouTube inline patch. Missing ${label}.`);
  }
  source = source.replace(before, after);
  changed = true;
}

replaceOnce(
  'const SPOOTY_BASE_URL = process.env.SPOOTY_BASE_URL ? trimTrailingSlash(process.env.SPOOTY_BASE_URL) : "";',
  block([
    'const SPOOTY_BASE_URL = process.env.SPOOTY_BASE_URL ? trimTrailingSlash(process.env.SPOOTY_BASE_URL) : "";',
    'const SPOOTY_YOUTUBE_BASE_URL = process.env.SPOOTY_YOUTUBE_BASE_URL',
    '  ? trimTrailingSlash(process.env.SPOOTY_YOUTUBE_BASE_URL)',
    '  : deriveSpootyYoutubeBaseUrl(SPOOTY_BASE_URL);'
  ]),
  "SPOOTY_YOUTUBE_BASE_URL config"
);

replaceOnce(
  block([
    'async function handleInlineQuery(query) {',
    '  const telegramUserId = String(query.from.id);',
    '',
    '  if (!spotifyTokens[telegramUserId]) {'
  ]),
  block([
    'async function handleInlineQuery(query) {',
    '  const telegramUserId = String(query.from.id);',
    '  const youtubeTrack = makeYoutubeTrackFromInlineQuery(query.query);',
    '',
    '  if (youtubeTrack) {',
    '    await answerWithYoutubeResult(query.id, youtubeTrack);',
    '    return;',
    '  }',
    '',
    '  if (!spotifyTokens[telegramUserId]) {'
  ]),
  "inline YouTube query branch"
);

replaceOnce(
  'async function answerWithConnectResult(inlineQueryId, telegramUserId, title = "Connect Spotify") {',
  block([
    'async function answerWithYoutubeResult(inlineQueryId, track) {',
    '  const resultId = makeYoutubeResultId(track.youtubeUrl);',
    '  chosenTracks.set(resultId, track);',
    '',
    '  await telegram("answerInlineQuery", {',
    '    inline_query_id: inlineQueryId,',
    '    results: [{',
    '      type: "article",',
    '      id: resultId,',
    '      title: track.title,',
    '      description: "Download this YouTube Music link",',
    '      thumbnail_url: track.artwork,',
    '      input_message_content: {',
    '        message_text: `Preparing audio for:\\\\n${track.title}\\\\n${track.youtubeUrl}`',
    '      },',
    '      reply_markup: {',
    '        inline_keyboard: [[{ text: "Loading audio...", callback_data: "loading" }]]',
    '      }',
    '    }],',
    '    cache_time: 0,',
    '    is_personal: true',
    '  });',
    '}',
    '',
    'async function answerWithConnectResult(inlineQueryId, telegramUserId, title = "Connect Spotify") {'
  ]),
  "YouTube inline answer function"
);

replaceOnce(
  block([
    'async function resolveAudio(spotifyTrack) {',
    '  if (AUDIO_PROVIDER === "spooty") {',
    '    return downloadSpootyAudio(spotifyTrack);',
    '  }'
  ]),
  block([
    'async function resolveAudio(spotifyTrack) {',
    '  if (AUDIO_PROVIDER === "spooty" && spotifyTrack.youtubeUrl) {',
    '    return downloadSpootyYoutubeAudio(spotifyTrack);',
    '  }',
    '',
    '  if (AUDIO_PROVIDER === "spooty") {',
    '    return downloadSpootyAudio(spotifyTrack);',
    '  }'
  ]),
  "YouTube resolveAudio branch"
);

replaceOnce(
  block([
    'async function downloadSpootyYoutubeAudio(youtubeTrack) {',
    '  if (!SPOOTY_YOUTUBE_BASE_URL) {',
    '    throw new Error("YouTube links require SPOOTY_YOUTUBE_BASE_URL or a SPOOTY_BASE_URL on port 3000.");',
    '  }',
    '',
    '  const fileBase = safeSegment(youtubeTrack.youtubeId || createHash("sha256").update(youtubeTrack.youtubeUrl).digest("hex"));',
    '  const cachedFileName = findCachedAudioFile(fileBase);',
    '',
    '  if (cachedFileName) {',
    '    return buildLocalAudioResult(youtubeTrack, cachedFileName, "YouTube Music audio.");',
    '  }',
    '',
    '  const fileName = `${fileBase}.${SPOOTY_AUDIO_EXTENSION}`;',
    '  const filePath = join(AUDIO_DIR, fileName);',
    '  const downloadUrl = new URL("/api/youtube/download", SPOOTY_YOUTUBE_BASE_URL);',
    '  const res = await fetch(downloadUrl, {',
    '    method: "POST",',
    '    headers: { "content-type": "application/json" },',
    '    body: JSON.stringify({ url: youtubeTrack.youtubeUrl, format: SPOOTY_AUDIO_EXTENSION })',
    '  });',
    '',
    '  if (!res.ok) {',
    '    const errorText = await res.text().catch(() => "");',
    '    throw new Error(`YouTube download failed: ${res.status}${errorText ? ` ${errorText.slice(0, 120)}` : ""}`);',
    '  }',
    '',
    '  if (!res.body) {',
    '    throw new Error("YouTube download response did not include a body.");',
    '  }',
    '',
    '  await pipeline(Readable.fromWeb(res.body), createWriteStream(filePath));',
    '  return buildLocalAudioResult(youtubeTrack, fileName, "YouTube Music audio.");',
    '}'
  ]),
  block([
    'async function downloadSpootyYoutubeAudio(youtubeTrack) {',
    '  const fileBase = safeSegment(youtubeTrack.youtubeId || createHash("sha256").update(youtubeTrack.youtubeUrl).digest("hex"));',
    '  const cachedFileName = findCachedAudioFile(fileBase);',
    '',
    '  if (cachedFileName) {',
    '    return buildLocalAudioResult(youtubeTrack, cachedFileName, "YouTube Music audio.");',
    '  }',
    '',
    '  const fileName = `${fileBase}.${SPOOTY_AUDIO_EXTENSION}`;',
    '  const filePath = join(AUDIO_DIR, fileName);',
    '  const res = await fetchSpootyYoutubeDownload(youtubeTrack.youtubeUrl);',
    '',
    '  if (!res.body) {',
    '    throw new Error("YouTube download response did not include a body.");',
    '  }',
    '',
    '  await pipeline(Readable.fromWeb(res.body), createWriteStream(filePath));',
    '  return buildLocalAudioResult(youtubeTrack, fileName, "YouTube Music audio.");',
    '}'
  ]),
  "YouTube downloader retry update"
);

replaceOnce(
  'async function downloadSpootyAudio(spotifyTrack) {',
  block([
    'async function downloadSpootyYoutubeAudio(youtubeTrack) {',
    '  const fileBase = safeSegment(youtubeTrack.youtubeId || createHash("sha256").update(youtubeTrack.youtubeUrl).digest("hex"));',
    '  const cachedFileName = findCachedAudioFile(fileBase);',
    '',
    '  if (cachedFileName) {',
    '    return buildLocalAudioResult(youtubeTrack, cachedFileName, "YouTube Music audio.");',
    '  }',
    '',
    '  const fileName = `${fileBase}.${SPOOTY_AUDIO_EXTENSION}`;',
    '  const filePath = join(AUDIO_DIR, fileName);',
    '  const res = await fetchSpootyYoutubeDownload(youtubeTrack.youtubeUrl);',
    '',
    '  if (!res.body) {',
    '    throw new Error("YouTube download response did not include a body.");',
    '  }',
    '',
    '  await pipeline(Readable.fromWeb(res.body), createWriteStream(filePath));',
    '  return buildLocalAudioResult(youtubeTrack, fileName, "YouTube Music audio.");',
    '}',
    '',
    'async function downloadSpootyAudio(spotifyTrack) {'
  ]),
  "YouTube downloader function"
);

replaceOnce(
  'async function downloadSpootyAudio(spotifyTrack) {',
  block([
    'async function fetchSpootyYoutubeDownload(youtubeUrl) {',
    '  const bases = [',
    '    SPOOTY_YOUTUBE_BASE_URL,',
    '    deriveSpootyYoutubeBaseUrl(SPOOTY_YOUTUBE_BASE_URL),',
    '    deriveSpootyYoutubeBaseUrl(SPOOTY_BASE_URL)',
    '  ].filter(Boolean);',
    '  const uniqueBases = [...new Set(bases)];',
    '',
    '  if (!uniqueBases.length) {',
    '    throw new Error("YouTube links require SPOOTY_YOUTUBE_BASE_URL or a SPOOTY_BASE_URL on port 3000.");',
    '  }',
    '',
    '  let lastError = "";',
    '',
    '  for (const base of uniqueBases) {',
    '    const downloadUrl = new URL("/api/youtube/download", base);',
    '    const res = await fetch(downloadUrl, {',
    '      method: "POST",',
    '      headers: { "content-type": "application/json" },',
    '      body: JSON.stringify({ url: youtubeUrl, format: SPOOTY_AUDIO_EXTENSION })',
    '    });',
    '',
    '    if (res.ok) return res;',
    '',
    '    const errorText = await res.text().catch(() => "");',
    '    lastError = `${downloadUrl.toString()} -> ${res.status}${errorText ? ` ${errorText.slice(0, 120)}` : ""}`;',
    '',
    '    if (res.status !== 404) break;',
    '  }',
    '',
    '  throw new Error(`YouTube download failed: ${lastError}`);',
    '}',
    '',
    'async function downloadSpootyAudio(spotifyTrack) {'
  ]),
  "YouTube sidecar fetch retry helper"
);

replaceOnce(
  block([
    'function buildLocalAudioResult(spotifyTrack, fileName) {',
    '  return {',
    '    title: spotifyTrack.title,',
    '    performer: spotifyTrack.artist,',
    '    durationSeconds: undefined,',
    '    url: `${PUBLIC_BASE_URL}/files/${encodeURIComponent(fileName)}`,' ,
    '    credit: "Spooty audio."',
    '  };',
    '}'
  ]),
  block([
    'function buildLocalAudioResult(spotifyTrack, fileName, credit = "Spooty audio.") {',
    '  return {',
    '    title: spotifyTrack.title,',
    '    performer: spotifyTrack.artist,',
    '    durationSeconds: undefined,',
    '    url: `${PUBLIC_BASE_URL}/files/${encodeURIComponent(fileName)}`,' ,
    '    credit',
    '  };',
    '}'
  ]),
  "buildLocalAudioResult credit parameter"
);

replaceOnce(
  '  const fallbackOther = track.spotifyId ? ',
  '  const fallbackOther = track.youtubeUrl || (track.spotifyId ? ',
  "song.link fallback YouTube URL start"
);

replaceOnce(
  ' : track.spotifyUrl;\n  const fallback = {',
  ' : track.spotifyUrl);\n  const fallback = {',
  "song.link fallback YouTube URL end"
);

replaceOnce(
  'spotify: track.spotifyUrl,\n    youtubeMusic: makeYoutubeMusicSearchUrl(track),',
  'spotify: track.spotifyUrl,\n    youtubeMusic: track.youtubeUrl || makeYoutubeMusicSearchUrl(track),',
  "YouTube direct fallback link"
);

replaceOnce(
  'function makeYoutubeMusicSearchUrl(track) {',
  block([
    'function makeYoutubeTrackFromInlineQuery(query) {',
    '  const youtubeUrl = extractYoutubeUrl(query);',
    '  if (!youtubeUrl) return undefined;',
    '',
    '  const youtubeId = extractYoutubeVideoId(youtubeUrl);',
    '  return {',
    '    source: "youtube",',
    '    youtubeUrl,',
    '    youtubeId,',
    '    spotifyId: youtubeId || createHash("sha256").update(youtubeUrl).digest("hex").slice(0, 16),',
    '    title: "YouTube Music link",',
    '    artist: "",',
    '    album: "Pasted inline",',
    '    artwork: youtubeId ? `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg` : undefined,',
    '    playedAt: new Date().toISOString()',
    '  };',
    '}',
    '',
    'function extractYoutubeUrl(query) {',
    '  if (!query) return undefined;',
    '',
    '  const match = String(query).match(/https?:\\/\\/[^\\s<>]+/i);',
    '  if (!match) return undefined;',
    '',
    '  try {',
    '    const url = new URL(match[0]);',
    '    const host = url.hostname.replace(/^www\\./, "").toLowerCase();',
    '    const allowedHosts = new Set(["youtube.com", "music.youtube.com", "m.youtube.com", "youtu.be"]);',
    '',
    '    if (!allowedHosts.has(host)) return undefined;',
    '    url.hash = "";',
    '    return url.toString();',
    '  } catch {',
    '    return undefined;',
    '  }',
    '}',
    '',
    'function extractYoutubeVideoId(value) {',
    '  try {',
    '    const url = new URL(value);',
    '    const host = url.hostname.replace(/^www\\./, "").toLowerCase();',
    '',
    '    if (host === "youtu.be") {',
    '      return url.pathname.split("/").filter(Boolean)[0];',
    '    }',
    '',
    '    return url.searchParams.get("v") || undefined;',
    '  } catch {',
    '    return undefined;',
    '  }',
    '}',
    '',
    'function makeYoutubeResultId(youtubeUrl) {',
    '  return `yt:${createHash("sha256").update(youtubeUrl).digest("base64url").slice(0, 32)}`;',
    '}',
    '',
    'function makeYoutubeMusicSearchUrl(track) {'
  ]),
  "YouTube URL helpers"
);

replaceOnce(
  block([
    'function deriveSpootyYoutubeBaseUrl(spootyBaseUrl) {',
    '  if (!spootyBaseUrl) return "";',
    '',
    '  try {',
    '    const url = new URL(spootyBaseUrl);',
    '    if (url.port === "3000") url.port = "3001";',
    '    return trimTrailingSlash(url.toString());',
    '  } catch {',
    '    return "";',
    '  }',
    '}'
  ]),
  block([
    'function deriveSpootyYoutubeBaseUrl(spootyBaseUrl) {',
    '  if (!spootyBaseUrl) return "";',
    '',
    '  try {',
    '    const url = new URL(spootyBaseUrl);',
    '    if (url.protocol === "http:" && (!url.port || url.port === "3000")) url.port = "3001";',
    '    return trimTrailingSlash(url.toString());',
    '  } catch {',
    '    return "";',
    '  }',
    '}'
  ]),
  "Spooty YouTube sidecar derived port update"
);

replaceOnce(
  'function trimTrailingSlash(value) {',
  block([
    'function deriveSpootyYoutubeBaseUrl(spootyBaseUrl) {',
    '  if (!spootyBaseUrl) return "";',
    '',
    '  try {',
    '    const url = new URL(spootyBaseUrl);',
    '    if (url.protocol === "http:" && (!url.port || url.port === "3000")) url.port = "3001";',
    '    return trimTrailingSlash(url.toString());',
    '  } catch {',
    '    return "";',
    '  }',
    '}',
    '',
    'function trimTrailingSlash(value) {'
  ]),
  "Spooty YouTube sidecar base URL helper"
);

if (changed) {
  writeFileSync(indexPath, source);
  console.log("Applied YouTube inline support.");
}
