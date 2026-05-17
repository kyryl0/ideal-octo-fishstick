import { readFileSync, writeFileSync } from "node:fs";

const indexPath = new URL("./index.js", import.meta.url);
let source = readFileSync(indexPath, "utf8");
let changed = false;

function replaceOnce(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Could not apply YouTube link support patch. Missing ${label}.`);
  }
  source = source.replace(before, after);
  changed = true;
}

replaceOnce(
  `async function handleInlineQuery(query) {\n  const telegramUserId = String(query.from.id);\n\n  if (!spotifyTokens[telegramUserId]) {`,
  `async function handleInlineQuery(query) {\n  const telegramUserId = String(query.from.id);\n  const youtubeTrack = await getYoutubeInlineTrack(query.query);\n\n  if (youtubeTrack) {\n    await answerWithYoutubeResult(query.id, telegramUserId, youtubeTrack);\n    return;\n  }\n\n  if (!spotifyTokens[telegramUserId]) {`,
  "inline YouTube branch"
);

replaceOnce(
  `async function answerWithConnectResult(inlineQueryId, telegramUserId, title = "Connect Spotify") {`,
  `async function answerWithYoutubeResult(inlineQueryId, telegramUserId, track) {\n  const resultId = makeYoutubeResultId(telegramUserId, track);\n  chosenTracks.set(resultId, track);\n\n  await telegram("answerInlineQuery", {\n    inline_query_id: inlineQueryId,\n    results: [{\n      type: "article",\n      id: resultId,\n      title: track.title,\n      description: "YouTube link - tap to fetch audio",\n      thumbnail_url: track.artwork,\n      input_message_content: {\n        message_text: \`Preparing audio for:\\n\${track.title}\\n\${track.artist}\`\n      },\n      reply_markup: {\n        inline_keyboard: [[{ text: "Loading... 😵‍💫", callback_data: "loading" }]]\n      }\n    }],\n    cache_time: 0,\n    is_personal: true\n  });\n}\n\nasync function answerWithConnectResult(inlineQueryId, telegramUserId, title = "Connect Spotify") {`,
  "YouTube inline result helper"
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
  `async function createAndWaitForSpootyTrack(spotifyUrl) {\n  const createUrl = new URL("/api/playlist", SPOOTY_BASE_URL);\n  const createRes = await fetch(createUrl, {\n    method: "POST",\n    headers: { "content-type": "application/json" },\n    body: JSON.stringify({ spotifyUrl, active: false })\n  });`,
  `async function createAndWaitForSpootyTrack(spotifyUrl, sourceTrack = {}) {\n  const createUrl = new URL("/api/playlist", SPOOTY_BASE_URL);\n  const createRes = await fetch(createUrl, {\n    method: "POST",\n    headers: { "content-type": "application/json" },\n    body: JSON.stringify({ spotifyUrl, name: sourceTrack.title, active: false })\n  });`,
  "Spooty create metadata"
);

replaceOnce(
  `async function resolveSongLinks(track) {\n  const fallbackOther = track.spotifyId ? \`https://song.link/s/\${track.spotifyId}\` : track.spotifyUrl;`,
  `async function resolveSongLinks(track) {\n  if (track.youtubeUrl) {\n    return {\n      spotify: undefined,\n      youtubeMusic: track.youtubeUrl,\n      other: track.youtubeUrl\n    };\n  }\n\n  const fallbackOther = track.spotifyId ? \`https://song.link/s/\${track.spotifyId}\` : track.spotifyUrl;`,
  "YouTube song links"
);

const resultIdBefore = 'function makeResultId(telegramUserId, track, index) {\n  const raw = `${telegramUserId}:${track.spotifyId}:${track.playedAt}:${index}`;\n  return `sp:${createHash("sha256").update(raw).digest("base64url").slice(0, 32)}`;\n}\n';
const resultIdAfter = 'function makeResultId(telegramUserId, track, index) {\n  const raw = `${telegramUserId}:${track.spotifyId}:${track.playedAt}:${index}`;\n  return `sp:${createHash("sha256").update(raw).digest("base64url").slice(0, 32)}`;\n}\n\nfunction makeYoutubeResultId(telegramUserId, track) {\n  const raw = `${telegramUserId}:${track.youtubeId || track.youtubeUrl}:${track.title}`;\n  return `yt:${createHash("sha256").update(raw).digest("base64url").slice(0, 32)}`;\n}\n';
replaceOnce(resultIdBefore, resultIdAfter, "YouTube result id helper");

const helper = `
async function getYoutubeInlineTrack(queryText) {
  const youtubeUrl = extractYoutubeUrl(queryText);
  if (!youtubeUrl) return undefined;

  const youtubeId = getYoutubeVideoId(youtubeUrl);
  const normalizedUrl = youtubeId ? \`https://www.youtube.com/watch?v=\${youtubeId}\` : youtubeUrl;
  const title = await getYoutubeTitle(normalizedUrl);

  return {
    source: "youtube",
    youtubeId,
    youtubeUrl: normalizedUrl,
    title,
    artist: "YouTube",
    album: "Direct link",
    artwork: youtubeId ? \`https://img.youtube.com/vi/\${youtubeId}/mqdefault.jpg\` : undefined,
    playedAt: new Date().toISOString(),
    spotifyUrl: undefined
  };
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
`;

if (!source.includes("async function getYoutubeInlineTrack(queryText)")) {
  const insertionPoint = "\nasync function answerWithYoutubeResult";
  if (!source.includes(insertionPoint)) {
    throw new Error("Could not insert YouTube link helpers.");
  }
  source = source.replace(insertionPoint, `${helper}${insertionPoint}`);
  changed = true;
}

if (changed) {
  writeFileSync(indexPath, source);
  console.log("Applied YouTube inline link support.");
}
