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
  `const SPOTIFY_SCOPE = "user-read-recently-played user-read-currently-playing user-read-playback-state";`
);
replaceAll("cache_time: 1,", "cache_time: 0,");
replaceAll(
  `{ text: "Loading audio...", callback_data: "loading" }`,
  `{ text: "Loading... \\u{1F504}", callback_data: "loading" }`
);
replaceAll(
  `{ text: "Preparing...", callback_data: "loading" }`,
  `{ text: "Loading... \\u{1F504}", callback_data: "loading" }`
);

const helper = `
async function getCurrentTrack(telegramUserId) {
  const token = await getValidSpotifyToken(telegramUserId);
  const headers = { authorization: "Bearer " + token.access_token, "cache-control": "no-cache" };
  let res = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
    headers,
    cache: "no-store"
  });

  if (res.status === 204) return undefined;

  // Some Spotify clients reject the narrower endpoint. The playback-state API
  // returns the same active item and is a reliable fallback with its own scope.
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

const currentTrackNeedle = "    tracks = await getRecentlyPlayed(telegramUserId);";
const currentTrackReplacement = `    tracks = await getRecentlyPlayed(telegramUserId);
    try {
      const currentTrack = await getCurrentTrack(telegramUserId);
      if (currentTrack && tracks[0]?.spotifyId !== currentTrack.spotifyId) {
        tracks = [currentTrack, ...tracks.filter((track) => track.spotifyId !== currentTrack.spotifyId)];
      }
    } catch (error) {
      console.warn("Spotify current track lookup skipped:", error.message);
    }`;

if (source.includes(currentTrackNeedle)) {
  source = source.replace(currentTrackNeedle, currentTrackReplacement);
  changed = true;
} else if (!source.includes("const currentTrack = await getCurrentTrack(telegramUserId);")) {
  throw new Error("Could not insert currently playing lookup.");
}

if (changed) {
  writeFileSync(indexPath, source);
  console.log("Restored stable Spotify inline history.");
}
