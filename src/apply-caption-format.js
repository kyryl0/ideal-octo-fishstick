import { readFileSync, writeFileSync } from "node:fs";

const indexPath = new URL("./index.js", import.meta.url);
let source = readFileSync(indexPath, "utf8");

const welcomeMessage = `Welcome to the tiny song contraption, babe. 💅\n\nRight now I only flirt with Spotify: connect your account, then summon me inline in any chat and pick a recent track. I’ll do the audio nonsense. 🪩\n\nTiny bureaucracy jumpscare: the Spotify app is still in development mode, so if login acts allergic to you, message @kyrylo0 first and I’ll add you to the whitelist. 🧾✨`;

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
    "links.youtubeMusic ? makeHtmlLink(\"Youtube Music 😒\", links.youtubeMusic) : undefined,"
  ],
  [
    "links.youtubeMusic ? makeHtmlLink(\"Youtube Music\", links.youtubeMusic) : undefined,",
    "links.youtubeMusic ? makeHtmlLink(\"Youtube Music 😒\", links.youtubeMusic) : undefined,"
  ],
  [
    `  return [
    \`Spotify pick: \${escapeHtml(spotifyTrack.title)} - \${escapeHtml(spotifyTrack.artist)}\`,
    audio.credit ? \`Audio: \${escapeHtml(audio.credit)}\` : undefined,
    linkParts.length ? \`Listen: \${linkParts.join(" | ")}\` : undefined
  ].filter(Boolean).join("\\n");`,
    `  return linkParts.length ? \`💋 \${linkParts.join(" | ")}\` : undefined;`
  ],
  [
    `  return linkParts.length ? \`🎧 \${linkParts.join(" | ")}\` : undefined;`,
    `  return linkParts.length ? \`💋 \${linkParts.join(" | ")}\` : undefined;`
  ],
  [
    `{ text: "Loading audio...", callback_data: "loading" }`,
    `{ text: "Loading... 😵‍💫", callback_data: "loading" }`
  ],
  [
    `{ text: "Preparing...", callback_data: "loading" }`,
    `{ text: "Loading... 😵‍💫", callback_data: "loading" }`
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
