import { readFileSync, writeFileSync } from "node:fs";

const indexPath = new URL("./index.js", import.meta.url);
let source = readFileSync(indexPath, "utf8");

const replacements = [
  [
    "appleMusic: undefined,",
    "youtubeMusic: undefined,"
  ],
  [
    "appleMusic: data.linksByPlatform?.appleMusic?.url,",
    "youtubeMusic: data.linksByPlatform?.youtubeMusic?.url,"
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
  ]
];

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

if (changed) {
  writeFileSync(indexPath, source);
  console.log("Applied compact audio caption format.");
}
