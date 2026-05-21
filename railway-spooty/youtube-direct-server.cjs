const { createServer } = require("http");
const { spawn } = require("child_process");
const { createReadStream, existsSync, mkdirSync, readdirSync, rmSync, statSync } = require("fs");
const { mkdtemp } = require("fs/promises");
const { tmpdir } = require("os");
const { join } = require("path");

const PORT = Number(process.env.YOUTUBE_DIRECT_PORT || 3001);
const HOST = process.env.YOUTUBE_DIRECT_HOST || "0.0.0.0";
const YTDLP_BINARY = process.env.YTDLP_BINARY_PATH || "/usr/bin/yt-dlp";
const COOKIE_FILE = process.env.YT_COOKIES_FILE || "/spooty/config/cookies.txt";
const DEFAULT_FORMAT = process.env.FORMAT || "mp3";
const SOURCE_FORMAT = process.env.YTDLP_FORMAT || "bestaudio/best";
const MAX_BODY_BYTES = 16 * 1024;

createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") {
      sendText(res, 200, "ok");
      return;
    }

    if (req.method !== "POST" || req.url !== "/api/youtube/download") {
      sendText(res, 404, "not found");
      return;
    }

    const body = await readJsonBody(req);
    const youtubeUrl = normalizeYoutubeUrl(body.url);
    const format = normalizeFormat(body.format || DEFAULT_FORMAT);
    const tmp = await mkdtemp(join(tmpdir(), "spooty-youtube-"));

    try {
      const filePath = await downloadYoutubeAudio(youtubeUrl, format, tmp);
      const { size } = statSync(filePath);

      res.writeHead(200, {
        "content-type": mediaTypeFor(format),
        "content-length": String(size),
        "cache-control": "no-store"
      });

      createReadStream(filePath).pipe(res);
      res.on("close", () => rmSync(tmp, { recursive: true, force: true }));
    } catch (err) {
      rmSync(tmp, { recursive: true, force: true });
      throw err;
    }
  } catch (err) {
    console.error("YouTube direct download failed:", err);
    sendText(res, 500, err.message || "download failed");
  }
}).listen(PORT, HOST, () => {
  console.log(`YouTube direct download sidecar listening on ${HOST}:${PORT}`);
});

function downloadYoutubeAudio(youtubeUrl, format, tmp) {
  mkdirSync(tmp, { recursive: true });

  const outputTemplate = join(tmp, "audio.%(ext)s");
  const args = [
    "--no-playlist",
    "--extract-audio",
    "--audio-format",
    format,
    "--audio-quality",
    "0",
    "-f",
    SOURCE_FORMAT,
    "-o",
    outputTemplate
  ];

  if (existsSync(COOKIE_FILE)) {
    args.push("--cookies", COOKIE_FILE);
  }

  args.push(youtubeUrl);

  return new Promise((resolve, reject) => {
    const child = spawn(YTDLP_BINARY, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`yt-dlp exited with ${code}: ${stderr.trim()}`));
        return;
      }

      const file = readdirSync(tmp).find((name) => name.startsWith("audio."));
      if (!file) {
        reject(new Error("yt-dlp completed but no audio file was produced."));
        return;
      }

      resolve(join(tmp, file));
    });
  });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk.toString();
      if (body.length > MAX_BODY_BYTES) {
        reject(new Error("request body too large"));
        req.destroy();
      }
    });

    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("invalid JSON body"));
      }
    });

    req.on("error", reject);
  });
}

function normalizeYoutubeUrl(value) {
  if (!value) throw new Error("missing url");

  const url = new URL(String(value));
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  const allowedHosts = new Set(["youtube.com", "music.youtube.com", "m.youtube.com", "youtu.be"]);

  if (!allowedHosts.has(host)) {
    throw new Error("url must be a YouTube or YouTube Music link");
  }

  url.hash = "";
  return url.toString();
}

function normalizeFormat(value) {
  const format = String(value || "mp3").toLowerCase().replace(/^\./, "");
  if (/^[a-z0-9]+$/.test(format)) return format;
  throw new Error(`unsupported format: ${value}`);
}

function mediaTypeFor(format) {
  if (format === "mp3") return "audio/mpeg";
  if (format === "m4a") return "audio/mp4";
  if (format === "ogg" || format === "opus") return "audio/ogg";
  return "application/octet-stream";
}

function sendText(res, status, text) {
  if (res.headersSent) return;
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(text);
}
