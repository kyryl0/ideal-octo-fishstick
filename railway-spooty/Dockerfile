FROM raiper34/spooty:latest

WORKDIR /spooty

ENV YTDLP_BINARY_PATH=/usr/bin/yt-dlp
ENV YT_COOKIES_FILE=/spooty/config/cookies.txt

COPY start-spooty.sh /spooty/start-spooty.sh

RUN apk add --no-cache make g++ python3 py3-pip \
  && python3 -m pip install --break-system-packages --no-cache-dir yt-dlp \
  && yt-dlp --version \
  && chmod +x /spooty/start-spooty.sh \
  && YTDLP_PATH=$(which yt-dlp) \
  && echo "yt-dlp installed at: $YTDLP_PATH" \
  && YTDLP_PATH="$YTDLP_PATH" node -e "const fs = require('fs'); const file = 'backend/shared/youtube.service.js'; let src = fs.readFileSync(file, 'utf8'); const constructorBefore = 'new ytdlp_nodejs_1.YtDlp()'; const constructorAfter = 'new ytdlp_nodejs_1.YtDlp({ binaryPath: process.env.YTDLP_BINARY_PATH || ' + JSON.stringify(process.env.YTDLP_PATH) + ' })'; if (!src.includes(constructorBefore)) { console.error('Could not find Spooty YtDlp constructor call to patch'); process.exit(1); } src = src.replace(constructorBefore, constructorAfter); const cookiesBefore = '...this.getCookiesOptions(),'; const cookiesAfter = '...(process.env.YT_COOKIES_FILE && fs.existsSync(process.env.YT_COOKIES_FILE) ? { cookies: process.env.YT_COOKIES_FILE } : this.getCookiesOptions()),'; if (!src.includes(cookiesBefore)) { console.error('Could not find Spooty cookie options spread to patch'); process.exit(1); } src = src.replace(cookiesBefore, cookiesAfter); const downloadBefore = 'await ytdlp.downloadAudio(\n      track.youtubeUrl,\n      this.configService.get(\'FORMAT\'),\n      {'; const downloadAfter = 'try {\n      await ytdlp.downloadAudio(\n        track.youtubeUrl,\n        this.configService.get(\'FORMAT\'),\n        {'; if (!src.includes(downloadBefore)) { console.error('Could not find Spooty downloadAudio call to wrap'); process.exit(1); } src = src.replace(downloadBefore, downloadAfter); const tailBefore = '      },\n    );\n    this.logger.debug('; const tailAfter = '        },\n      );\n    } catch (err) {\n      if (!String(err?.message || err).includes(\'Requested format is not available\')) throw err;\n      this.logger.warn(\'Requested format unavailable; retrying with best available audio.\');\n      await ytdlp.downloadAudio(\n        track.youtubeUrl,\n        this.configService.get(\'FORMAT\'),\n        {\n          output,\n          ...(process.env.YT_COOKIES_FILE && fs.existsSync(process.env.YT_COOKIES_FILE) ? { cookies: process.env.YT_COOKIES_FILE } : this.getCookiesOptions()),\n          headers: HEADERS,\n          jsRuntime: \'node\',\n          audioQuality: this.configService.get(\'QUALITY\'),\n          format: \'bestaudio/best\',\n        },\n      );\n    }\n    this.logger.debug('; if (!src.includes(tailBefore)) { console.error('Could not find Spooty downloadAudio tail to patch'); process.exit(1); } src = src.replace(tailBefore, tailAfter); fs.writeFileSync(file, src);" \
  && grep -F "binaryPath" backend/shared/youtube.service.js \
  && grep -F "process.env.YT_COOKIES_FILE" backend/shared/youtube.service.js \
  && grep -F "bestaudio/best" backend/shared/youtube.service.js \
  && node -e "const { YtDlp } = require('ytdlp-nodejs'); new YtDlp({ binaryPath: process.env.YTDLP_BINARY_PATH }); console.log('yt-dlp runtime path is usable')" \
  && npm install sqlite3@5.1.7 --save \
  && node -e "require('sqlite3'); console.log('sqlite3 runtime dependency is installed')" \
  && npm cache clean --force

CMD ["/spooty/start-spooty.sh"]
