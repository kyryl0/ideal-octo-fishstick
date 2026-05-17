const fs = require('fs');

const file = 'backend/shared/youtube.service.js';
let src = fs.readFileSync(file, 'utf8');

function replaceOnce(before, after, label) {
  if (src.includes(after)) return;
  if (!src.includes(before)) {
    console.error(`Could not find Spooty ${label} to patch`);
    process.exit(1);
  }
  src = src.replace(before, after);
}

const constructorBefore = 'new ytdlp_nodejs_1.YtDlp()';
const constructorAfter =
  'new ytdlp_nodejs_1.YtDlp({ binaryPath: process.env.YTDLP_BINARY_PATH || ' +
  JSON.stringify(process.env.YTDLP_PATH) +
  ' })';
replaceOnce(constructorBefore, constructorAfter, 'YtDlp constructor');

const cookiesBefore = '...this.getCookiesOptions(),';
const cookiesAfter =
  '...(process.env.YT_COOKIES_FILE && fs.existsSync(process.env.YT_COOKIES_FILE) ? { cookies: process.env.YT_COOKIES_FILE } : this.getCookiesOptions()),';
replaceOnce(cookiesBefore, cookiesAfter, 'cookie options');

const audioQualityBefore = "audioQuality: this.configService.get('QUALITY'),";
const audioQualityAfter =
  "audioQuality: this.configService.get('QUALITY'),\n                format: process.env.YTDLP_FORMAT || 'bestaudio/best',\n                verbose: process.env.YTDLP_VERBOSE === '1',";
replaceOnce(audioQualityBefore, audioQualityAfter, 'audio options');

fs.writeFileSync(file, src);
