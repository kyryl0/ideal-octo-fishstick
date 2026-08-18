import { readFileSync, writeFileSync } from "node:fs";

const indexPath = new URL("./index.js", import.meta.url);
let source = readFileSync(indexPath, "utf8");

const welcomeMessage = `Welcome to the tiny song contraption, babe. Ã°Å¸ââ¦\n\nRight now I only flirt with Spotify: connect your account, then summon me inline in any chat and pick a recent track. IÃ¢â¬â¢ll do the audio nonsense. Ã°Å¸ÂªÂ©\n\nTiny bureaucracy jumpscare: the Spotify app is still in development mode, so if login acts allergic to you, message @kyrylo0 first and IÃ¢â¬â¢ll add you to the whitelist. Ã°Å¸Â§Â¾Ã¢ÅÂ¨`;

const replacements = [
  [
    "appleMusic: undefined,",
    "youtubeMusic: makeYoutubeMusicSearchUrl(track),"
  ],
  [
    "youtubeMusic: undefined,",
    "youtubeMusic: makeYoutubeMusicSearchUrl(track),"
  ],
  [
    "appleMusic: data.linksByPlatform?.appleMusic?.url,",
    "youtubeMusic: data.linksByPlatform?.youtubeMusic?.url || makeYoutubeMusicSearchUrl(track),"
  ],
  [
    "youtubeMusic: data.linksByPlatform?.youtubeMusic?.url,",
    "youtubeMusic: data.linksByPlatform?.youtubeMusic?.url || makeYoutubeMusicSearchUrl(track),"
  ],
  [
    "links.appleMusic ? makeHtmlLink(\"Apple Music\", links.appleMusic) : undefined,",
    "links.youtubeMusic ? makeHtmlLink(\"Youtube Music Ã°Å¸Ëâ\", links.youtubeMusic) : undefined,"
  ],
  [
    "links.youtubeMusic ? makeHtmlLink(\"Youtube Music\", links.youtubeMusic) : undefined,",
    "links.youtubeMusic ? makeHtmlLink(\"Youtube Music Ã°Å¸Ëâ\", links.youtubeMusic) : undefined,"
  ],
  [
    `  return [
    \`Spotify pick: \${escapeHtml(spotifyTrack.title)} - \${escapeHtml(spotifyTrack.artist)}\`,
    audio.credit ? \`Audio: \${escapeHtml(audio.credit)}\` : undefined,
    linkParts.length ? \`Listen: \${linkParts.join(" | ")}\` : undefined
  ].filter(Boolean).join("\\n");`,
    `  return linkParts.length ? \`Ã°Å¸ââ¹ \${linkParts.join(" | ")}\` : undefined;`
  ],
  [
    `  return linkParts.length ? \`Ã°Å¸Å½Â§ \${linkParts.join(" | ")}\` : undefined;`,
    `  return linkParts.length ? \`Ã°Å¸ââ¹ \${linkParts.join(" | ")}\` : undefined;`
  ],
  [
    `{ text: "Loading audio...", callback_data: "loading" }`,
    `{ text: "Loading... Ã°Å¸ËÂµÃ¢â¬ÂÃ°Å¸âÂ«", callback_data: "loading" }`
  ],
  [
    `{ text: "Preparing...", callback_data: "loading" }`,
    `{ text: "Loading... Ã°Å¸ËÂµÃ¢â¬ÂÃ°Å¸âÂ«", callback_data: "loading" }`
  ],
  [
    `,
      reply_markup: {
        inline_keyboard: [[{ text: "Show recent Spotify songs", switch_inline_query_current_chat: "" }]]
      }`,
    ``
  ],
  [
    `text: "Connect Spotify, then use me inline in any chat.",`,
    `text: ${JSON.stringify(welcomeMessage)},`
  ],
  [
    "cache_time: 1,",
    "cache_time: 0,"
  ]
];

const helper = `
function makeYoutubeMusicSearchUrl(track) {
  const query = [track.title, track.artist].filter(Boolean).join(" ");
  const url = new URL("https://music.youtube.com/search");
  url.searchParams.set("q", query);
  return url.toString();
}

async function getCurrentTrack(telegramUserId) {
  const token = await getValidSpotifyToken(telegramUserId);
  const res = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
    headers: { authorization: \`Bearer \${token.access_token}\` }
  });

  if (res.status === 204) return undefined;

  if (res.status === 401) {
    delete spotifyTokens[telegramUserId];
    saveTokens();
    throw new Error("Spotify token rejected");
  }

  if (!res.ok) throw new Error(\`Spotify currently playing failed: \${res.status}\`);

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

let changed = false;

for (const [before, after] of replacements) {
  if (source.includes(before)) {
    source = source.replaceAll(before, after);
    changed = true;
    continue;
  }

  if (!source.includes(after)) {
    throw new Error(`Could not apply caption format patch. Missing pattern: ${before}`);
  }
}

if (!source.includes("function makeYoutubeMusicSearchUrl(track)")) {
  const insertionPoint = "\nfunction buildAudioCaption(spotifyTrack, audio, links) {";
  if (!source.includes(insertionPoint)) {
    throw new Error("Could not insert YouTube Music fallback helper.");
  }
  source = source.replace(insertionPoint, `${helper}${insertionPoint}`);
  changed = true;
}

if (changed) {
  writeFileSync(indexPath, source);
  console.log("Applied compact audio caption format.");
}
