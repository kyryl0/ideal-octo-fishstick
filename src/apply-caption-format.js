import { readFileSync, writeFileSync } from "node:fs";

const indexPath = new URL("./index.js", import.meta.url);
let source = readFileSync(indexPath, "utf8");
let changed = false;

function replaceAll(before, after) {
  if (!source.includes(before)) return;
  source = source.replaceAll(before, after);
  changed = true;
}

replaceAll(
  `const SPOTIFY_SCOPE = "user-read-recently-played";`,
  `const SPOTIFY_SCOPE = "user-read-recently-played user-read-currently-playing";`
);
replaceAll(
  `{ text: "Loading audio...", callback_data: "loading" }`,
  `{ text: "Loading... \\u{1F504}", callback_data: "loading" }`
);
replaceAll(
  `{ text: "Preparing...", callback_data: "loading" }`,
  `{ text: "Loading... \\u{1F504}", callback_data: "loading" }`
);
replaceAll(
  `text: "Connect Spotify, then use me inline in any chat.",`,
  `text: "Connect Spotify for recent tracks, or paste a YouTube link inline.",`
);
replaceAll("cache_time: 1,", "cache_time: 0,");

const helper = `
async function getCurrentTrack(telegramUserId) {
  const token = await getValidSpotifyToken(telegramUserId);
  const res = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
    headers: { authorization: "Bearer " + token.access_token }
  });

  if (res.status === 204 || !res.ok) {
    if (res.status !== 204) console.warn("Spotify current track lookup skipped:", res.status);
    return undefined;
  }

  const data = await res.json();
  if (data.item?.type !== "track") return undefined;
  return {
    spotifyId: data.item.id,
    title: data.item.name,
    artist: data.item.artists?.map((artist) => artist.name).join(", ") || "Unknown artist",
    album: data.item.album?.name || "Unknown album",
    artwork: data.item.album?.images?.at(-1)?.url || data.item.album?.images?.[0]?.url,
    playedAt: new Date().toISOString(),
    spotifyUrl: data.item.external_urls?.spotify
  };
}
`;

if (!source.includes("async function getCurrentTrack(telegramUserId)")) {
  const insertionPoint = "\nfunction buildAudioCaption(spotifyTrack, audio, links) {";
  if (!source.includes(insertionPoint)) throw new Error("Could not insert current-track helper.");
  source = source.replace(insertionPoint, `${helper}${insertionPoint}`);
  changed = true;
}

const recentTrackNeedle = "    tracks = await getRecentlyPlayed(telegramUserId);";
const recentTrackReplacement = `    tracks = await getRecentlyPlayed(telegramUserId);
    const currentTrack = await getCurrentTrack(telegramUserId);
    if (currentTrack && tracks[0]?.spotifyId !== currentTrack.spotifyId) {
      tracks = [currentTrack, ...tracks.filter((track) => track.spotifyId !== currentTrack.spotifyId)];
    }`;

if (source.includes(recentTrackNeedle)) {
  source = source.replace(recentTrackNeedle, recentTrackReplacement);
  changed = true;
} else if (!source.includes("const currentTrack = await getCurrentTrack(telegramUserId);")) {
  throw new Error("Could not insert currently playing lookup.");
}

if (changed) {
  writeFileSync(indexPath, source);
  console.log("Applied fresh Spotify results and encoding-safe loading UI.");
}
